const { spawn } = require('child_process');

async function auditAll32Units() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9248',
    '--disable-gpu-sandbox',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9248',
    'http://localhost:8080/index.html'
  ]);
  let res, tabs;
  for (let i = 0; i < 20; i++) {
    try {
      res = await fetch('http://127.0.0.1:9248/json');
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
        const pawnAudit = [];
        let allPawnsFaceEnemy = true;
        let anySpearsDetected = false;

        // Audit all 16 Pawns
        for (let f = 0; f < 8; f++) {
          // White Pawn at [f][1]
          const wp = unitGrid[f][1];
          const wpRootPos = new THREE.Vector3();
          wp.root.getWorldPosition(wpRootPos);
          
          let wpDhalCenterZ = null;
          let wpPlumeCenterZ = null;
          let wpHasSpear = false;
          
          wp.root.traverse(c => {
            if (c.isMesh) {
              const name = c.name || '';
              if (name.toLowerCase().includes('spear') || name.toLowerCase().includes('shaft') || (name.toLowerCase().includes('cylinder') && c.geometry && c.geometry.parameters && c.geometry.parameters.height > 2.0)) {
                wpHasSpear = true;
              }
              if (name.includes('Padati_Dhal')) {
                const b = new THREE.Box3().setFromObject(c);
                const cen = new THREE.Vector3();
                b.getCenter(cen);
                wpDhalCenterZ = cen.z;
              }
              if (name.includes('Padati_Plume')) {
                const b = new THREE.Box3().setFromObject(c);
                const cen = new THREE.Vector3();
                b.getCenter(cen);
                wpPlumeCenterZ = cen.z;
              }
            }
          });

          // For White pawn: Dhal shield should be in front (-Z, i.e. < rootZ), plume in back (+Z, i.e. > rootZ)
          const wpFacesOpponent = (wpDhalCenterZ !== null) ? (wpDhalCenterZ < wpRootPos.z) : true;
          if (!wpFacesOpponent) allPawnsFaceEnemy = false;
          if (wpHasSpear) anySpearsDetected = true;

          pawnAudit.push({
            pawn: 'White Pawn ' + String.fromCharCode(65 + f) + '2',
            rootZ: +wpRootPos.z.toFixed(2),
            rotY: +wp.root.rotation.y.toFixed(3),
            dhalZ: wpDhalCenterZ !== null ? +wpDhalCenterZ.toFixed(3) : null,
            dhalDeltaZ: wpDhalCenterZ !== null ? +(wpDhalCenterZ - wpRootPos.z).toFixed(3) : null,
            plumeDeltaZ: wpPlumeCenterZ !== null ? +(wpPlumeCenterZ - wpRootPos.z).toFixed(3) : null,
            facesOpponent: wpFacesOpponent,
            hasSpear: wpHasSpear
          });

          // Black Pawn at [f][6]
          const bp = unitGrid[f][6];
          const bpRootPos = new THREE.Vector3();
          bp.root.getWorldPosition(bpRootPos);
          
          let bpDhalCenterZ = null;
          let bpPlumeCenterZ = null;
          let bpHasSpear = false;
          
          bp.root.traverse(c => {
            if (c.isMesh) {
              const name = c.name || '';
              if (name.toLowerCase().includes('spear') || name.toLowerCase().includes('shaft') || (name.toLowerCase().includes('cylinder') && c.geometry && c.geometry.parameters && c.geometry.parameters.height > 2.0)) {
                bpHasSpear = true;
              }
              if (name.includes('Padati_Dhal')) {
                const b = new THREE.Box3().setFromObject(c);
                const cen = new THREE.Vector3();
                b.getCenter(cen);
                bpDhalCenterZ = cen.z;
              }
              if (name.includes('Padati_Plume')) {
                const b = new THREE.Box3().setFromObject(c);
                const cen = new THREE.Vector3();
                b.getCenter(cen);
                bpPlumeCenterZ = cen.z;
              }
            }
          });

          // For Black pawn: Dhal shield should be in front (+Z, i.e. > rootZ), plume in back (-Z, i.e. < rootZ)
          const bpFacesOpponent = (bpDhalCenterZ !== null) ? (bpDhalCenterZ > bpRootPos.z) : true;
          if (!bpFacesOpponent) allPawnsFaceEnemy = false;
          if (bpHasSpear) anySpearsDetected = true;

          pawnAudit.push({
            pawn: 'Black Pawn ' + String.fromCharCode(65 + f) + '7',
            rootZ: +bpRootPos.z.toFixed(2),
            rotY: +bp.root.rotation.y.toFixed(3),
            dhalZ: bpDhalCenterZ !== null ? +bpDhalCenterZ.toFixed(3) : null,
            dhalDeltaZ: bpDhalCenterZ !== null ? +(bpDhalCenterZ - bpRootPos.z).toFixed(3) : null,
            plumeDeltaZ: bpPlumeCenterZ !== null ? +(bpPlumeCenterZ - bpRootPos.z).toFixed(3) : null,
            facesOpponent: bpFacesOpponent,
            hasSpear: bpHasSpear
          });
        }

        // Summary of all 32 rigs facing
        let whiteUnitsCount = 0;
        let blackUnitsCount = 0;
        let whiteCorrectFacing = 0;
        let blackCorrectFacing = 0;
        
        window.activeRigs.forEach(rig => {
          if (rig.team === TEAM_WHITE) {
            whiteUnitsCount++;
            if (Math.abs(rig.root.rotation.y - Math.PI) < 0.05) whiteCorrectFacing++;
          } else {
            blackUnitsCount++;
            if (Math.abs(rig.root.rotation.y - 0) < 0.05) blackCorrectFacing++;
          }
        });

        return {
          totalUnits: window.activeRigs.length,
          whiteUnitsCount,
          whiteCorrectFacing,
          blackUnitsCount,
          blackCorrectFacing,
          allPawnsFaceEnemy,
          anySpearsDetected,
          pawns: pawnAudit
        };
      })()
    `,
    returnByValue: true
  });

  console.log('=== AUDIT REPORT FOR ALL 32 UNITS & 16 PAWNS ===');
  console.log('Total units:', result.result.value.totalUnits);
  console.log('White units facing Math.PI (-Z):', result.result.value.whiteCorrectFacing + '/' + result.result.value.whiteUnitsCount);
  console.log('Black units facing 0 (+Z):', result.result.value.blackCorrectFacing + '/' + result.result.value.blackUnitsCount);
  console.log('All 16 pawns face opposing enemy army:', result.result.value.allPawnsFaceEnemy);
  console.log('Any spears detected:', result.result.value.anySpearsDetected);
  console.log('\nPawn Detail sample:');
  result.result.value.pawns.slice(0, 6).forEach(p => {
    console.log(`  ${p.pawn}: rootZ=${p.rootZ}, rotY=${p.rotY}, dhalDeltaZ=${p.dhalDeltaZ}, plumeDeltaZ=${p.plumeDeltaZ}, facesEnemy=${p.facesOpponent}, hasSpear=${p.hasSpear}`);
  });

  ws.close();
  chrome.kill();
}

auditAll32Units().catch(console.error);
