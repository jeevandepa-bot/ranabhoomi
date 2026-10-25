const { spawn } = require('child_process');
const fs = require('fs');

async function measurePhysicalBounds() {
  console.log('========================================================================');
  console.log('   EMPIRICAL CHALLENGER: PHYSICAL MESH VS SHADOW DISK BOUNDS AUDIT       ');
  console.log('========================================================================\n');

  const chromePort = 9263;
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

        const unitAudits = [];

        for (let i = 0; i < activeRigs.length; i++) {
          const rig = activeRigs[i];
          const isWhite = (rig.team === TEAM_WHITE);
          const rootPos = new THREE.Vector3();
          rig.root.getWorldPosition(rootPos);

          // 1. Full root bounds (including contact shadow plane)
          const rootBox = new THREE.Box3().setFromObject(rig.root);
          const rootSize = new THREE.Vector3();
          rootBox.getSize(rootSize);

          // 2. Physical 3D mesh bounds (strictly bodyRoot, excluding 2D contactShadow quad)
          const bodyBox = new THREE.Box3().setFromObject(rig.bodyRoot);
          const bodySize = new THREE.Vector3();
          bodyBox.getSize(bodySize);

          // Check all meshes inside bodyRoot
          const meshes = [];
          rig.bodyRoot.traverse(c => {
            if (c.isMesh && c.visible !== false) {
              const b = new THREE.Box3().setFromObject(c);
              const cen = new THREE.Vector3();
              b.getCenter(cen);
              meshes.push({
                name: c.name,
                deltaZ: +(cen.z - rootPos.z).toFixed(4),
                minY: +b.min.y.toFixed(4)
              });
            }
          });

          meshes.sort((a, b) => a.deltaZ - b.deltaZ);
          const minZMesh = meshes[0];
          const maxZMesh = meshes[meshes.length - 1];

          // Facing verification
          let frontCorrect = false;
          if (isWhite) {
            frontCorrect = (minZMesh && minZMesh.deltaZ < -0.1);
          } else {
            frontCorrect = (maxZMesh && maxZMesh.deltaZ > 0.1);
          }

          // Physical width check: bodySize.x <= 1.72m (|X| <= 0.86m)
          const physicalWidthPass = (bodySize.x <= 1.72 + 0.01);
          const physicalGroundingPass = Math.abs(bodyBox.min.y) <= 0.005;

          unitAudits.push({
            id: i,
            cell: rig.cell ? (String.fromCharCode(65 + rig.cell.f) + (rig.cell.r + 1)) : ('Unit_' + i),
            team: isWhite ? 'White' : 'Black',
            type: typeNames[rig.type] || 'Unknown',
            typeId: rig.type,
            rootPos: { x: +rootPos.x.toFixed(3), y: +rootPos.y.toFixed(3), z: +rootPos.z.toFixed(3) },
            rotY: +rig.root.rotation.y.toFixed(4),
            contactShadowSize: rig.contactShadow ? 1.82 : 0,
            fullRootSize: { x: +rootSize.x.toFixed(4), y: +rootSize.y.toFixed(4), z: +rootSize.z.toFixed(4) },
            physicalBodySize: { x: +bodySize.x.toFixed(4), y: +bodySize.y.toFixed(4), z: +bodySize.z.toFixed(4) },
            physicalBox: {
              min: { x: +bodyBox.min.x.toFixed(4), y: +bodyBox.min.y.toFixed(4), z: +bodyBox.min.z.toFixed(4) },
              max: { x: +bodyBox.max.x.toFixed(4), y: +bodyBox.max.y.toFixed(4), z: +bodyBox.max.z.toFixed(4) }
            },
            frontCorrect,
            minZMesh,
            maxZMesh,
            physicalWidthPass,
            physicalGroundingPass
          });
        }

        // Detailed Corner War Elephant Clearance Analysis
        const cornerSquares = [
          { notation: 'A1', file: 0, rank: 0, team: 'White' },
          { notation: 'H1', file: 7, rank: 0, team: 'White' },
          { notation: 'A8', file: 0, rank: 7, team: 'Black' },
          { notation: 'H8', file: 7, rank: 7, team: 'Black' }
        ];

        const cornerElephantDetails = cornerSquares.map(sq => {
          const rig = unitGrid[sq.file][sq.rank];
          const rootPos = new THREE.Vector3();
          rig.root.getWorldPosition(rootPos);
          const bodyBox = new THREE.Box3().setFromObject(rig.bodyRoot);
          const bodySize = new THREE.Vector3();
          bodyBox.getSize(bodySize);

          const tileCenterX = sq.file * 2.0 - 7.0;
          const tileCenterZ = (7 - sq.rank) * 2.0 - 7.0;
          const tileMinX = tileCenterX - TILE_HALF;
          const tileMaxX = tileCenterX + TILE_HALF;
          const tileMinZ = tileCenterZ - TILE_HALF;
          const tileMaxZ = tileCenterZ + TILE_HALF;

          // Clearance to outer board rim ([-8.0, +8.0])
          const marginToRimMinX = +(bodyBox.min.x - BOARD_MIN).toFixed(4);
          const marginToRimMaxX = +(BOARD_MAX - bodyBox.max.x).toFixed(4);
          const marginToRimMinZ = +(bodyBox.min.z - BOARD_MIN).toFixed(4);
          const marginToRimMaxZ = +(BOARD_MAX - bodyBox.max.z).toFixed(4);
          const strictlyInsideBoard = (bodyBox.min.x >= BOARD_MIN && bodyBox.max.x <= BOARD_MAX && bodyBox.min.z >= BOARD_MIN && bodyBox.max.z <= BOARD_MAX);

          // Tile boundary clearance
          const lateralMarginInsideTile = +(TILE_HALF - (bodySize.x / 2.0)).toFixed(4);
          const lateralOverhang = Math.max(0, bodyBox.max.x - tileMaxX, tileMinX - bodyBox.min.x);

          // Adjacent Knight Clearance (File 1 or 6)
          const adjKnightFile = (sq.file === 0) ? 1 : 6;
          const knightRig = unitGrid[adjKnightFile][sq.rank];
          let clearanceToKnight = null;
          if (knightRig) {
            const knightBody = new THREE.Box3().setFromObject(knightRig.bodyRoot);
            if (sq.file === 0) {
              clearanceToKnight = +(knightBody.min.x - bodyBox.max.x).toFixed(4);
            } else {
              clearanceToKnight = +(bodyBox.min.x - knightBody.max.x).toFixed(4);
            }
          }

          // Adjacent Pawn Clearance (Rank 1 or 6)
          const adjPawnRank = (sq.rank === 0) ? 1 : 6;
          const pawnRig = unitGrid[sq.file][adjPawnRank];
          let clearanceToPawn = null;
          if (pawnRig) {
            const pawnBody = new THREE.Box3().setFromObject(pawnRig.bodyRoot);
            if (sq.rank === 0) {
              // White Rook at z=7 facing -Z. Pawn at z=5.
              clearanceToPawn = +(bodyBox.min.z - pawnBody.max.z).toFixed(4);
            } else {
              // Black Rook at z=-7 facing +Z. Pawn at z=-5.
              clearanceToPawn = +(pawnBody.min.z - bodyBox.max.z).toFixed(4);
            }
          }

          // Tusks world positions
          const tuskData = [];
          rig.bodyRoot.traverse(c => {
            if (c.isMesh && (c.name.includes('Tusk') || c.name.includes('Ferrule'))) {
              const b = new THREE.Box3().setFromObject(c);
              const cen = new THREE.Vector3();
              b.getCenter(cen);
              tuskData.push({
                name: c.name,
                worldCenter: { x: +cen.x.toFixed(4), y: +cen.y.toFixed(4), z: +cen.z.toFixed(4) },
                deltaZ: +(cen.z - rootPos.z).toFixed(4)
              });
            }
          });

          return {
            square: sq.notation,
            team: sq.team,
            rootPos: { x: +rootPos.x.toFixed(4), y: +rootPos.y.toFixed(4), z: +rootPos.z.toFixed(4) },
            physicalBodySize: {
              width_X: +bodySize.x.toFixed(4),
              height_Y: +bodySize.y.toFixed(4),
              length_Z: +bodySize.z.toFixed(4)
            },
            tacticalWidthCheck: {
              width_X: +bodySize.x.toFixed(4),
              limit_1_72m: 1.72,
              fits_limit: bodySize.x <= 1.72,
              lateralSafetyMarginOnTile_m: lateralMarginInsideTile
            },
            grounding: {
              minY: +bodyBox.min.y.toFixed(6),
              isGroundedExact: Math.abs(bodyBox.min.y) <= 0.005
            },
            perimeterClearance: {
              strictlyInsideBoard,
              marginToRimMinX,
              marginToRimMaxX,
              marginToRimMinZ,
              marginToRimMaxZ
            },
            tacticalClearance: {
              lateralMarginInsideTile,
              lateralOverhang: +lateralOverhang.toFixed(4),
              clearanceToAdjacentKnight_m: clearanceToKnight,
              clearanceToAdjacentPawn_m: clearanceToPawn
            },
            tusks: {
              count: tuskData.length,
              pointingTowardEnemy: sq.team === 'White' ? tuskData.every(t => t.deltaZ < 0) : tuskData.every(t => t.deltaZ > 0),
              tipSamples: tuskData.filter(t => t.name.includes('Tip') || t.name.includes('Tusk')).slice(0, 4)
            }
          };
        });

        // Summary counts
        const physicalWidthFailures = unitAudits.filter(u => !u.physicalWidthPass && u.type !== 'Bishop');
        const bishopWidthFailures = unitAudits.filter(u => !u.physicalWidthPass && u.type === 'Bishop');
        const physicalGroundingFailures = unitAudits.filter(u => !u.physicalGroundingPass);
        const facingFailures = unitAudits.filter(u => !u.frontCorrect);

        return {
          totalUnits: activeRigs.length,
          elephantPhysicalWidthPass: cornerElephantDetails.every(e => e.tacticalWidthCheck.fits_limit),
          elephantGroundingPass: cornerElephantDetails.every(e => e.grounding.isGroundedExact),
          elephantPerimeterPass: cornerElephantDetails.every(e => e.perimeterClearance.strictlyInsideBoard),
          elephantFacingPass: cornerElephantDetails.every(e => e.tusks.pointingTowardEnemy),
          facingFailuresCount: facingFailures.length,
          physicalWidthFailuresCount: physicalWidthFailures.length,
          bishopWidthFailuresCount: bishopWidthFailures.length,
          physicalGroundingFailuresCount: physicalGroundingFailures.length,
          cornerElephantDetails,
          archetypePhysicalSizes: {
            Rook_Elephant: cornerElephantDetails[0].physicalBodySize,
            samplePawn: unitAudits.find(u => u.type === 'Pawn').physicalBodySize,
            sampleKnight: unitAudits.find(u => u.type === 'Knight').physicalBodySize,
            sampleBishop: unitAudits.find(u => u.type === 'Bishop').physicalBodySize,
            sampleQueen: unitAudits.find(u => u.type === 'Queen').physicalBodySize,
            sampleKing: unitAudits.find(u => u.type === 'King').physicalBodySize
          }
        };
      })()
    `,
    returnByValue: true
  });

  const report = evalRes.result.value;
  fs.writeFileSync('tests/physical_mesh_bounds_report.json', JSON.stringify(report, null, 2));

  console.log('=== EMPIRICAL REPORT: PHYSICAL CHARACTER MESH AUDIT ===');
  console.log(`Elephant Physical Width Pass (<= 1.72m): ${report.elephantPhysicalWidthPass}`);
  console.log(`Elephant Grounding Pass (minY == 0.000m): ${report.elephantGroundingPass}`);
  console.log(`Elephant Inside Board Perimeter: ${report.elephantPerimeterPass}`);
  console.log(`Elephant Tusks Pointing Toward Enemy: ${report.elephantFacingPass}`);
  console.log(`Facing Failures: ${report.facingFailuresCount}/32`);
  console.log(`Non-Bishop Physical Width Failures: ${report.physicalWidthFailuresCount}`);
  console.log(`Physical Grounding Failures: ${report.physicalGroundingFailuresCount}`);

  console.log('\nArchetype Physical Dimensions (X, Y, Z in meters):');
  for (const [k, v] of Object.entries(report.archetypePhysicalSizes)) {
    console.log(`  ${k}: Width(X)=${v.width_X}m, Height(Y)=${v.height_Y}m, Length(Z)=${v.length_Z}m`);
  }

  console.log('\nCorner War Elephant Details:');
  report.cornerElephantDetails.forEach(e => {
    console.log(`\nSquare ${e.square} (${e.team} Rook / Gajraj):`);
    console.log(`  Root: (${e.rootPos.x}, ${e.rootPos.y}, ${e.rootPos.z})`);
    console.log(`  Physical Dimensions: W=${e.physicalBodySize.width_X}m, H=${e.physicalBodySize.height_Y}m, L=${e.physicalBodySize.length_Z}m`);
    console.log(`  Fits 1.72m limit: ${e.tacticalWidthCheck.fits_limit} (W=${e.tacticalWidthCheck.width_X}m, safety margin inside 2m tile=${e.tacticalClearance.lateralMarginInsideTile}m)`);
    console.log(`  Grounding: minY=${e.grounding.minY}m (isGroundedExact: ${e.grounding.isGroundedExact})`);
    console.log(`  Inside Board Perimeter: ${e.perimeterClearance.strictlyInsideBoard} (margins to rim: minX=${e.perimeterClearance.marginToRimMinX}m, maxX=${e.perimeterClearance.marginToRimMaxX}m, minZ=${e.perimeterClearance.marginToRimMinZ}m, maxZ=${e.perimeterClearance.marginToRimMaxZ}m)`);
    console.log(`  Clearance to adjacent Knight: ${e.tacticalClearance.clearanceToAdjacentKnight_m}m`);
    console.log(`  Clearance to adjacent Pawn: ${e.tacticalClearance.clearanceToAdjacentPawn_m}m`);
    console.log(`  Tusks pointing toward enemy: ${e.tusks.pointingTowardEnemy}`);
  });

  ws.close();
  chrome.kill();
}

measurePhysicalBounds().catch(console.error);
