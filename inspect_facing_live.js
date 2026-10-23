const { spawn } = require('child_process');

async function inspectFacingLive() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9244',
    '--disable-gpu-sandbox',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9244',
    'http://localhost:8080/index.html'
  ]);
  let res, tabs;
  for (let i = 0; i < 20; i++) {
    try {
      res = await fetch('http://127.0.0.1:9244/json');
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

  for (let i = 0; i < 35; i++) {
    await new Promise(r => setTimeout(r, 400));
    const chk = await send('Runtime.evaluate', {
      expression: 'typeof ModelManager !== "undefined" && ModelManager.isLoaded && typeof activeRigs !== "undefined" && activeRigs.length === 32',
      returnByValue: true
    });
    if (chk && chk.result && chk.result.value) break;
  }

  const result = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const report = {};
        
        // Let's inspect White pawn (file 0, rank 1), Black pawn (file 0, rank 6)
        // White Rook (0, 0), Black Rook (0, 7)
        // White Knight (1, 0), Black Knight (1, 7)
        // White Bishop (2, 0), Black Bishop (2, 7)
        // White Queen (3, 0), Black Queen (3, 7)
        // White King (4, 0), Black King (4, 7)
        
        const unitsToTest = [
          { name: 'whitePawn', rig: unitGrid[0][1], enemyDirZ: -1 },
          { name: 'blackPawn', rig: unitGrid[0][6], enemyDirZ: 1 },
          { name: 'whiteRook', rig: unitGrid[0][0], enemyDirZ: -1 },
          { name: 'blackRook', rig: unitGrid[0][7], enemyDirZ: 1 },
          { name: 'whiteKnight', rig: unitGrid[1][0], enemyDirZ: -1 },
          { name: 'blackKnight', rig: unitGrid[1][7], enemyDirZ: 1 },
          { name: 'whiteBishop', rig: unitGrid[2][0], enemyDirZ: -1 },
          { name: 'blackBishop', rig: unitGrid[2][7], enemyDirZ: 1 },
          { name: 'whiteQueen', rig: unitGrid[3][0], enemyDirZ: -1 },
          { name: 'blackQueen', rig: unitGrid[3][7], enemyDirZ: 1 },
          { name: 'whiteKing', rig: unitGrid[4][0], enemyDirZ: -1 },
          { name: 'blackKing', rig: unitGrid[4][7], enemyDirZ: 1 },
        ];

        unitsToTest.forEach(u => {
          const rootWp = new THREE.Vector3();
          u.rig.root.getWorldPosition(rootWp);
          
          const meshes = [];
          u.rig.root.traverse(c => {
            if (c.isMesh && c.visible !== false) {
              const bbox = new THREE.Box3().setFromObject(c);
              const center = new THREE.Vector3();
              bbox.getCenter(center);
              meshes.push({
                name: c.name || 'unnamed',
                centerZ: +center.z.toFixed(3),
                deltaZ: +(center.z - rootWp.z).toFixed(3),
                minZ: +bbox.min.z.toFixed(3),
                maxZ: +bbox.max.z.toFixed(3)
              });
            }
          });
          
          // Sort by deltaZ
          meshes.sort((a, b) => a.deltaZ - b.deltaZ);
          
          report[u.name] = {
            rootZ: +rootWp.z.toFixed(2),
            rootRotY: +u.rig.root.rotation.y.toFixed(3),
            enemyDirZ: u.enemyDirZ,
            minDeltaZMesh: meshes[0],
            maxDeltaZMesh: meshes[meshes.length - 1],
            allMeshes: meshes
          };
        });

        return report;
      })()
    `,
    returnByValue: true
  });

  const fs = require('fs');
  fs.writeFileSync('inspect_facing_live.json', JSON.stringify(result.result.value, null, 2));
  console.log('Inspection complete. Summary:');
  for (const [k, v] of Object.entries(result.result.value)) {
    console.log(`${k}: rootZ=${v.rootZ}, rotY=${v.rootRotY}, minZ_mesh=${v.minDeltaZMesh.name}(${v.minDeltaZMesh.deltaZ}), maxZ_mesh=${v.maxDeltaZMesh.name}(${v.maxDeltaZMesh.deltaZ})`);
  }

  ws.close();
  chrome.kill();
}

inspectFacingLive().catch(console.error);
