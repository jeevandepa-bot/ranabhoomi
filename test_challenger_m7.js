const { spawn } = require('child_process');
const fs = require('fs');

async function run() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9228',
    '--disable-gpu-sandbox',
    '--use-gl=angle',
    '--use-angle=d3d11',
    '--window-size=1920,1080',
    'http://localhost:8080/index.html'
  ]);

  console.log('Launched Chrome for Challenger M7 Test Suite...');
  await new Promise(r => setTimeout(r, 2000));

  let res, tabs;
  for (let i = 0; i < 15; i++) {
    try {
      res = await fetch('http://127.0.0.1:9228/json');
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

  console.log('Waiting for battlefield initialization (ModelManager + 32 activeRigs)...');
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    const evalRes = await send('Runtime.evaluate', {
      expression: 'typeof ModelManager !== "undefined" && ModelManager.isLoaded && typeof activeRigs !== "undefined" && activeRigs.length === 32',
      returnByValue: true
    });
    if (evalRes && evalRes.result && evalRes.result.value) break;
  }

  console.log('=== TEST 1: GROUNDING OF ALL 32 ACTIVE BOARD PIECES ===');
  const boardGroundingRes = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const typeNames = { 1: 'Pawn', 2: 'Knight', 3: 'Bishop', 4: 'Rook', 5: 'Queen', 6: 'King' };
        const results = [];
        for (let i = 0; i < activeRigs.length; i++) {
          const rig = activeRigs[i];
          const teamName = rig.team === TEAM_WHITE ? 'White' : 'Black';
          const typeName = typeNames[rig.type] || ('Type' + rig.type);
          
          // Compute bounding box for rig.root and rig.bodyRoot
          const rootBox = new THREE.Box3().setFromObject(rig.root);
          const bodyBox = new THREE.Box3().setFromObject(rig.bodyRoot);
          
          results.push({
            index: i,
            team: teamName,
            type: typeName,
            posX: +rig.root.position.x.toFixed(3),
            posZ: +rig.root.position.z.toFixed(3),
            rootMinY: +rootBox.min.y.toFixed(4),
            rootMaxY: +rootBox.max.y.toFixed(4),
            bodyMinY: +bodyBox.min.y.toFixed(4),
            bodyMaxY: +bodyBox.max.y.toFixed(4),
            floatingPartsCount: rig.floatingParts ? rig.floatingParts.length : -1,
            isRealistic: rig.isRealistic
          });
        }
        return results;
      })()
    `,
    returnByValue: true
  });
  const boardPieces = boardGroundingRes.result.value;
  console.log(`Evaluated ${boardPieces.length} active board pieces.`);
  
  let groundingViolations = 0;
  let floatingPartsViolations = 0;
  for (const p of boardPieces) {
    const minTolerance = -0.005;
    const maxTolerance = 0.005;
    // Check both root and bodyBox
    const rootPass = (p.rootMinY >= minTolerance && p.rootMinY <= maxTolerance);
    const bodyPass = (p.bodyMinY >= minTolerance && p.bodyMinY <= maxTolerance);
    if (!rootPass || !bodyPass) {
      console.warn(`[GROUNDING VIOLATION] Piece #${p.index} (${p.team} ${p.type}): rootMinY=${p.rootMinY}, bodyMinY=${p.bodyMinY}`);
      groundingViolations++;
    }
    if (p.floatingPartsCount !== 0) {
      console.warn(`[FLOATING PARTS VIOLATION] Piece #${p.index} (${p.team} ${p.type}): floatingPartsCount=${p.floatingPartsCount}`);
      floatingPartsViolations++;
    }
  }
  console.log(`Board Grounding Violations: ${groundingViolations} / ${boardPieces.length}`);
  console.log(`Board Floating Parts Violations: ${floatingPartsViolations} / ${boardPieces.length}`);

  console.log('\n=== TEST 2: GROUNDING OF ALL 6 PROCEDURAL RIGS (PURE PROCEDURAL FALLBACK) ===');
  const proceduralGroundingRes = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const types = [PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING];
        const names = ['Pawn', 'Knight', 'Bishop', 'Rook', 'Queen', 'King'];
        const results = [];
        
        types.forEach((t, i) => {
          const mats = getTeamMaterials(TEAM_WHITE);
          const root = new THREE.Group();
          const rig = {
            type: t,
            team: TEAM_WHITE,
            mats,
            root,
            bodyRoot: new THREE.Group(),
            torso: new THREE.Group(),
            head: new THREE.Group(),
            armL: new THREE.Group(),
            armR: new THREE.Group(),
            legL: new THREE.Group(),
            legR: new THREE.Group(),
            quadLegs: [],
            trunkSegs: [],
            wheels: [],
            floatingParts: [],
            weaponTip: new THREE.Object3D(),
            walkWeight: 0,
            animPhase: 0,
            isRealistic: false
          };
          root.add(rig.bodyRoot);
          
          // Build strictly procedural geometry
          buildProceduralUnit(rig, mats, t);
          
          const bodyBox = new THREE.Box3().setFromObject(rig.bodyRoot);
          
          results.push({
            archetype: names[i],
            type: t,
            bodyMinY: +bodyBox.min.y.toFixed(4),
            bodyMaxY: +bodyBox.max.y.toFixed(4),
            floatingPartsCount: rig.floatingParts.length
          });
        });
        return results;
      })()
    `,
    returnByValue: true
  });
  const proceduralResults = proceduralGroundingRes.result.value;
  console.table(proceduralResults);

  console.log('\n=== TEST 3: FACING INTEGRITY AT SPAWN ===');
  const facingSpawnRes = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const results = [];
        for (let i = 0; i < activeRigs.length; i++) {
          const rig = activeRigs[i];
          const teamName = rig.team === TEAM_WHITE ? 'White' : 'Black';
          
          // Calculate world forward direction
          const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(rig.root.quaternion);
          // Facing angle around Y axis
          const yaw = rig.root.rotation.y;
          
          results.push({
            index: i,
            team: teamName,
            type: rig.type,
            rotY: +yaw.toFixed(4),
            forwardZ: +forward.z.toFixed(4),
            forwardX: +forward.x.toFixed(4)
          });
        }
        return results;
      })()
    `,
    returnByValue: true
  });
  const facingSpawn = facingSpawnRes.result.value;
  let spawnFacingViolations = 0;
  for (const p of facingSpawn) {
    if (p.team === 'White') {
      // White must face -Z (yaw ≈ PI rad or -PI rad, forwardZ ≈ -1)
      const isPi = Math.abs(Math.abs(p.rotY) - Math.PI) < 0.05;
      const facesNegZ = p.forwardZ < -0.95;
      if (!isPi || !facesNegZ) {
        console.warn(`[SPAWN FACING VIOLATION] White piece #${p.index} rotY=${p.rotY}, forwardZ=${p.forwardZ}`);
        spawnFacingViolations++;
      }
    } else {
      // Black must face +Z (yaw ≈ 0 rad, forwardZ ≈ +1)
      const isZero = Math.abs(p.rotY) < 0.05;
      const facesPosZ = p.forwardZ > 0.95;
      if (!isZero || !facesPosZ) {
        console.warn(`[SPAWN FACING VIOLATION] Black piece #${p.index} rotY=${p.rotY}, forwardZ=${p.forwardZ}`);
        spawnFacingViolations++;
      }
    }
  }
  console.log(`Spawn Facing Violations: ${spawnFacingViolations} / ${facingSpawn.length}`);

  console.log('\n=== TEST 4: FACING INTEGRITY AFTER MOVEMENT ===');
  // Trigger move e2 to e4 (White Pawn)
  console.log('Executing White move: e2 (file 4, rank 1) to e4 (file 4, rank 3)...');
  const moveRes = await send('Runtime.evaluate', {
    expression: `
      (async () => {
        // Select e2
        selectSquare(4, 1);
        await new Promise(r => setTimeout(r, 200));
        // Select e4
        selectSquare(4, 3);
        // Wait for locomotion to finish
        await new Promise(r => setTimeout(r, 2000));
        
        // Find the moved piece
        const movedRig = activeRigs.find(r => r.cell && r.cell.f === 4 && r.cell.r === 3);
        if (!movedRig) return { error: 'Moved rig not found at e4' };
        
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(movedRig.root.quaternion);
        return {
          team: movedRig.team === TEAM_WHITE ? 'White' : 'Black',
          rotY: +movedRig.root.rotation.y.toFixed(4),
          forwardZ: +forward.z.toFixed(4)
        };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('Post-move White facing result:', moveRes.result.value);

  // Trigger Black move e7 to e5 (file 4, rank 6 to file 4, rank 4)
  console.log('Executing Black move: e7 (file 4, rank 6) to e5 (file 4, rank 4)...');
  const blackMoveRes = await send('Runtime.evaluate', {
    expression: `
      (async () => {
        selectSquare(4, 6);
        await new Promise(r => setTimeout(r, 200));
        selectSquare(4, 4);
        await new Promise(r => setTimeout(r, 2000));
        
        const movedRig = activeRigs.find(r => r.cell && r.cell.f === 4 && r.cell.r === 4);
        if (!movedRig) return { error: 'Moved rig not found at e5' };
        
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(movedRig.root.quaternion);
        return {
          team: movedRig.team === TEAM_WHITE ? 'White' : 'Black',
          rotY: +movedRig.root.rotation.y.toFixed(4),
          forwardZ: +forward.z.toFixed(4)
        };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('Post-move Black facing result:', blackMoveRes.result.value);

  console.log('\n=== TEST 5: FACING INTEGRITY AFTER COMBAT & KILL SEQUENCE ===');
  // Simulate combat using executeSynchronizedKillSequence directly
  console.log('Executing Combat: White Knight attacks Black Pawn...');
  const combatRes = await send('Runtime.evaluate', {
    expression: `
      (async () => {
        const atk = activeRigs.find(r => r.team === TEAM_WHITE && r.type === PIECE_KNIGHT);
        const def = activeRigs.find(r => r.team === TEAM_BLACK && r.type === PIECE_PAWN);
        
        const targetPos = new THREE.Vector3(0, 0, 0);
        await executeSynchronizedKillSequence(atk, def, targetPos, false);
        await new Promise(r => setTimeout(r, 1500));
        
        const fwdAtk = new THREE.Vector3(0, 0, 1).applyQuaternion(atk.root.quaternion);
        return {
          atkTeam: atk.team === TEAM_WHITE ? 'White' : 'Black',
          atkRotY: +atk.root.rotation.y.toFixed(4),
          atkForwardZ: +fwdAtk.z.toFixed(4),
          defHidden: !def.root.visible
        };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('Post-combat attacker facing result:', combatRes.result.value);

  console.log('\n=== TEST 6: STUDIO ARTIFACT & GEOMETRY FORENSIC AUDIT ===');
  // Switch to studio mode and inspect all 6 genuine pieces with correct data-piece IDs
  await send('Runtime.evaluate', {
    expression: `
      document.getElementById('tabStudioBtn').click();
      camState.distance = camState.targetDistance = 4.8;
      camState.pitch = camState.targetPitch = 0.28;
      camState.yaw = camState.targetYaw = 0.35;
      camState.lookPivot.set(0, 0.9, 0);
      camState.targetLookPivot.set(0, 0.9, 0);
    `
  });
  await new Promise(r => setTimeout(r, 1000));

  const piecesMap = [
    { type: 1, name: 'padati' },
    { type: 4, name: 'gajadhvaja' },
    { type: 2, name: 'ashvarohi' },
    { type: 3, name: 'ratha' },
    { type: 5, name: 'maharani' },
    { type: 6, name: 'samrat' }
  ];

  const studioAuditResults = [];

  for (const p of piecesMap) {
    const auditRes = await send('Runtime.evaluate', {
      expression: `
        (() => {
          studioPieceType = ${p.type};
          rebuildStudioCharacter();
          
          // Traverse studioGroup and find all meshes
          const meshes = [];
          studioHeroRig.root.traverse(child => {
            if (child.isMesh && child.visible) {
              const box = new THREE.Box3().setFromObject(child);
              meshes.push({
                name: child.name || 'unnamed',
                geo: child.geometry ? child.geometry.type : 'none',
                pos: { x: +child.position.x.toFixed(3), y: +child.position.y.toFixed(3), z: +child.position.z.toFixed(3) },
                boxMinY: +box.min.y.toFixed(3),
                boxMaxY: +box.max.y.toFixed(3)
              });
            }
          });
          
          return {
            piece: '${p.name}',
            type: ${p.type},
            isRealistic: studioHeroRig.isRealistic,
            totalMeshes: meshes.length,
            meshes: meshes
          };
        })()
      `,
      returnByValue: true
    });
    const info = auditRes.result.value;
    console.log(`Studio ${p.name} (type ${p.type}): isRealistic=${info.isRealistic}, visibleMeshes=${info.totalMeshes}`);
    
    // Save screenshot
    await new Promise(r => setTimeout(r, 500));
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`challenger_studio_${p.name}.png`, Buffer.from(shot.data, 'base64'));
    console.log(`Saved challenger_studio_${p.name}.png`);
    
    studioAuditResults.push(info);
  }

  // Write detailed audit log to file for handoff
  fs.writeFileSync('challenger_audit_summary.json', JSON.stringify({
    boardPieces,
    groundingViolations,
    floatingPartsViolations,
    proceduralResults,
    facingSpawn,
    spawnFacingViolations,
    moveRes: moveRes.result.value,
    blackMoveRes: blackMoveRes.result.value,
    combatRes: combatRes.result.value,
    studioAuditResults
  }, null, 2));

  console.log('\nAudit complete! Saved challenger_audit_summary.json');

  ws.close();
  chrome.kill();
}

run().catch(err => {
  console.error('Challenger test failed:', err);
  process.exit(1);
});
