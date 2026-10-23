const { spawn } = require('child_process');
const fs = require('fs');

async function runComprehensiveAdversarialTest() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9266',
    '--disable-gpu-sandbox',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9266',
    'http://localhost:8080/index.html'
  ]);

  let res, tabs;
  for (let i = 0; i < 25; i++) {
    try {
      res = await fetch('http://127.0.0.1:9266/json');
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
  ws.onmessage = e => {
    const d = JSON.parse(e.data);
    if (d.id && p.has(d.id)) {
      p.get(d.id)(d.result);
      p.delete(d.id);
    }
  };
  const send = (m, a = {}) => new Promise(r => {
    const i = id++;
    p.set(i, r);
    ws.send(JSON.stringify({ id: i, method: m, params: a }));
  });
  await new Promise(r => ws.onopen = r);
  await send('Runtime.enable');

  // Wait for ModelManager.isLoaded && activeRigs.length === 32
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 400));
    const chk = await send('Runtime.evaluate', {
      expression: 'typeof ModelManager !== "undefined" && ModelManager.isLoaded && typeof activeRigs !== "undefined" && activeRigs.length === 32',
      returnByValue: true
    });
    if (chk && chk.result && chk.result.value) break;
  }

  // 1. Audit all 32 units mesh-level bounding box bounds (THREE.Box3)
  const audit32Res = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const units = [];
        const typeNames = { 1: 'Pawn', 2: 'Knight', 3: 'Bishop', 4: 'Rook', 5: 'Queen', 6: 'King' };
        
        let allFacingPass = true;
        let whiteFacingFailures = 0;
        let blackFacingFailures = 0;
        let invertedScaleDetected = false;

        for (let i = 0; i < activeRigs.length; i++) {
          const rig = activeRigs[i];
          const rootPos = new THREE.Vector3();
          rig.root.getWorldPosition(rootPos);
          const teamStr = rig.team === TEAM_WHITE ? 'White' : 'Black';
          const typeStr = typeNames[rig.type] || 'Unknown';
          const cellStr = rig.cell ? (String.fromCharCode(65 + rig.cell.f) + (rig.cell.r + 1)) : ('Unit_' + i);
          
          // White enemy forward is -Z. Black enemy forward is +Z.
          const expectedEnemyDirZ = rig.team === TEAM_WHITE ? -1 : +1;

          // Check scales of rig and children
          if (rig.root.scale.x < 0 || rig.root.scale.y < 0 || rig.root.scale.z < 0) {
            invertedScaleDetected = true;
          }

          const meshes = [];
          rig.root.traverse(c => {
            if (c.isMesh && c.visible !== false) {
              if (c.scale.x < 0 || c.scale.y < 0 || c.scale.z < 0) {
                invertedScaleDetected = true;
              }
              const bbox = new THREE.Box3().setFromObject(c);
              const center = new THREE.Vector3();
              bbox.getCenter(center);
              meshes.push({
                name: c.name || 'unnamed',
                centerZ: +center.z.toFixed(4),
                deltaZ: +(center.z - rootPos.z).toFixed(4),
                minZ: +bbox.min.z.toFixed(4),
                maxZ: +bbox.max.z.toFixed(4),
                bboxSize: {
                  x: +(bbox.max.x - bbox.min.x).toFixed(3),
                  y: +(bbox.max.y - bbox.min.y).toFixed(3),
                  z: +(bbox.max.z - bbox.min.z).toFixed(3)
                }
              });
            }
          });

          meshes.sort((a, b) => a.deltaZ - b.deltaZ);
          const minZMesh = meshes[0];
          const maxZMesh = meshes[meshes.length - 1];

          let frontFeature = null;
          let rearFeature = null;
          let frontCorrect = false;
          let featureDeltaDiff = null;

          if (rig.type === 1) { // Pawn
            const dhal = meshes.find(m => m.name.includes('Padati_Dhal_CenterBoss') || m.name.includes('Padati_Dhal'));
            const khanda = meshes.find(m => m.name.includes('Khanda_Tip') || m.name.includes('Khanda'));
            const plume = meshes.find(m => m.name.includes('Padati_Plume'));
            frontFeature = dhal || khanda;
            rearFeature = plume;
            if (frontFeature && rearFeature) {
              // White: frontFeature.deltaZ < rearFeature.deltaZ AND frontFeature.deltaZ < 0
              // Black: frontFeature.deltaZ > rearFeature.deltaZ AND frontFeature.deltaZ > 0
              if (expectedEnemyDirZ === -1) {
                frontCorrect = (frontFeature.deltaZ < rearFeature.deltaZ) && (frontFeature.deltaZ < 0);
                featureDeltaDiff = +(rearFeature.deltaZ - frontFeature.deltaZ).toFixed(4);
              } else {
                frontCorrect = (frontFeature.deltaZ > rearFeature.deltaZ) && (frontFeature.deltaZ > 0);
                featureDeltaDiff = +(frontFeature.deltaZ - rearFeature.deltaZ).toFixed(4);
              }
            } else if (frontFeature) {
              frontCorrect = (expectedEnemyDirZ === -1) ? (frontFeature.deltaZ < 0) : (frontFeature.deltaZ > 0);
            }
          } else if (rig.type === 4) { // Rook (Gajraj)
            const tusk = meshes.find(m => m.name.includes('Elephant_Tusk'));
            const kada = meshes.find(m => m.name.includes('Elephant_Kada'));
            frontFeature = tusk;
            rearFeature = kada;
            if (frontFeature && rearFeature) {
              if (expectedEnemyDirZ === -1) {
                frontCorrect = (frontFeature.deltaZ < rearFeature.deltaZ) && (frontFeature.deltaZ < 0);
                featureDeltaDiff = +(rearFeature.deltaZ - frontFeature.deltaZ).toFixed(4);
              } else {
                frontCorrect = (frontFeature.deltaZ > rearFeature.deltaZ) && (frontFeature.deltaZ > 0);
                featureDeltaDiff = +(frontFeature.deltaZ - rearFeature.deltaZ).toFixed(4);
              }
            } else if (frontFeature) {
              frontCorrect = (expectedEnemyDirZ === -1) ? (frontFeature.deltaZ < 0) : (frontFeature.deltaZ > 0);
            }
          } else if (rig.type === 2) { // Knight (Ashvarohi)
            const ear = meshes.find(m => m.name.includes('Horse_LyreEar'));
            const body = meshes.find(m => m.name.includes('Horse_Body'));
            frontFeature = ear;
            rearFeature = body;
            if (frontFeature && rearFeature) {
              if (expectedEnemyDirZ === -1) {
                frontCorrect = (frontFeature.deltaZ < rearFeature.deltaZ) && (frontFeature.deltaZ < 0);
                featureDeltaDiff = +(rearFeature.deltaZ - frontFeature.deltaZ).toFixed(4);
              } else {
                frontCorrect = (frontFeature.deltaZ > rearFeature.deltaZ) && (frontFeature.deltaZ > 0);
                featureDeltaDiff = +(frontFeature.deltaZ - rearFeature.deltaZ).toFixed(4);
              }
            }
          } else if (rig.type === 3) { // Bishop (Ratha)
            const varutha = meshes.find(m => m.name.includes('Chariot_Varutha'));
            const flagstaff = meshes.find(m => m.name.includes('Chariot_Flagstaff'));
            frontFeature = varutha;
            rearFeature = flagstaff;
            if (frontFeature && rearFeature) {
              if (expectedEnemyDirZ === -1) {
                frontCorrect = (frontFeature.deltaZ < rearFeature.deltaZ) && (frontFeature.deltaZ < 0);
                featureDeltaDiff = +(rearFeature.deltaZ - frontFeature.deltaZ).toFixed(4);
              } else {
                frontCorrect = (frontFeature.deltaZ > rearFeature.deltaZ) && (frontFeature.deltaZ > 0);
                featureDeltaDiff = +(frontFeature.deltaZ - rearFeature.deltaZ).toFixed(4);
              }
            }
          } else if (rig.type === 5) { // Queen (Maharani)
            const khanda = meshes.find(m => m.name.includes('Khanda') || m.name.includes('Blade'));
            const mantle = meshes.find(m => m.name.includes('Maharani_Mantle') || m.name.includes('Mantle'));
            frontFeature = minZMesh.deltaZ < 0 && expectedEnemyDirZ === -1 ? minZMesh : maxZMesh;
            rearFeature = mantle || (expectedEnemyDirZ === -1 ? maxZMesh : minZMesh);
            if (expectedEnemyDirZ === -1) {
              frontCorrect = minZMesh.deltaZ < -0.2 && (mantle ? mantle.deltaZ > 0 : true);
            } else {
              frontCorrect = maxZMesh.deltaZ > 0.2 && (mantle ? mantle.deltaZ < 0 : true);
            }
          } else if (rig.type === 6) { // King (Samrat)
            const chhatra = meshes.find(m => m.name.includes('Chhatra'));
            if (expectedEnemyDirZ === -1) {
              frontCorrect = minZMesh.deltaZ < -0.3 && (chhatra ? chhatra.deltaZ > 0 : true);
            } else {
              frontCorrect = maxZMesh.deltaZ > 0.3 && (chhatra ? chhatra.deltaZ < 0 : true);
            }
            frontFeature = expectedEnemyDirZ === -1 ? minZMesh : maxZMesh;
            rearFeature = chhatra || (expectedEnemyDirZ === -1 ? maxZMesh : minZMesh);
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
            featureDeltaDiff,
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
          invertedScaleDetected,
          units
        };
      })()
    `,
    returnByValue: true
  });

  // 2. Multi-move Combat Capture and Reset Stress Suite
  const multiCombatRes = await send('Runtime.evaluate', {
    expression: `
      (async () => {
        gameMode = 'pvp';
        const combatScenarios = [];

        // Move 1: White Pawn e2 -> e4
        const m1 = chess.generateLegalMoves().find(m => m.fromF === 4 && m.fromR === 1 && m.toF === 4 && m.toR === 3);
        await performChessMove(m1);
        await new Promise(r => setTimeout(r, 1200));

        // Move 2: Black Pawn d7 -> d5
        const m2 = chess.generateLegalMoves().find(m => m.fromF === 3 && m.fromR === 6 && m.toF === 3 && m.toR === 4);
        await performChessMove(m2);
        await new Promise(r => setTimeout(r, 1200));

        // Move 3: White Pawn e4 x d5 (Diagonal Capture)
        const m3 = chess.generateLegalMoves().find(m => m.fromF === 4 && m.fromR === 3 && m.toF === 3 && m.toR === 4 && m.isCapture);
        if (m3) {
          const atkRig = unitGrid[4][3];
          const defRig = unitGrid[3][4];
          const fromWp = coordToWorld(4, 3);
          const toWp = coordToWorld(3, 4);
          const dir = new THREE.Vector3().subVectors(toWp, fromWp).normalize();
          const expectedCombatYaw = Math.atan2(dir.x, dir.z);

          const movePromise = performChessMove(m3);
          await new Promise(r => setTimeout(r, 700)); // check mid-combat
          const combatYaw = +atkRig.root.rotation.y.toFixed(4);

          await movePromise;
          await new Promise(r => setTimeout(r, 2000)); // wait for kill animation & reset

          const postKillUnit = unitGrid[3][4];
          const postKillYaw = +postKillUnit.root.rotation.y.toFixed(4);
          const expectedResetYaw = +Math.PI.toFixed(4);

          // Check front feature post-kill
          let dhalDeltaZ = null;
          const postPos = new THREE.Vector3();
          postKillUnit.root.getWorldPosition(postPos);
          postKillUnit.root.traverse(c => {
            if (c.isMesh && c.name && c.name.includes('Padati_Dhal')) {
              const b = new THREE.Box3().setFromObject(c);
              const cen = new THREE.Vector3();
              b.getCenter(cen);
              dhalDeltaZ = +(cen.z - postPos.z).toFixed(4);
            }
          });

          combatScenarios.push({
            name: 'White Pawn Diagonal Capture e4xd5',
            attackerYawDuringCombat: combatYaw,
            expectedCombatYaw: +expectedCombatYaw.toFixed(4),
            combatYawAligned: Math.abs(combatYaw - expectedCombatYaw) < 0.05,
            postKillYaw,
            expectedResetYaw,
            postKillYawReset: Math.abs(postKillYaw - expectedResetYaw) < 0.05,
            postDhalDeltaZ: dhalDeltaZ,
            postDhalFacingEnemy: dhalDeltaZ !== null ? (dhalDeltaZ < 0) : null
          });
        }

        // Move 4: Black Queen d8 x d5 (Black Queen recapture)
        const m4 = chess.generateLegalMoves().find(m => m.fromF === 3 && m.fromR === 7 && m.toF === 3 && m.toR === 4 && m.isCapture);
        if (m4) {
          const bqRig = unitGrid[3][7];
          const fromWp = coordToWorld(3, 7);
          const toWp = coordToWorld(3, 4);
          const dir = new THREE.Vector3().subVectors(toWp, fromWp).normalize();
          const expectedCombatYaw = Math.atan2(dir.x, dir.z);

          const movePromise = performChessMove(m4);
          await new Promise(r => setTimeout(r, 700));
          const combatYaw = +bqRig.root.rotation.y.toFixed(4);

          await movePromise;
          await new Promise(r => setTimeout(r, 2000));

          const postKillQueen = unitGrid[3][4];
          const postKillYaw = +postKillQueen.root.rotation.y.toFixed(4);
          const expectedResetYaw = 0; // Black canonical army facing is 0 (+Z)

          // Check Queen front meshes post-kill (should face +Z)
          const postPos = new THREE.Vector3();
          postKillQueen.root.getWorldPosition(postPos);
          const meshes = [];
          postKillQueen.root.traverse(c => {
            if (c.isMesh && c.visible !== false) {
              const b = new THREE.Box3().setFromObject(c);
              const cen = new THREE.Vector3();
              b.getCenter(cen);
              meshes.push({ name: c.name, deltaZ: +(cen.z - postPos.z).toFixed(4) });
            }
          });
          meshes.sort((a, b) => a.deltaZ - b.deltaZ);
          const maxZMesh = meshes[meshes.length - 1];

          combatScenarios.push({
            name: 'Black Queen Orthogonal Recapture d8xd5',
            attackerYawDuringCombat: combatYaw,
            expectedCombatYaw: +expectedCombatYaw.toFixed(4),
            combatYawAligned: Math.abs(combatYaw - expectedCombatYaw) < 0.05,
            postKillYaw,
            expectedResetYaw,
            postKillYawReset: Math.abs(postKillYaw - expectedResetYaw) < 0.05,
            postFrontMeshMaxZ: maxZMesh,
            postFrontFacingEnemy: maxZMesh.deltaZ > 0.2
          });
        }

        // Move 5: White Knight b1 -> c3 (Knight developing move)
        const m5 = chess.generateLegalMoves().find(m => m.fromF === 1 && m.fromR === 0 && m.toF === 2 && m.toR === 2);
        if (m5) {
          await performChessMove(m5);
          await new Promise(r => setTimeout(r, 1500));
          const knight = unitGrid[2][2];
          const postMoveYaw = +knight.root.rotation.y.toFixed(4);
          const expectedResetYaw = +Math.PI.toFixed(4);

          // Check Knight ears
          const postPos = new THREE.Vector3();
          knight.root.getWorldPosition(postPos);
          let earDeltaZ = null;
          knight.root.traverse(c => {
            if (c.isMesh && c.name && c.name.includes('Horse_LyreEar')) {
              const b = new THREE.Box3().setFromObject(c);
              const cen = new THREE.Vector3();
              b.getCenter(cen);
              earDeltaZ = +(cen.z - postPos.z).toFixed(4);
            }
          });

          combatScenarios.push({
            name: 'White Knight Ballistic L-Move b1->c3',
            postMoveYaw,
            expectedResetYaw,
            postMoveYawReset: Math.abs(postMoveYaw - expectedResetYaw) < 0.05,
            earDeltaZ,
            earFacingEnemy: earDeltaZ !== null ? (earDeltaZ < 0) : null
          });
        }

        return combatScenarios;
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });

  ws.close();
  chrome.kill();

  const report = {
    timestamp: new Date().toISOString(),
    audit32: audit32Res.result.value,
    combatScenarios: multiCombatRes.result.value
  };

  fs.writeFileSync('challenger_m2_r2_2_comprehensive_report.json', JSON.stringify(report, null, 2));
  console.log('=== CHALLENGER M2 R2_2 COMPREHENSIVE TEST RESULTS ===');
  console.log('Total Units Audited:', report.audit32.totalUnits);
  console.log('All Facing Pass:', report.audit32.allFacingPass);
  console.log('White Facing Failures:', report.audit32.whiteFacingFailures + '/16');
  console.log('Black Facing Failures:', report.audit32.blackFacingFailures + '/16');
  console.log('Inverted Scale Detected:', report.audit32.invertedScaleDetected);
  console.log('\nAll 32 Units Detailed Facing:');
  report.audit32.units.forEach(u => {
    console.log(`[${u.id.toString().padStart(2)}] ${u.team.padEnd(5)} ${u.type.padEnd(6)} at ${u.cell.padEnd(7)}: rootZ=${u.rootZ.toFixed(2).padStart(6)}, rotY=${u.rootRotY.toFixed(4).padStart(7)}, front=${u.frontFeature ? u.frontFeature.name + '(' + u.frontFeature.deltaZ + ')' : 'none'}, diff=${u.featureDeltaDiff}, pass=${u.frontCorrect}`);
  });

  console.log('\nCombat & Locomotion Orientation Reset Scenarios:');
  report.combatScenarios.forEach(cs => {
    console.log(`Scenario: ${cs.name}`);
    console.log(`  Combat/Move Yaw: ${cs.attackerYawDuringCombat ?? 'N/A'}, Expected: ${cs.expectedCombatYaw ?? 'N/A'}, Aligned: ${cs.combatYawAligned ?? 'N/A'}`);
    console.log(`  Post-Action Yaw: ${cs.postKillYaw ?? cs.postMoveYaw}, Expected Reset: ${cs.expectedResetYaw}, Reset OK: ${cs.postKillYawReset ?? cs.postMoveYawReset}`);
    console.log(`  Post-Action Front Facing Enemy: ${cs.postDhalFacingEnemy ?? cs.postFrontFacingEnemy ?? cs.earFacingEnemy}`);
  });
}

runComprehensiveAdversarialTest().catch(console.error);
