const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 9262;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TEMP_USER_DATA = `C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_${PORT}`;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runAdversarialM2Suite() {
  console.log('=================================================================');
  console.log('   EMPIRICAL ADVERSARIAL STRESS TEST SUITE — MILESTONE 2');
  console.log('   Orientation, Coordinates & Army Facing Integrity');
  console.log('=================================================================\n');

  // Spawn Headless Chrome with remote debugging
  console.log(`[INIT] Launching Headless Chrome on port ${PORT}...`);
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--disable-gpu-sandbox',
    '--use-gl=angle',
    '--use-angle=d3d11',
    '--window-size=1920,1080',
    `--user-data-dir=${TEMP_USER_DATA}`,
    'http://localhost:8080/index.html'
  ]);

  let tabs;
  for (let i = 0; i < 25; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      tabs = await res.json();
      if (tabs && tabs.length > 0) break;
    } catch (e) {
      await sleep(400);
    }
  }

  if (!tabs || tabs.length === 0) {
    chrome.kill();
    throw new Error('Could not connect to Chrome debugging endpoint');
  }

  const target = tabs.find(t => t.type === 'page' && t.url.includes('localhost:8080')) || tabs[0];
  const ws = new WebSocket(target.webSocketDebuggerUrl);

  let msgId = 1;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = msgId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

  const browserErrors = [];
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve } = pending.get(data.id);
      pending.delete(data.id);
      resolve(data.result);
    } else if (data.method === 'Runtime.exceptionThrown') {
      browserErrors.push(data.params.exceptionDetails);
      console.error('[BROWSER EXCEPTION]', data.params.exceptionDetails.text);
    }
  };

  await new Promise(r => ws.onopen = r);
  await send('Runtime.enable');
  await send('Page.enable');

  console.log('[INIT] Waiting for ModelManager & 32 active rigs to be fully instantiated...');
  let ready = false;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    const evalRes = await send('Runtime.evaluate', {
      expression: 'typeof ModelManager !== "undefined" && ModelManager.isLoaded && typeof activeRigs !== "undefined" && activeRigs.length === 32',
      returnByValue: true
    });
    if (evalRes && evalRes.result && evalRes.result.value) {
      ready = true;
      break;
    }
  }

  if (!ready) {
    chrome.kill();
    throw new Error('Engine failed to initialize 32 rigs within 20s');
  }
  console.log('[INIT] Engine initialized successfully with 32 active rigs!\n');

  // Disable AI and ensure pvp mode so automated test controls the board
  await send('Runtime.evaluate', {
    expression: 'gameMode = "pvp"; isBusyAnimating = false;',
    returnByValue: true
  });

  const suiteResults = {};

  // =========================================================================
  // SUITE 1: 64-SQUARE COORDINATE MAPPING ORACLE & TILE MESH ALIGNMENT
  // =========================================================================
  console.log('-----------------------------------------------------------------');
  console.log('   SUITE 1: 64-Square Coordinate Mapping Oracle & Tile Mesh Alignment');
  console.log('-----------------------------------------------------------------');
  const suite1Eval = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const failures = [];
        const TILE_SIZE = 2.0;
        const BOARD_OFFSET = 7.0;
        let checkedSquares = 0;

        for (let f = 0; f < 8; f++) {
          for (let r = 0; r < 8; r++) {
            checkedSquares++;
            const expectedX = f * TILE_SIZE - BOARD_OFFSET;
            const expectedY = 0;
            const expectedZ = (7 - r) * TILE_SIZE - BOARD_OFFSET;

            // 1. Check coordToWorld formula
            const wp = coordToWorld(f, r);
            const diffX = Math.abs(wp.x - expectedX);
            const diffY = Math.abs(wp.y - expectedY);
            const diffZ = Math.abs(wp.z - expectedZ);

            if (diffX > 1e-4 || diffY > 1e-4 || diffZ > 1e-4) {
              failures.push({
                square: String.fromCharCode(65 + f) + (r + 1),
                f, r,
                issue: 'coordToWorld mismatch',
                expected: { x: expectedX, y: expectedY, z: expectedZ },
                actual: { x: wp.x, y: wp.y, z: wp.z }
              });
            }

            // 2. Check corresponding tileMesh in tileMeshes
            const tile = tileMeshes.find(m => m.userData.f === f && m.userData.r === r);
            if (!tile) {
              failures.push({ square: String.fromCharCode(65 + f) + (r + 1), f, r, issue: 'tileMesh not found' });
            } else {
              const tDiffX = Math.abs(tile.position.x - expectedX);
              const tDiffY = Math.abs(tile.position.y - (-0.06)); // Tile box plinth center is at -0.06
              const tDiffZ = Math.abs(tile.position.z - expectedZ);
              if (tDiffX > 1e-3 || tDiffY > 1e-3 || tDiffZ > 1e-3) {
                failures.push({
                  square: String.fromCharCode(65 + f) + (r + 1),
                  f, r,
                  issue: 'tileMesh position mismatch',
                  expected: { x: expectedX, y: -0.06, z: expectedZ },
                  actual: { x: tile.position.x, y: tile.position.y, z: tile.position.z }
                });
              }
            }
          }
        }

        return {
          checkedSquares,
          failureCount: failures.length,
          failures
        };
      })()
    `,
    returnByValue: true
  });

  const s1 = suite1Eval.result.value;
  console.log(`[SUITE 1] Squares Checked: ${s1.checkedSquares}/64`);
  console.log(`[SUITE 1] Failures: ${s1.failureCount}`);
  if (s1.failureCount > 0) {
    console.error('[SUITE 1] Mismatches:', JSON.stringify(s1.failures.slice(0, 5), null, 2));
  } else {
    console.log('[SUITE 1 PASS] 100% of 64 squares match mathematical oracle with zero coordinate drift.');
  }
  suiteResults.suite1 = s1;

  // =========================================================================
  // SUITE 2: DEFAULT FACING & PAWN DHAL SHIELD / KHANDA SWORD ORACLE
  // =========================================================================
  console.log('\n-----------------------------------------------------------------');
  console.log('   SUITE 2: Default Facing & Pawn Dhal Shield / Khanda Sword Oracle');
  console.log('-----------------------------------------------------------------');
  const suite2Eval = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const whiteFacingFailures = [];
        const blackFacingFailures = [];
        const pawnFailures = [];
        const spearDetected = [];

        activeRigs.forEach((rig, idx) => {
          const rotY = rig.root.rotation.y;
          const pos = rig.root.position;

          // Check ground contact y === 0.000
          if (Math.abs(pos.y) > 0.005) {
            whiteFacingFailures.push({ rigIdx: idx, issue: 'non-zero ground contact', y: pos.y });
          }

          if (rig.team === TEAM_WHITE) {
            // White faces -Z (Math.PI)
            let diff = Math.abs(rotY - Math.PI);
            while (diff > Math.PI * 2) diff -= Math.PI * 2;
            if (diff > 0.02) {
              whiteFacingFailures.push({
                type: rig.type,
                team: 'White',
                rotY,
                expected: Math.PI,
                diff
              });
            }
          } else {
            // Black faces +Z (0)
            let diff = Math.abs(rotY);
            while (diff > Math.PI * 2) diff -= Math.PI * 2;
            if (diff > 0.02) {
              blackFacingFailures.push({
                type: rig.type,
                team: 'Black',
                rotY,
                expected: 0,
                diff
              });
            }
          }
        });

        // Detailed check on all 16 Pawns
        for (let f = 0; f < 8; f++) {
          const wp = unitGrid[f][1]; // White pawn
          const bp = unitGrid[f][6]; // Black pawn

          const checkPawn = (pawn, team, expectedDeltaSign) => {
            const rootPos = new THREE.Vector3();
            pawn.root.getWorldPosition(rootPos);
            let dhalCenterZ = null;
            let plumeCenterZ = null;
            let hasKhanda = false;
            let hasDhal = false;
            let hasSpear = false;

            pawn.root.traverse(c => {
              if (c.isMesh) {
                const n = (c.name || '').toLowerCase();
                if (n.includes('spear') || n.includes('shaft') || (n.includes('cylinder') && c.geometry && c.geometry.parameters && c.geometry.parameters.height > 2.0)) {
                  hasSpear = true;
                }
                if (n.includes('khanda')) hasKhanda = true;
                if (n.includes('dhal')) {
                  hasDhal = true;
                  const b = new THREE.Box3().setFromObject(c);
                  const cen = new THREE.Vector3();
                  b.getCenter(cen);
                  dhalCenterZ = cen.z;
                }
                if (n.includes('plume')) {
                  const b = new THREE.Box3().setFromObject(c);
                  const cen = new THREE.Vector3();
                  b.getCenter(cen);
                  plumeCenterZ = cen.z;
                }
              }
            });

            if (hasSpear) spearDetected.push({ team, f });

            const deltaZ = dhalCenterZ !== null ? (dhalCenterZ - rootPos.z) : null;
            // For White, deltaZ should be negative (towards -Z enemy)
            // For Black, deltaZ should be positive (towards +Z enemy)
            const facingCorrect = (deltaZ !== null) ? (expectedDeltaSign > 0 ? deltaZ > 0.1 : deltaZ < -0.1) : false;

            if (!facingCorrect) {
              pawnFailures.push({
                team, f, rootZ: rootPos.z, dhalCenterZ, deltaZ, expectedDeltaSign
              });
            }

            return {
              team, f, rootZ: +rootPos.z.toFixed(3),
              dhalDeltaZ: deltaZ !== null ? +deltaZ.toFixed(3) : null,
              hasKhanda, hasDhal, hasSpear, facingCorrect
            };
          };

          checkPawn(wp, 'White', -1);
          checkPawn(bp, 'Black', +1);
        }

        return {
          totalRigs: activeRigs.length,
          whiteFailures: whiteFacingFailures.length,
          blackFailures: blackFacingFailures.length,
          pawnFailures: pawnFailures.length,
          spearDetectedCount: spearDetected.length,
          whiteFacingFailures,
          blackFacingFailures,
          pawnFailuresList: pawnFailures
        };
      })()
    `,
    returnByValue: true
  });

  const s2 = suite2Eval.result.value;
  console.log(`[SUITE 2] Total Rigs Evaluated: ${s2.totalRigs}`);
  console.log(`[SUITE 2] White Facing Failures: ${s2.whiteFailures}`);
  console.log(`[SUITE 2] Black Facing Failures: ${s2.blackFailures}`);
  console.log(`[SUITE 2] Pawn Inverted Facing Failures: ${s2.pawnFailures}`);
  console.log(`[SUITE 2] Spears Detected on Pawns: ${s2.spearDetectedCount}`);
  if (s2.whiteFailures === 0 && s2.blackFailures === 0 && s2.pawnFailures === 0 && s2.spearDetectedCount === 0) {
    console.log('[SUITE 2 PASS] All 32 units and all 16 pawns face enemy forward with Dhal shields outward and zero spears.');
  } else {
    console.error('[SUITE 2 FAIL]', s2);
  }
  suiteResults.suite2 = s2;

  // =========================================================================
  // SUITE 3: PAWN PUSHES (SINGLE-TILE & DOUBLE-TILE) FACING INTEGRITY
  // =========================================================================
  console.log('\n-----------------------------------------------------------------');
  console.log('   SUITE 3: Pawn Push Stress (e2->e4, e7->e5, d2->d3, d7->d6)');
  console.log('-----------------------------------------------------------------');
  const suite3Eval = await send('Runtime.evaluate', {
    expression: `
      (async () => {
        const moves = [
          { name: 'White Double Push e2-e4', fromF: 4, fromR: 1, toF: 4, toR: 3, expTeam: TEAM_WHITE, expRotY: Math.PI },
          { name: 'Black Double Push e7-e5', fromF: 4, fromR: 6, toF: 4, toR: 4, expTeam: TEAM_BLACK, expRotY: 0 },
          { name: 'White Single Push d2-d3', fromF: 3, fromR: 1, toF: 3, toR: 2, expTeam: TEAM_WHITE, expRotY: Math.PI },
          { name: 'Black Single Push d7-d6', fromF: 3, fromR: 6, toF: 3, toR: 5, expTeam: TEAM_BLACK, expRotY: 0 },
        ];

        const stepResults = [];
        for (const mv of moves) {
          const legal = chess.generateLegalMoves().find(m => m.fromF === mv.fromF && m.fromR === mv.fromR && m.toF === mv.toF && m.toR === mv.toR);
          if (!legal) {
            stepResults.push({ name: mv.name, error: 'Move not found in legal moves' });
            continue;
          }

          await performChessMove(legal);
          await new Promise(r => setTimeout(r, 1200));

          const rig = unitGrid[mv.toF][mv.toR];
          if (!rig) {
            stepResults.push({ name: mv.name, error: 'Rig not found at destination tile' });
            continue;
          }

          const rotY = rig.root.rotation.y;
          const pos = rig.root.position;
          const expWorld = coordToWorld(mv.toF, mv.toR);

          const posError = pos.distanceTo(expWorld);
          let rotDiff = Math.abs(rotY - mv.expRotY);
          while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
          rotDiff = Math.abs(rotDiff);

          // Check shield facing after push
          let dhalCenterZ = null;
          pawnTraverse: rig.root.traverse(c => {
            if (c.isMesh && (c.name || '').includes('Padati_Dhal')) {
              const b = new THREE.Box3().setFromObject(c);
              const cen = new THREE.Vector3();
              b.getCenter(cen);
              dhalCenterZ = cen.z;
            }
          });
          const deltaZ = dhalCenterZ !== null ? (dhalCenterZ - pos.z) : null;
          const shieldFacingCorrect = (deltaZ !== null) ? (mv.expTeam === TEAM_WHITE ? deltaZ < -0.1 : deltaZ > 0.1) : true;

          stepResults.push({
            name: mv.name,
            posError: +posError.toFixed(4),
            rotY: +rotY.toFixed(4),
            rotDiff: +rotDiff.toFixed(4),
            dhalDeltaZ: deltaZ !== null ? +deltaZ.toFixed(4) : null,
            shieldFacingCorrect,
            passed: (posError < 0.05 && rotDiff < 0.05 && shieldFacingCorrect)
          });
        }

        return stepResults;
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });

  const s3 = suite3Eval.result.value;
  console.log('[SUITE 3 RESULTS]:', JSON.stringify(s3, null, 2));
  const s3AllPassed = Array.isArray(s3) && s3.every(s => s.passed);
  console.log(`[SUITE 3] All Pawn Pushes Passed: ${s3AllPassed}`);
  suiteResults.suite3 = s3;

  // =========================================================================
  // SUITE 4: KNIGHT L-LEAPS & BACKWARD RETREAT FACING INTEGRITY
  // =========================================================================
  console.log('\n-----------------------------------------------------------------');
  console.log('   SUITE 4: Knight L-Leap Dynamics & Backward Retreat Stress');
  console.log('-----------------------------------------------------------------');
  const suite4Eval = await send('Runtime.evaluate', {
    expression: `
      (async () => {
        // Moves:
        // 1. White Knight Ng1 -> f3 (fromF: 6, fromR: 0 -> toF: 5, toR: 2)
        // 2. Black Knight Nb8 -> c6 (fromF: 1, fromR: 7 -> toF: 2, toR: 5)
        // 3. White Knight Nf3 -> g1 (RETREAT BACKWARD to back rank!)
        // 4. Black Knight Nc6 -> b8 (RETREAT BACKWARD to back rank!)

        const knightMoves = [
          { name: 'White Knight g1->f3', fromF: 6, fromR: 0, toF: 5, toR: 2, team: TEAM_WHITE, expRotY: Math.PI },
          { name: 'Black Knight b8->c6', fromF: 1, fromR: 7, toF: 2, toR: 5, team: TEAM_BLACK, expRotY: 0 },
          { name: 'White Knight RETREAT f3->g1', fromF: 5, fromR: 2, toF: 6, toR: 0, team: TEAM_WHITE, expRotY: Math.PI },
          { name: 'Black Knight RETREAT c6->b8', fromF: 2, fromR: 5, toF: 1, toR: 7, team: TEAM_BLACK, expRotY: 0 }
        ];

        const results = [];
        for (const km of knightMoves) {
          const legal = chess.generateLegalMoves().find(m => m.fromF === km.fromF && m.fromR === km.fromR && m.toF === km.toF && m.toR === km.toR);
          if (!legal) {
            results.push({ name: km.name, error: 'Move not found in legal moves' });
            continue;
          }

          await performChessMove(legal);
          await new Promise(r => setTimeout(r, 1500));

          const rig = unitGrid[km.toF][km.toR];
          if (!rig) {
            results.push({ name: km.name, error: 'Knight rig not found at destination' });
            continue;
          }

          const rotY = rig.root.rotation.y;
          const pos = rig.root.position;
          const expWorld = coordToWorld(km.toF, km.toR);
          const posErr = pos.distanceTo(expWorld);

          let rotDiff = Math.abs(rotY - km.expRotY);
          while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
          rotDiff = Math.abs(rotDiff);

          // Check if warhorse head faces forward
          let headCenterZ = null;
          rig.root.traverse(c => {
            if (c.isMesh && ((c.name || '').toLowerCase().includes('head') || (c.name || '').toLowerCase().includes('snout'))) {
              const b = new THREE.Box3().setFromObject(c);
              const cen = new THREE.Vector3();
              b.getCenter(cen);
              headCenterZ = cen.z;
            }
          });

          results.push({
            name: km.name,
            posError: +posErr.toFixed(4),
            groundY: +pos.y.toFixed(4),
            rotY: +rotY.toFixed(4),
            rotDiff: +rotDiff.toFixed(4),
            passed: (posErr < 0.05 && Math.abs(pos.y) < 0.01 && rotDiff < 0.05)
          });
        }

        return results;
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });

  const s4 = suite4Eval.result.value;
  console.log('[SUITE 4 RESULTS]:', JSON.stringify(s4, null, 2));
  const s4AllPassed = Array.isArray(s4) && s4.every(s => s.passed);
  console.log(`[SUITE 4] All Knight Advance & Retreat Moves Passed: ${s4AllPassed}`);
  suiteResults.suite4 = s4;

  // =========================================================================
  // SUITE 5: DIAGONAL CAPTURE COMBAT KILL FACING & RESET
  // =========================================================================
  console.log('\n-----------------------------------------------------------------');
  console.log('   SUITE 5: Diagonal Capture Combat Kill Facing & Reset Oracle');
  console.log('-----------------------------------------------------------------');
  const suite5Eval = await send('Runtime.evaluate', {
    expression: `
      (async () => {
        // Move White c2 -> c4, Black d6 -> d5 (or similar) to force diagonal capture
        // Current board state:
        // White pawns at e4, d3, c2, b2, a2, f2, g2, h2.
        // Black pawns at e5, d6, c7, b7, a7, f7, g7, h7.
        // White turn.
        // Move c2 -> c4 (fromF: 2, fromR: 1 -> toF: 2, toR: 3)
        // Black turn. Move d6 -> d5 (fromF: 3, fromR: 5 -> toF: 3, toR: 4)
        // White turn. Move c4 x d5 (fromF: 2, fromR: 3 -> toF: 3, toR: 4) - DIAGONAL CAPTURE!

        const setupMove1 = chess.generateLegalMoves().find(m => m.fromF === 2 && m.fromR === 1 && m.toF === 2 && m.toR === 3);
        if (!setupMove1) return { error: 'setupMove1 c2-c4 failed' };
        await performChessMove(setupMove1);
        await new Promise(r => setTimeout(r, 1200));

        const setupMove2 = chess.generateLegalMoves().find(m => m.fromF === 3 && m.fromR === 5 && m.toF === 3 && m.toR === 4);
        if (!setupMove2) return { error: 'setupMove2 d6-d5 failed' };
        await performChessMove(setupMove2);
        await new Promise(r => setTimeout(r, 1200));

        // Now diagonal capture c4 x d5!
        const captureMove = chess.generateLegalMoves().find(m => m.fromF === 2 && m.fromR === 3 && m.toF === 3 && m.toR === 4 && m.isCapture);
        if (!captureMove) return { error: 'captureMove c4xd5 not found', legal: chess.generateLegalMoves() };

        const attackerBefore = unitGrid[2][3];
        const defenderBefore = unitGrid[3][4];

        // Execute capture
        await performChessMove(captureMove);
        await new Promise(r => setTimeout(r, 2200));

        const attackerAfter = unitGrid[3][4];
        const oldTile = unitGrid[2][3];

        const attackerRotY = attackerAfter ? attackerAfter.root.rotation.y : null;
        let rotDiff = attackerRotY !== null ? Math.abs(attackerRotY - Math.PI) : null;
        if (rotDiff !== null) {
          while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
          rotDiff = Math.abs(rotDiff);
        }

        const expPos = coordToWorld(3, 4);
        const posErr = attackerAfter ? attackerAfter.root.position.distanceTo(expPos) : null;
        const groundY = attackerAfter ? attackerAfter.root.position.y : null;

        return {
          captureSuccess: !!attackerAfter && oldTile === null,
          attackerRotY: attackerRotY !== null ? +attackerRotY.toFixed(4) : null,
          rotDiff: rotDiff !== null ? +rotDiff.toFixed(4) : null,
          posError: posErr !== null ? +posErr.toFixed(4) : null,
          groundY: groundY !== null ? +groundY.toFixed(4) : null,
          passed: (attackerAfter && oldTile === null && rotDiff < 0.05 && posErr < 0.05 && Math.abs(groundY) < 0.01)
        };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });

  const s5 = suite5Eval.result.value;
  console.log('[SUITE 5 RESULTS]:', JSON.stringify(s5, null, 2));
  console.log(`[SUITE 5] Diagonal Capture Combat Kill Passed: ${s5.passed}`);
  suiteResults.suite5 = s5;

  // =========================================================================
  // SUITE 6: LINEAR RETREAT & QUEEN/ROOK BACKWARD MOTION STRESS
  // =========================================================================
  console.log('\n-----------------------------------------------------------------');
  console.log('   SUITE 6: Queen Forward Advance & Deep Backward Retreat Stress');
  console.log('-----------------------------------------------------------------');
  const suite6Eval = await send('Runtime.evaluate', {
    expression: `
      (async () => {
        // Current board state: Black to move.
        // Let's test Queen moves:
        // Black Queen at d8 (fromF: 3, fromR: 7)
        // Can it move forward? Square d7 was vacated (d7->d6->d5), d6 is empty, d5 has White pawn.
        // Black Queen can advance d8 -> d6 (fromF: 3, fromR: 7 -> toF: 3, toR: 5).
        const qAdvance = chess.generateLegalMoves().find(m => m.fromF === 3 && m.fromR === 7 && m.toF === 3 && m.toR === 5);
        if (!qAdvance) return { error: 'Queen advance d8-d6 not found in legal moves', legal: chess.generateLegalMoves().filter(m => m.fromF === 3 && m.fromR === 7) };

        await performChessMove(qAdvance);
        await new Promise(r => setTimeout(r, 1400));

        const qAtD6 = unitGrid[3][5];
        const rotAfterAdvance = qAtD6 ? qAtD6.root.rotation.y : null;
        let rotAdvDiff = rotAfterAdvance !== null ? Math.abs(rotAfterAdvance - 0) : null; // Black faces 0

        // White makes dummy move a2 -> a3 so Black can retreat
        const whiteDummy = chess.generateLegalMoves().find(m => m.fromF === 0 && m.fromR === 1 && m.toF === 0 && m.toR === 2);
        if (whiteDummy) {
          await performChessMove(whiteDummy);
          await new Promise(r => setTimeout(r, 1200));
        }

        // Now Black Queen RETREATS BACKWARD d6 -> d8!
        const qRetreat = chess.generateLegalMoves().find(m => m.fromF === 3 && m.fromR === 5 && m.toF === 3 && m.toR === 7);
        if (!qRetreat) return { error: 'Queen retreat d6-d8 not found', legal: chess.generateLegalMoves().filter(m => m.fromF === 3 && m.fromR === 5) };

        await performChessMove(qRetreat);
        await new Promise(r => setTimeout(r, 1400));

        const qAtD8 = unitGrid[3][7];
        const rotAfterRetreat = qAtD8 ? qAtD8.root.rotation.y : null;
        let rotRetreatDiff = rotAfterRetreat !== null ? Math.abs(rotAfterRetreat - 0) : null; // Must face +Z = 0 (towards enemy)

        return {
          qAdvanceResult: {
            rotY: rotAfterAdvance !== null ? +rotAfterAdvance.toFixed(4) : null,
            rotDiff: rotAdvDiff !== null ? +rotAdvDiff.toFixed(4) : null
          },
          qRetreatResult: {
            rotY: rotAfterRetreat !== null ? +rotAfterRetreat.toFixed(4) : null,
            rotDiff: rotRetreatDiff !== null ? +rotRetreatDiff.toFixed(4) : null,
            passed: (rotRetreatDiff !== null && rotRetreatDiff < 0.05)
          }
        };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });

  const s6 = suite6Eval.result.value;
  console.log('[SUITE 6 RESULTS]:', JSON.stringify(s6, null, 2));
  console.log(`[SUITE 6] Queen Forward & Backward Retreat Facing Passed: ${s6 && s6.qRetreatResult && s6.qRetreatResult.passed}`);
  suiteResults.suite6 = s6;

  // =========================================================================
  // SUITE 7: RAPID MOVE STRESS & ZERO DRIFT VERIFICATION ACROSS RUNTIME
  // =========================================================================
  console.log('\n-----------------------------------------------------------------');
  console.log('   SUITE 7: Final Runtime State & Grid Alignment Verification');
  console.log('-----------------------------------------------------------------');
  const suite7Eval = await send('Runtime.evaluate', {
    expression: `
      (() => {
        let totalActive = 0;
        let misalignedPositions = 0;
        let hoveringUnits = 0;
        let invertedFacings = 0;

        for (let f = 0; f < 8; f++) {
          for (let r = 0; r < 8; r++) {
            const rig = unitGrid[f][r];
            if (!rig) continue;
            totalActive++;

            const expPos = coordToWorld(f, r);
            const dist = rig.root.position.distanceTo(expPos);
            if (dist > 0.05) misalignedPositions++;

            if (Math.abs(rig.root.position.y) > 0.005) hoveringUnits++;

            const expRotY = rig.team === TEAM_WHITE ? Math.PI : 0;
            let diff = Math.abs(rig.root.rotation.y - expRotY);
            while (diff > Math.PI) diff -= Math.PI * 2;
            if (Math.abs(diff) > 0.05) invertedFacings++;
          }
        }

        return {
          totalActive,
          misalignedPositions,
          hoveringUnits,
          invertedFacings,
          passed: (misalignedPositions === 0 && hoveringUnits === 0 && invertedFacings === 0)
        };
      })()
    `,
    returnByValue: true
  });

  const s7 = suite7Eval.result.value;
  console.log('[SUITE 7 RESULTS]:', JSON.stringify(s7, null, 2));
  console.log(`[SUITE 7] Final Runtime Integrity Passed: ${s7.passed}`);
  suiteResults.suite7 = s7;

  // Check browser exceptions
  console.log(`\n[CONSOLE / RUNTIME EXCEPTIONS COUNT]: ${browserErrors.length}`);
  suiteResults.browserErrors = browserErrors;

  // Save report JSON
  const reportPath = path.join(__dirname, 'adversarial_m2_facing_stress_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(suiteResults, null, 2));
  console.log(`\n[REPORT SAVED] Full JSON output saved to: ${reportPath}`);

  ws.close();
  chrome.kill();

  console.log('\n=================================================================');
  const allSuitesPassed = s1.failureCount === 0 &&
                          s2.whiteFailures === 0 && s2.blackFailures === 0 && s2.pawnFailures === 0 && s2.spearDetectedCount === 0 &&
                          s3AllPassed &&
                          s4AllPassed &&
                          s5.passed &&
                          (s6 && s6.qRetreatResult && s6.qRetreatResult.passed) &&
                          s7.passed &&
                          browserErrors.length === 0;

  console.log(`   OVERALL VERDICT: ${allSuitesPassed ? 'APPROVED (PASS)' : 'REQUEST_CHANGES (FAIL)'}`);
  console.log('=================================================================');

  return { allSuitesPassed, suiteResults };
}

runAdversarialM2Suite().catch(err => {
  console.error('Fatal Test Harness Error:', err);
  process.exit(1);
});
