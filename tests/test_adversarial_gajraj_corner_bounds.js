const { spawn } = require('child_process');
const fs = require('fs');

async function runGajrajAdversarialCornerTest() {
  console.log('========================================================================');
  console.log('   EMPIRICAL CHALLENGER: GAJRAJ & CORNER BOUNDS SPATIAL STRESS TEST     ');
  console.log('========================================================================\n');

  const chromePort = 9259;
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    `--remote-debugging-port=${chromePort}`,
    '--disable-gpu-sandbox',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    `--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_${chromePort}`,
    'http://localhost:8080/index.html'
  ]);

  let res, tabs;
  for (let i = 0; i < 25; i++) {
    try {
      res = await fetch(`http://127.0.0.1:${chromePort}/json`);
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

  console.log('Waiting for ModelManager and activeRigs (32 units)...');
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 500));
    const chk = await send('Runtime.evaluate', {
      expression: 'typeof ModelManager !== "undefined" && ModelManager.isLoaded && typeof activeRigs !== "undefined" && activeRigs.length === 32',
      returnByValue: true
    });
    if (chk && chk.result && chk.result.value) break;
  }

  const evalRes = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const BOARD_MIN = -8.0;
        const BOARD_MAX = 8.0;
        const TILE_HALF = 1.0;

        const typeNames = { 1: 'Pawn', 2: 'Knight', 3: 'Bishop', 4: 'Rook', 5: 'Queen', 6: 'King' };

        const allUnits = [];
        let totalUnitsPass = true;
        let widthFailures = 0;
        let facingFailures = 0;
        let groundingFailures = 0;

        for (let i = 0; i < activeRigs.length; i++) {
          const rig = activeRigs[i];
          const isWhite = (rig.team === TEAM_WHITE);
          const expectedRotY = isWhite ? Math.PI : 0;
          const expectedEnemyDirZ = isWhite ? -1 : 1;

          const rootPos = new THREE.Vector3();
          rig.root.getWorldPosition(rootPos);

          const overallBox = new THREE.Box3().setFromObject(rig.root);
          const size = new THREE.Vector3();
          overallBox.getSize(size);

          const meshes = [];
          rig.root.traverse(c => {
            if (c.isMesh && c.visible !== false) {
              const b = new THREE.Box3().setFromObject(c);
              const cen = new THREE.Vector3();
              b.getCenter(cen);
              meshes.push({
                name: c.name || 'unnamed',
                box: {
                  min: { x: +b.min.x.toFixed(4), y: +b.min.y.toFixed(4), z: +b.min.z.toFixed(4) },
                  max: { x: +b.max.x.toFixed(4), y: +b.max.y.toFixed(4), z: +b.max.z.toFixed(4) }
                },
                deltaZ: +(cen.z - rootPos.z).toFixed(4),
                deltaX: +(cen.x - rootPos.x).toFixed(4)
              });
            }
          });

          // Sort by deltaZ to find front/rear
          meshes.sort((a, b) => a.deltaZ - b.deltaZ);
          const minZMesh = meshes[0];
          const maxZMesh = meshes[meshes.length - 1];

          // Check facing
          let frontFeature = null;
          let frontCorrect = false;

          if (rig.type === 4) { // Rook (Elephant)
            const tusk = meshes.find(m => m.name.includes('Tusk') || m.name.includes('Ferrule'));
            const trunk = meshes.find(m => m.name.includes('Trunk'));
            frontFeature = tusk || trunk;
            if (frontFeature) {
              frontCorrect = (expectedEnemyDirZ === -1) ? (frontFeature.deltaZ < 0) : (frontFeature.deltaZ > 0);
            }
          } else {
            frontCorrect = (expectedEnemyDirZ === -1) ? (minZMesh && minZMesh.deltaZ < -0.1) : (maxZMesh && maxZMesh.deltaZ > 0.1);
          }

          if (!frontCorrect) facingFailures++;

          // Width check: size.x <= 1.72m
          const widthPass = size.x <= 1.72 + 0.01;
          if (!widthPass) widthFailures++;

          // Grounding check: overallBox.min.y in [-0.005, 0.005]
          const groundingPass = Math.abs(overallBox.min.y) <= 0.005;
          if (!groundingPass) groundingFailures++;

          allUnits.push({
            id: i,
            cell: rig.cell ? (String.fromCharCode(65 + rig.cell.f) + (rig.cell.r + 1)) : ('Unit_' + i),
            team: isWhite ? 'White' : 'Black',
            type: typeNames[rig.type] || 'Unknown',
            typeId: rig.type,
            root: { x: +rootPos.x.toFixed(3), y: +rootPos.y.toFixed(3), z: +rootPos.z.toFixed(3) },
            rotY: +rig.root.rotation.y.toFixed(4),
            overallBox: {
              min: { x: +overallBox.min.x.toFixed(4), y: +overallBox.min.y.toFixed(4), z: +overallBox.min.z.toFixed(4) },
              max: { x: +overallBox.max.x.toFixed(4), y: +overallBox.max.y.toFixed(4), z: +overallBox.max.z.toFixed(4) }
            },
            size: { x: +size.x.toFixed(4), y: +size.y.toFixed(4), z: +size.z.toFixed(4) },
            frontFeature,
            frontCorrect,
            widthPass,
            groundingPass
          });
        }

        // Specifically analyze the 4 corner War Elephants (Rooks) on A1, H1, A8, H8
        const cornerRooks = [
          { notation: 'A1', file: 0, rank: 0, team: 'White' },
          { notation: 'H1', file: 7, rank: 0, team: 'White' },
          { notation: 'A8', file: 0, rank: 7, team: 'Black' },
          { notation: 'H8', file: 7, rank: 7, team: 'Black' }
        ].map(sq => {
          const rig = unitGrid[sq.file][sq.rank];
          if (!rig) return { notation: sq.notation, error: 'No rig found on square' };

          const rootPos = new THREE.Vector3();
          rig.root.getWorldPosition(rootPos);
          const box = new THREE.Box3().setFromObject(rig.root);
          const size = new THREE.Vector3();
          box.getSize(size);

          // Tile center and boundaries
          const tileCenterX = sq.file * 2.0 - 7.0;
          const tileCenterZ = (7 - sq.rank) * 2.0 - 7.0;
          const tileMinX = tileCenterX - TILE_HALF;
          const tileMaxX = tileCenterX + TILE_HALF;
          const tileMinZ = tileCenterZ - TILE_HALF;
          const tileMaxZ = tileCenterZ + TILE_HALF;

          // Distance to board perimeter ([-8.0, 8.0])
          const marginToOuterBoardX = Math.min(Math.abs(box.min.x - BOARD_MIN), Math.abs(BOARD_MAX - box.max.x));
          const marginToOuterBoardZ = Math.min(Math.abs(box.min.z - BOARD_MIN), Math.abs(BOARD_MAX - box.max.z));

          // Lateral tile margins (|X - tileCenterX|)
          const lateralOverhang = Math.max(0, box.max.x - tileMaxX, tileMinX - box.min.x);
          const lateralMarginInsideTile = TILE_HALF - (size.x / 2.0);

          // Distance to adjacent Knight (file 1 or 6)
          const adjKnightFile = (sq.file === 0) ? 1 : 6;
          const adjKnightRig = unitGrid[adjKnightFile][sq.rank];
          let clearanceToKnight = null;
          if (adjKnightRig) {
            const knightBox = new THREE.Box3().setFromObject(adjKnightRig.root);
            if (sq.file === 0) {
              clearanceToKnight = knightBox.min.x - box.max.x;
            } else {
              clearanceToKnight = box.min.x - knightBox.max.x;
            }
          }

          // Distance to adjacent Pawn (rank 1 or 6)
          const adjPawnRank = (sq.rank === 0) ? 1 : 6;
          const adjPawnRig = unitGrid[sq.file][adjPawnRank];
          let clearanceToPawn = null;
          if (adjPawnRig) {
            const pawnBox = new THREE.Box3().setFromObject(adjPawnRig.root);
            if (sq.rank === 0) {
              // White Elephant faces -Z, Pawn is at Z = 5.0 (rank 1)
              clearanceToPawn = box.min.z - pawnBox.max.z;
            } else {
              // Black Elephant faces +Z, Pawn is at Z = -5.0 (rank 6)
              clearanceToPawn = pawnBox.min.z - box.max.z;
            }
          }

          // Tusks inspection
          const tuskMeshes = [];
          rig.root.traverse(c => {
            if (c.isMesh && (c.name.includes('Tusk') || c.name.includes('Ferrule'))) {
              const tb = new THREE.Box3().setFromObject(c);
              const tc = new THREE.Vector3();
              tb.getCenter(tc);
              tuskMeshes.push({
                name: c.name,
                worldCenter: { x: +tc.x.toFixed(4), y: +tc.y.toFixed(4), z: +tc.z.toFixed(4) },
                deltaZFromRoot: +(tc.z - rootPos.z).toFixed(4)
              });
            }
          });

          return {
            square: sq.notation,
            team: sq.team,
            rootPos: { x: +rootPos.x.toFixed(4), y: +rootPos.y.toFixed(4), z: +rootPos.z.toFixed(4) },
            rotY: +rig.root.rotation.y.toFixed(4),
            worldBox: {
              min: { x: +box.min.x.toFixed(4), y: +box.min.y.toFixed(4), z: +box.min.z.toFixed(4) },
              max: { x: +box.max.x.toFixed(4), y: +box.max.y.toFixed(4), z: +box.max.z.toFixed(4) }
            },
            dimensions: {
              width_X: +size.x.toFixed(4),
              height_Y: +size.y.toFixed(4),
              length_Z: +size.z.toFixed(4)
            },
            tileBounds: {
              centerX: tileCenterX,
              centerZ: tileCenterZ,
              minX: tileMinX,
              maxX: tileMaxX,
              minZ: tileMinZ,
              maxZ: tileMaxZ
            },
            perimeterClearance: {
              minX_to_boardRim: +(box.min.x - BOARD_MIN).toFixed(4),
              maxX_to_boardRim: +(BOARD_MAX - box.max.x).toFixed(4),
              minZ_to_boardRim: +(box.min.z - BOARD_MIN).toFixed(4),
              maxZ_to_boardRim: +(BOARD_MAX - box.max.z).toFixed(4),
              insideBoardPerimeter: (box.min.x >= BOARD_MIN && box.max.x <= BOARD_MAX && box.min.z >= BOARD_MIN && box.max.z <= BOARD_MAX)
            },
            tacticalTileClearance: {
              widthFitsWithinTileWidth: (size.x <= 2.0),
              widthFitsWithin0_86mHalfLimit: (size.x <= 1.72),
              lateralClearanceToTileEdge_m: +lateralMarginInsideTile.toFixed(4),
              lateralOverhang_m: +lateralOverhang.toFixed(4),
              clearanceToAdjacentKnight_m: clearanceToKnight !== null ? +clearanceToKnight.toFixed(4) : null,
              clearanceToAdjacentPawn_m: clearanceToPawn !== null ? +clearanceToPawn.toFixed(4) : null
            },
            grounding: {
              minY: +box.min.y.toFixed(6),
              isGroundedExact: Math.abs(box.min.y) <= 0.005
            },
            tusks: {
              count: tuskMeshes.length,
              pointingTowardEnemy: sq.team === 'White' ? tuskMeshes.every(t => t.deltaZFromRoot < 0) : tuskMeshes.every(t => t.deltaZFromRoot > 0),
              samples: tuskMeshes.slice(0, 4)
            }
          };
        });

        return {
          totalUnits: activeRigs.length,
          facingFailures,
          widthFailures,
          groundingFailures,
          allPass: (facingFailures === 0 && widthFailures === 0 && groundingFailures === 0),
          allUnitsSummary: allUnits.map(u => ({
            cell: u.cell, team: u.team, type: u.type,
            width: u.size.x, widthPass: u.widthPass,
            minY: u.overallBox.min.y, groundingPass: u.groundingPass,
            rotY: u.rotY, frontCorrect: u.frontCorrect
          })),
          cornerRooks
        };
      })()
    `,
    returnByValue: true
  });

  const fullReport = evalRes.result.value;
  fs.writeFileSync('tests/adversarial_gajraj_corner_bounds_report.json', JSON.stringify(fullReport, null, 2));

  console.log('\n=== EMPIRICAL CORNER ROOKS & SPATIAL BOUNDS AUDIT ===');
  console.log(`Total Units: ${fullReport.totalUnits}`);
  console.log(`Facing Failures: ${fullReport.facingFailures}`);
  console.log(`Width Failures (size.x > 1.72m): ${fullReport.widthFailures}`);
  console.log(`Grounding Failures (|minY| > 0.005m): ${fullReport.groundingFailures}`);
  console.log(`All Units Pass: ${fullReport.allPass}\n`);

  console.log('CORNER WAR ELEPHANTS (GAJRAJ / ROOKS):');
  fullReport.cornerRooks.forEach(cr => {
    console.log(`\n--- Square ${cr.square} (${cr.team} Rook) ---`);
    console.log(`  Root Position: (${cr.rootPos.x}, ${cr.rootPos.y}, ${cr.rootPos.z}), Yaw: ${cr.rotY} rad`);
    console.log(`  Dimensions: Width(X)=${cr.dimensions.width_X}m, Height(Y)=${cr.dimensions.height_Y}m, Length(Z)=${cr.dimensions.length_Z}m`);
    console.log(`  Grounding minY: ${cr.grounding.minY}m (exact: ${cr.grounding.isGroundedExact})`);
    console.log(`  Width fits tactical limit (<= 1.72m): ${cr.tacticalTileClearance.widthFitsWithin0_86mHalfLimit}`);
    console.log(`  Lateral clearance inside 2.0m tile: ${cr.tacticalTileClearance.lateralClearanceToTileEdge_m}m on each side`);
    console.log(`  Inside board perimeter [-8, +8]: ${cr.perimeterClearance.insideBoardPerimeter}`);
    console.log(`  Perimeter clearance to rims: minX=${cr.perimeterClearance.minX_to_boardRim}m, maxX=${cr.perimeterClearance.maxX_to_boardRim}m, minZ=${cr.perimeterClearance.minZ_to_boardRim}m, maxZ=${cr.perimeterClearance.maxZ_to_boardRim}m`);
    console.log(`  Clearance to adjacent Knight: ${cr.tacticalTileClearance.clearanceToAdjacentKnight_m}m`);
    console.log(`  Clearance to adjacent Pawn: ${cr.tacticalTileClearance.clearanceToAdjacentPawn_m}m`);
    console.log(`  Tusks pointing toward enemy: ${cr.tusks.pointingTowardEnemy}`);
  });

  ws.close();
  chrome.kill();
}

runGajrajAdversarialCornerTest().catch(console.error);
