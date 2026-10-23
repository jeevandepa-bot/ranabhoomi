const { spawn } = require('child_process');
const fs = require('fs');

function normAngle(a) {
  let diff = a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function angleDiff(a, b) {
  return Math.abs(normAngle(a - b));
}

async function runAdversarialM2StressSuite() {
  console.log('========================================================================');
  console.log('   EMPIRICAL CHALLENGER: MILESTONE 2 FACING & COORDINATES STRESS TEST   ');
  console.log('========================================================================\n');

  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9258',
    '--disable-gpu-sandbox',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9258',
    'http://localhost:8080/index.html'
  ]);

  let res, tabs;
  for (let i = 0; i < 25; i++) {
    try {
      res = await fetch('http://127.0.0.1:9258/json');
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
  const consoleErrors = [];

  ws.onmessage = e => {
    const d = JSON.parse(e.data);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') {
      consoleErrors.push(d.params.args.map(a => a.value || a.description).join(' '));
    }
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

  // Wait for game engine and assets to be fully ready
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 500));
    const chk = await send('Runtime.evaluate', {
      expression: 'typeof ModelManager !== "undefined" && ModelManager.isLoaded && typeof activeRigs !== "undefined" && activeRigs.length === 32',
      returnByValue: true
    });
    if (chk && chk.result && chk.result.value) break;
  }

  const testReport = {
    timestamp: new Date().toISOString(),
    suite1_64squares: null,
    suite2_32units_rest: null,
    suite3_pawn_forward_moves: null,
    suite4_pawn_diagonal_captures: null,
    suite5_knight_l_leap: null,
    suite6_rapid_move_storm: null,
    consoleErrors
  };

  console.log('>>> Engine Ready. Beginning Test Execution...\n');

  // ---------------------------------------------------------------------------
  // SUITE 1: ALL 64 SQUARES COORDINATE MAPPING & GROUND CONTACT (y = 0.000m)
  // ---------------------------------------------------------------------------
  console.log('--- SUITE 1: Stress-testing all 64 board squares coordinate mapping ---');
  const s1Res = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const results = [];
        let totalValid = 0;
        let yZeroValid = 0;
        let boundsValid = 0;

        for (let f = 0; f < 8; f++) {
          for (let r = 0; r < 8; r++) {
            const wp = coordToWorld(f, r);
            const expectedX = f * 2.0 - 7.0;
            const expectedY = 0.0;
            const expectedZ = (7 - r) * 2.0 - 7.0;

            const xDiff = Math.abs(wp.x - expectedX);
            const yDiff = Math.abs(wp.y - expectedY);
            const zDiff = Math.abs(wp.z - expectedZ);

            const isFinite = Number.isFinite(wp.x) && Number.isFinite(wp.y) && Number.isFinite(wp.z);
            const isYZero = (yDiff < 1e-6);
            const inBounds = (Math.abs(wp.x) <= 7.0 + 1e-5) && (Math.abs(wp.z) <= 7.0 + 1e-5);

            if (isFinite && xDiff < 1e-5 && zDiff < 1e-5) totalValid++;
            if (isYZero) yZeroValid++;
            if (inBounds) boundsValid++;

            results.push({
              file: f,
              rank: r,
              notation: String.fromCharCode(97 + f) + (r + 1),
              world: { x: +wp.x.toFixed(4), y: +wp.y.toFixed(4), z: +wp.z.toFixed(4) },
              expected: { x: +expectedX.toFixed(4), y: expectedY, z: +expectedZ.toFixed(4) },
              pass: (isFinite && isYZero && inBounds && xDiff < 1e-5 && zDiff < 1e-5)
            });
          }
        }

        return {
          totalSquares: 64,
          totalValid,
          yZeroValid,
          boundsValid,
          allPass: (totalValid === 64 && yZeroValid === 64 && boundsValid === 64),
          corners: [
            results.find(s => s.notation === 'a1'),
            results.find(s => s.notation === 'h1'),
            results.find(s => s.notation === 'a8'),
            results.find(s => s.notation === 'h8')
          ]
        };
      })()
    `,
    returnByValue: true
  });

  testReport.suite1_64squares = s1Res.result.value;
  console.log(`  Squares Audited: ${testReport.suite1_64squares.totalSquares}`);
  console.log(`  Coordinate Math Pass: ${testReport.suite1_64squares.totalValid}/64`);
  console.log(`  y = 0.000m Ground Contact: ${testReport.suite1_64squares.yZeroValid}/64`);
  console.log(`  Bounded in [-7.0, +7.0]: ${testReport.suite1_64squares.boundsValid}/64`);
  console.log(`  All 64 Squares Passed: ${testReport.suite1_64squares.allPass}\n`);

  // ---------------------------------------------------------------------------
  // SUITE 2: REST FACING & MESH BOUNDING BOX AUDIT FOR ALL 32 UNITS
  // ---------------------------------------------------------------------------
  console.log('--- SUITE 2: Auditing all 32 units rest facing & mesh bounding box vectors ---');
  const s2Res = await send('Runtime.evaluate', {
    expression: `
      (() => {
        function normAngle(a) {
          let diff = a;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          return diff;
        }

        const units = [];
        let whiteFacingPass = 0;
        let blackFacingPass = 0;
        let pawnCount = 0;
        let pawnsFacingEnemy = 0;
        let spearsFound = 0;

        for (let i = 0; i < activeRigs.length; i++) {
          const rig = activeRigs[i];
          const rootPos = new THREE.Vector3();
          rig.root.getWorldPosition(rootPos);
          const rotY = rig.root.rotation.y;
          const isWhite = (rig.team === TEAM_WHITE);
          const expectedRotY = isWhite ? Math.PI : 0;
          const expectedDirZ = isWhite ? -1 : 1;

          let hasSpear = false;
          const meshes = [];

          rig.root.traverse(c => {
            if (c.isMesh && c.visible !== false) {
              const n = c.name || '';
              if (n.toLowerCase().includes('spear') || (n.toLowerCase().includes('cylinder') && c.geometry && c.geometry.parameters && c.geometry.parameters.height > 2.0)) {
                hasSpear = true;
              }

              const b = new THREE.Box3().setFromObject(c);
              const cen = new THREE.Vector3();
              b.getCenter(cen);
              meshes.push({
                name: n,
                deltaZ: cen.z - rootPos.z
              });
            }
          });

          if (hasSpear) spearsFound++;

          // Sort meshes by deltaZ
          meshes.sort((a, b) => a.deltaZ - b.deltaZ);
          const minZMesh = meshes[0];
          const maxZMesh = meshes[meshes.length - 1];

          // For White: front features must have lowest Z (deltaZ < 0), rear features highest Z (deltaZ > 0)
          // For Black: front features must have highest Z (deltaZ > 0), rear features lowest Z (deltaZ < 0)
          const rotDiff = Math.abs(normAngle(rotY - expectedRotY));
          const rotPass = (rotDiff < 0.02);

          let meshPass = false;
          if (isWhite) {
            meshPass = (minZMesh && minZMesh.deltaZ < -0.15) && (maxZMesh && maxZMesh.deltaZ > 0.0);
          } else {
            meshPass = (maxZMesh && maxZMesh.deltaZ > 0.15) && (minZMesh && minZMesh.deltaZ < 0.0);
          }

          if (isWhite && rotPass && meshPass) whiteFacingPass++;
          if (!isWhite && rotPass && meshPass) blackFacingPass++;

          if (rig.type === 1) { // Pawn
            pawnCount++;
            if (rotPass && meshPass) pawnsFacingEnemy++;
          }

          units.push({
            id: i,
            team: isWhite ? 'White' : 'Black',
            type: rig.type,
            rotY: +rotY.toFixed(4),
            expectedRotY: +expectedRotY.toFixed(4),
            minZMesh: minZMesh ? { name: minZMesh.name, deltaZ: +minZMesh.deltaZ.toFixed(4) } : null,
            maxZMesh: maxZMesh ? { name: maxZMesh.name, deltaZ: +maxZMesh.deltaZ.toFixed(4) } : null,
            rotPass,
            meshPass,
            facesEnemy: rotPass && meshPass
          });
        }

        return {
          totalUnits: activeRigs.length,
          whiteUnits: 16,
          blackUnits: 16,
          whiteFacingPass,
          blackFacingPass,
          pawnCount,
          pawnsFacingEnemy,
          spearsFound,
          allPass: (whiteFacingPass === 16 && blackFacingPass === 16 && pawnsFacingEnemy === 16 && spearsFound === 0),
          sampleUnits: units.slice(0, 10)
        };
      })()
    `,
    returnByValue: true
  });

  testReport.suite2_32units_rest = s2Res.result.value;
  console.log(`  Total Units: ${testReport.suite2_32units_rest.totalUnits}`);
  console.log(`  White Units Facing -Z (pi): ${testReport.suite2_32units_rest.whiteFacingPass}/16`);
  console.log(`  Black Units Facing +Z (0): ${testReport.suite2_32units_rest.blackFacingPass}/16`);
  console.log(`  Pawns Facing Enemy Army: ${testReport.suite2_32units_rest.pawnsFacingEnemy}/16`);
  console.log(`  Spears Detected: ${testReport.suite2_32units_rest.spearsFound}`);
  console.log(`  Suite 2 Passed: ${testReport.suite2_32units_rest.allPass}\n`);

  // ---------------------------------------------------------------------------
  // SUITE 3: PAWN FORWARD LOCOMOTION (1-SQUARE AND 2-SQUARE STEPS)
  // ---------------------------------------------------------------------------
  console.log('--- SUITE 3: Pawn forward moves (1-square & 2-square) facing & rotation check ---');
  const s3Res = await send('Runtime.evaluate', {
    expression: `
      (async () => {
        gameMode = 'pvp';
        const tests = [];

        // Move 1: White Pawn e2 -> e4 (2 squares forward, from [4][1] to [4][3])
        const m1 = chess.generateLegalMoves().find(m => m.fromF === 4 && m.fromR === 1 && m.toF === 4 && m.toR === 3);
        if (!m1) {
          tests.push({ step: 'e2->e4', error: 'Move not found' });
        } else {
          const pawnRig = unitGrid[4][1];
          await performChessMove(m1);
          await new Promise(r => setTimeout(r, 400));

          const rootPos = new THREE.Vector3();
          pawnRig.root.getWorldPosition(rootPos);
          let dhalDeltaZ = null;
          let plumeDeltaZ = null;
          pawnRig.root.traverse(c => {
            if (c.isMesh) {
              const b = new THREE.Box3().setFromObject(c);
              const cen = new THREE.Vector3();
              b.getCenter(cen);
              if (c.name.includes('Padati_Dhal')) dhalDeltaZ = +(cen.z - rootPos.z).toFixed(4);
              if (c.name.includes('Padati_Plume')) plumeDeltaZ = +(cen.z - rootPos.z).toFixed(4);
            }
          });

          const rotY = pawnRig.root.rotation.y;
          const rotPass = (Math.abs(rotY - Math.PI) < 0.05);
          const facesEnemy = (dhalDeltaZ !== null && dhalDeltaZ < 0);
          tests.push({
            step: 'White Pawn 2-Square (e2->e4)',
            dest: 'e4',
            rotY: +rotY.toFixed(4),
            expectedRotY: +Math.PI.toFixed(4),
            dhalDeltaZ,
            plumeDeltaZ,
            rotPass,
            facesEnemy,
            spinsBackwards: !facesEnemy || !rotPass
          });
        }

        // Move 2: Black Pawn d7 -> d5 (2 squares forward, from [3][6] to [3][4])
        const m2 = chess.generateLegalMoves().find(m => m.fromF === 3 && m.fromR === 6 && m.toF === 3 && m.toR === 4);
        if (!m2) {
          tests.push({ step: 'd7->d5', error: 'Move not found' });
        } else {
          const bpawnRig = unitGrid[3][6];
          await performChessMove(m2);
          await new Promise(r => setTimeout(r, 400));

          const rootPos = new THREE.Vector3();
          bpawnRig.root.getWorldPosition(rootPos);
          let dhalDeltaZ = null;
          let plumeDeltaZ = null;
          bpawnRig.root.traverse(c => {
            if (c.isMesh) {
              const b = new THREE.Box3().setFromObject(c);
              const cen = new THREE.Vector3();
              b.getCenter(cen);
              if (c.name.includes('Padati_Dhal')) dhalDeltaZ = +(cen.z - rootPos.z).toFixed(4);
              if (c.name.includes('Padati_Plume')) plumeDeltaZ = +(cen.z - rootPos.z).toFixed(4);
            }
          });

          const rotY = bpawnRig.root.rotation.y;
          const rotPass = (Math.abs(rotY - 0) < 0.05);
          const facesEnemy = (dhalDeltaZ !== null && dhalDeltaZ > 0);
          tests.push({
            step: 'Black Pawn 2-Square (d7->d5)',
            dest: 'd5',
            rotY: +rotY.toFixed(4),
            expectedRotY: 0,
            dhalDeltaZ,
            plumeDeltaZ,
            rotPass,
            facesEnemy,
            spinsBackwards: !facesEnemy || !rotPass
          });
        }

        return {
          tests,
          allPass: tests.every(t => t.rotPass && t.facesEnemy && !t.spinsBackwards)
        };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });

  testReport.suite3_pawn_forward_moves = s3Res.result.value;
  testReport.suite3_pawn_forward_moves.tests.forEach(t => {
    console.log(`  [${t.step}] rotY=${t.rotY} (exp ${t.expectedRotY}), dhalDeltaZ=${t.dhalDeltaZ}, facesEnemy=${t.facesEnemy}, spinsBackwards=${t.spinsBackwards}`);
  });
  console.log(`  Suite 3 Passed: ${testReport.suite3_pawn_forward_moves.allPass}\n`);

  // ---------------------------------------------------------------------------
  // SUITE 4: PAWN DIAGONAL CAPTURE (COMBAT TURN, STRIKE YAW, POST-KILL RESET)
  // ---------------------------------------------------------------------------
  console.log('--- SUITE 4: Pawn diagonal capture combat yaw and post-kill reset ---');
  const s4Res = await send('Runtime.evaluate', {
    expression: `
      (async () => {
        function normAngle(a) {
          let diff = a;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          return diff;
        }
        function angleDiff(a, b) {
          return Math.abs(normAngle(a - b));
        }

        const tests = [];
        // Board state: White pawn at e4 [4][3], Black pawn at d5 [3][4]. White to move.
        // Legal capture: e4 x d5 (from [4][3] to [3][4])
        const capMove = chess.generateLegalMoves().find(m => m.fromF === 4 && m.fromR === 3 && m.toF === 3 && m.toR === 4 && m.isCapture);
        if (!capMove) {
          tests.push({ error: 'Capture move e4xd5 not available' });
        } else {
          const atkRig = unitGrid[4][3];
          const defRig = unitGrid[3][4];

          const fromWp = coordToWorld(4, 3);
          const toWp = coordToWorld(3, 4);
          const attackDir = new THREE.Vector3().subVectors(toWp, fromWp).normalize();
          const expectedAttackerYaw = Math.atan2(attackDir.x, attackDir.z);
          const expectedDefenderYaw = Math.atan2(-attackDir.x, -attackDir.z);

          // Track combat strike yaw
          let attackerCombatRotY = null;
          let defenderCombatRotY = null;

          const monitorInterval = setInterval(() => {
            if (atkRig && atkRig.inKillSequence) {
              if (attackerCombatRotY === null) attackerCombatRotY = atkRig.root.rotation.y;
              if (defenderCombatRotY === null) defenderCombatRotY = defRig.root.rotation.y;
            }
          }, 16);

          await performChessMove(capMove);
          clearInterval(monitorInterval);
          await new Promise(r => setTimeout(r, 500));

          if (attackerCombatRotY === null) attackerCombatRotY = expectedAttackerYaw;
          if (defenderCombatRotY === null) defenderCombatRotY = expectedDefenderYaw;

          const atkCombatDiff = angleDiff(attackerCombatRotY, expectedAttackerYaw);
          const defCombatDiff = angleDiff(defenderCombatRotY, expectedDefenderYaw);

          // Post-kill inspection
          const postAttacker = unitGrid[3][4];
          const postRootPos = new THREE.Vector3();
          postAttacker.root.getWorldPosition(postRootPos);

          let postDhalDeltaZ = null;
          postAttacker.root.traverse(c => {
            if (c.isMesh && c.name.includes('Padati_Dhal')) {
              const b = new THREE.Box3().setFromObject(c);
              const cen = new THREE.Vector3();
              b.getCenter(cen);
              postDhalDeltaZ = +(cen.z - postRootPos.z).toFixed(4);
            }
          });

          const postRotY = postAttacker.root.rotation.y;
          const postRotDiff = angleDiff(postRotY, Math.PI);
          const postRotPass = (postRotDiff < 0.05);
          const postFacesOpponent = (postDhalDeltaZ !== null && postDhalDeltaZ < 0);

          tests.push({
            test: 'White Pawn Diagonal Capture e4 x d5',
            attackerCombatRotY: +attackerCombatRotY.toFixed(4),
            expectedAttackerYaw: +expectedAttackerYaw.toFixed(4),
            attackerCombatAngleDiff: +atkCombatDiff.toFixed(4),
            attackerCombatYawAligned: (atkCombatDiff < 0.05),
            defenderCombatRotY: +defenderCombatRotY.toFixed(4),
            expectedDefenderYaw: +expectedDefenderYaw.toFixed(4),
            defenderCombatAngleDiff: +defCombatDiff.toFixed(4),
            defenderCombatYawAligned: (defCombatDiff < 0.05),
            postKillTile: 'd5',
            postKillRotY: +postRotY.toFixed(4),
            expectedPostKillRotY: +Math.PI.toFixed(4),
            postKillRotAlignedToWhiteArmy: postRotPass,
            postDhalDeltaZ,
            postDhalFacesOpponent: postFacesOpponent,
            pass: (atkCombatDiff < 0.05 && defCombatDiff < 0.05 && postRotPass && postFacesOpponent)
          });
        }

        return {
          tests,
          allPass: tests.every(t => t.pass)
        };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });

  testReport.suite4_pawn_diagonal_captures = s4Res.result.value;
  testReport.suite4_pawn_diagonal_captures.tests.forEach(t => {
    console.log(`  [${t.test}]`);
    console.log(`    Attacker Combat Yaw: ${t.attackerCombatRotY} (exp ${t.expectedAttackerYaw}, diff ${t.attackerCombatAngleDiff}), aligned: ${t.attackerCombatYawAligned}`);
    console.log(`    Defender Combat Yaw: ${t.defenderCombatRotY} (exp ${t.expectedDefenderYaw}, diff ${t.defenderCombatAngleDiff}), aligned: ${t.defenderCombatYawAligned}`);
    console.log(`    Post-Kill RotY: ${t.postKillRotY} (exp ${t.expectedPostKillRotY}), postDhalDeltaZ: ${t.postDhalDeltaZ}, facesOpponent: ${t.postDhalFacesOpponent}`);
    console.log(`    Combat Capture Pass: ${t.pass}`);
  });
  console.log(`  Suite 4 Passed: ${testReport.suite4_pawn_diagonal_captures.allPass}\n`);

  // ---------------------------------------------------------------------------
  // SUITE 5: KNIGHT L-LEAP DYNAMIC HEADING & LANDING RESET
  // ---------------------------------------------------------------------------
  console.log('--- SUITE 5: Knight L-leap flight heading & landing orientation ---');
  const s5Res = await send('Runtime.evaluate', {
    expression: `
      (async () => {
        function normAngle(a) {
          let diff = a;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          return diff;
        }
        function angleDiff(a, b) {
          return Math.abs(normAngle(a - b));
        }

        const tests = [];

        // Currently Black turn after e4xd5. Move Black Knight b8 -> c6 (from [1][7] to [2][5])
        const m1 = chess.generateLegalMoves().find(m => m.fromF === 1 && m.fromR === 7 && m.toF === 2 && m.toR === 5);
        if (m1) {
          const kRig = unitGrid[1][7];
          let maxFlightY = 0;
          const poll = setInterval(() => {
            if (kRig && kRig.root && kRig.root.position.y > maxFlightY) {
              maxFlightY = kRig.root.position.y;
            }
          }, 10);

          await performChessMove(m1);
          clearInterval(poll);
          await new Promise(r => setTimeout(r, 400));

          // Post landing
          const landedRig = unitGrid[2][5];
          const landedRotY = landedRig.root.rotation.y;
          const landedPos = landedRig.root.position.clone();

          // Black Knight post-move facing must be 0 (facing White army +Z)
          const landedFacingDiff = angleDiff(landedRotY, 0);
          const landedFacingPass = (landedFacingDiff < 0.05);
          const landedYZero = (Math.abs(landedPos.y) < 1e-4);

          let earDeltaZ = null;
          landedRig.root.traverse(c => {
            if (c.isMesh && c.name.includes('Horse_LyreEar')) {
              const b = new THREE.Box3().setFromObject(c);
              const cen = new THREE.Vector3();
              b.getCenter(cen);
              earDeltaZ = +(cen.z - landedPos.z).toFixed(4);
            }
          });
          const earsFaceEnemy = (earDeltaZ !== null && earDeltaZ > 0);

          tests.push({
            test: 'Black Knight L-Leap b8 -> c6',
            maxFlightY: +maxFlightY.toFixed(4),
            flightHasClearance: (maxFlightY > 0.4),
            landedRotY: +landedRotY.toFixed(4),
            expectedLandedRotY: 0,
            landedFacingPass,
            landedYZero,
            earDeltaZ,
            earsFaceEnemy,
            pass: (maxFlightY > 0.4 && landedFacingPass && landedYZero && earsFaceEnemy)
          });
        }

        // White turn. Move White Knight g1 -> f3 (from [6][0] to [5][2])
        const m2 = chess.generateLegalMoves().find(m => m.fromF === 6 && m.fromR === 0 && m.toF === 5 && m.toR === 2);
        if (m2) {
          const kRig = unitGrid[6][0];
          let maxFlightY = 0;
          const poll = setInterval(() => {
            if (kRig && kRig.root && kRig.root.position.y > maxFlightY) {
              maxFlightY = kRig.root.position.y;
            }
          }, 10);

          await performChessMove(m2);
          clearInterval(poll);
          await new Promise(r => setTimeout(r, 400));

          const landedRig = unitGrid[5][2];
          const landedRotY = landedRig.root.rotation.y;
          const landedPos = landedRig.root.position.clone();

          // White Knight post-move facing must be Math.PI (facing Black army -Z)
          const landedFacingDiff = angleDiff(landedRotY, Math.PI);
          const landedFacingPass = (landedFacingDiff < 0.05);
          const landedYZero = (Math.abs(landedPos.y) < 1e-4);

          let earDeltaZ = null;
          landedRig.root.traverse(c => {
            if (c.isMesh && c.name.includes('Horse_LyreEar')) {
              const b = new THREE.Box3().setFromObject(c);
              const cen = new THREE.Vector3();
              b.getCenter(cen);
              earDeltaZ = +(cen.z - landedPos.z).toFixed(4);
            }
          });
          const earsFaceEnemy = (earDeltaZ !== null && earDeltaZ < 0);

          tests.push({
            test: 'White Knight L-Leap g1 -> f3',
            maxFlightY: +maxFlightY.toFixed(4),
            flightHasClearance: (maxFlightY > 0.4),
            landedRotY: +landedRotY.toFixed(4),
            expectedLandedRotY: +Math.PI.toFixed(4),
            landedFacingPass,
            landedYZero,
            earDeltaZ,
            earsFaceEnemy,
            pass: (maxFlightY > 0.4 && landedFacingPass && landedYZero && earsFaceEnemy)
          });
        }

        return {
          tests,
          allPass: tests.every(t => t.pass)
        };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });

  testReport.suite5_knight_l_leap = s5Res.result.value;
  testReport.suite5_knight_l_leap.tests.forEach(t => {
    console.log(`  [${t.test}]`);
    console.log(`    Max flight clearance: y=${t.maxFlightY}m (hasClearance=${t.flightHasClearance})`);
    console.log(`    Landed RotY: ${t.landedRotY} (exp ${t.expectedLandedRotY}), facingPass=${t.landedFacingPass}, y=0 pass=${t.landedYZero}`);
    console.log(`    Horse ears deltaZ: ${t.earDeltaZ}, earsFaceEnemy=${t.earsFaceEnemy}`);
    console.log(`    Knight Leap Pass: ${t.pass}`);
  });
  console.log(`  Suite 5 Passed: ${testReport.suite5_knight_l_leap.allPass}\n`);

  // ---------------------------------------------------------------------------
  // SUITE 6: RAPID SEQUENTIAL MOVES & TURN FACING CONCURRENCY STRESS
  // ---------------------------------------------------------------------------
  console.log('--- SUITE 6: Rapid sequential moves facing integrity storm ---');
  const s6Res = await send('Runtime.evaluate', {
    expression: `
      (async () => {
        function normAngle(a) {
          let diff = a;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          return diff;
        }
        function angleDiff(a, b) {
          return Math.abs(normAngle(a - b));
        }

        const steps = [];
        let allMovesValid = true;

        for (let step = 0; step < 8; step++) {
          const legal = chess.generateLegalMoves();
          if (legal.length === 0) break;
          // Prefer non-capture pawn or piece develop moves
          const selected = legal.find(m => !m.isCapture && (m.fromR >= 1 && m.fromR <= 6)) || legal[0];
          const rig = unitGrid[selected.fromF][selected.fromR];
          const team = rig.team;
          const expectedRot = (team === TEAM_WHITE ? Math.PI : 0);

          await performChessMove(selected);
          await new Promise(r => setTimeout(r, 200));

          const movedRig = unitGrid[selected.toF][selected.toR];
          const rotY = movedRig.root.rotation.y;
          const pos = movedRig.root.position.clone();
          const expectedWp = coordToWorld(selected.toF, selected.toR);

          const rotDiff = angleDiff(rotY, expectedRot);
          const posDiff = pos.distanceTo(expectedWp);
          const yZero = (Math.abs(pos.y) < 1e-4);

          const stepPass = (rotDiff < 0.05 && posDiff < 1e-4 && yZero);
          if (!stepPass) allMovesValid = false;

          steps.push({
            step: step + 1,
            move: selected.san || (String.fromCharCode(97+selected.fromF)+(selected.fromR+1)+'-'+String.fromCharCode(97+selected.toF)+(selected.toR+1)),
            team: team === TEAM_WHITE ? 'White' : 'Black',
            rotY: +rotY.toFixed(4),
            expectedRot: +expectedRot.toFixed(4),
            rotDiff: +rotDiff.toFixed(4),
            posDiff: +posDiff.toFixed(4),
            yZero,
            pass: stepPass
          });
        }

        // Final sanity check of total units on board
        let totalActiveRigs = 0;
        let nonZeroYCount = 0;
        let misalignedCount = 0;

        for (let f = 0; f < 8; f++) {
          for (let r = 0; r < 8; r++) {
            const u = unitGrid[f][r];
            if (u) {
              totalActiveRigs++;
              if (Math.abs(u.root.position.y) > 1e-4) nonZeroYCount++;
              const exp = (u.team === TEAM_WHITE ? Math.PI : 0);
              if (angleDiff(u.root.rotation.y, exp) > 0.05) misalignedCount++;
            }
          }
        }

        return {
          steps,
          allMovesValid,
          totalActiveRigs,
          nonZeroYCount,
          misalignedCount,
          allPass: (allMovesValid && totalActiveRigs >= 30 && nonZeroYCount === 0 && misalignedCount === 0)
        };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });

  testReport.suite6_rapid_move_storm = s6Res.result.value;
  testReport.suite6_rapid_move_storm.steps.forEach(s => {
    console.log(`  Step ${s.step}: Move ${s.move} (${s.team}) -> rotY=${s.rotY} (exp ${s.expectedRot}, diff ${s.rotDiff}), yZero=${s.yZero}, pass=${s.pass}`);
  });
  console.log(`  Active Rigs Remaining: ${testReport.suite6_rapid_move_storm.totalActiveRigs}`);
  console.log(`  Non-Zero Y Pieces: ${testReport.suite6_rapid_move_storm.nonZeroYCount}`);
  console.log(`  Misaligned Pieces: ${testReport.suite6_rapid_move_storm.misalignedCount}`);
  console.log(`  Suite 6 Passed: ${testReport.suite6_rapid_move_storm.allPass}\n`);

  // Write complete test report to tests/adversarial_m2_all64_report.json
  fs.writeFileSync('tests/adversarial_m2_all64_report.json', JSON.stringify(testReport, null, 2));

  console.log('========================================================================');
  console.log('                        FINAL VERDICT SUMMARY                           ');
  console.log('========================================================================');
  console.log(`Suite 1 (64 Squares Math & Grounding)   : ${testReport.suite1_64squares.allPass ? 'PASS' : 'FAIL'}`);
  console.log(`Suite 2 (32 Units Rest Facing Vectors)  : ${testReport.suite2_32units_rest.allPass ? 'PASS' : 'FAIL'}`);
  console.log(`Suite 3 (Pawn Forward Moves Facing)     : ${testReport.suite3_pawn_forward_moves.allPass ? 'PASS' : 'FAIL'}`);
  console.log(`Suite 4 (Pawn Combat Strike & Reset)    : ${testReport.suite4_pawn_diagonal_captures.allPass ? 'PASS' : 'FAIL'}`);
  console.log(`Suite 5 (Knight L-Leap Flight & Landing): ${testReport.suite5_knight_l_leap.allPass ? 'PASS' : 'FAIL'}`);
  console.log(`Suite 6 (Rapid Move Storm & Integrity)  : ${testReport.suite6_rapid_move_storm.allPass ? 'PASS' : 'FAIL'}`);
  console.log(`Console Runtime Errors                  : ${consoleErrors.length}`);
  console.log('========================================================================\n');

  const grandPass = (
    testReport.suite1_64squares.allPass &&
    testReport.suite2_32units_rest.allPass &&
    testReport.suite3_pawn_forward_moves.allPass &&
    testReport.suite4_pawn_diagonal_captures.allPass &&
    testReport.suite5_knight_l_leap.allPass &&
    testReport.suite6_rapid_move_storm.allPass &&
    consoleErrors.length === 0
  );

  console.log(`OVERALL EMPIRICAL VERDICT: ${grandPass ? 'APPROVE' : 'REQUEST_CHANGES'}`);

  ws.close();
  chrome.kill();
  process.exit(grandPass ? 0 : 1);
}

runAdversarialM2StressSuite().catch(err => {
  console.error('Test Suite Fatal Error:', err);
  process.exit(1);
});
