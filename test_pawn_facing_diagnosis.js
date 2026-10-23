const { spawn } = require('child_process');

async function testDiagnosis() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9277',
    '--disable-gpu-sandbox',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9277',
    'http://localhost:8080/index.html'
  ]);

  let tabs;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9277/json');
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
    if (d.id && p.has(d.id)) { p.get(d.id)(d.result); p.delete(d.id); }
  };
  const send = (m, a = {}) => new Promise(r => {
    const i = id++;
    p.set(i, r);
    ws.send(JSON.stringify({ id: i, method: m, params: a }));
  });

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

  const evalSim = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const wp = unitGrid[0][1];
        const bp = unitGrid[0][6];
        
        function getDhalDeltaZ(pawn) {
          const rootPos = new THREE.Vector3();
          pawn.root.getWorldPosition(rootPos);
          let dhalZ = null;
          pawn.root.traverse(c => {
            if (c.isMesh && (c.name || '').includes('Padati_Dhal')) {
              const b = new THREE.Box3().setFromObject(c);
              const cen = new THREE.Vector3();
              b.getCenter(cen);
              dhalZ = cen.z;
            }
          });
          return dhalZ !== null ? +(dhalZ - rootPos.z).toFixed(3) : null;
        }

        const currentWhiteDhalDeltaZ = getDhalDeltaZ(wp);
        const currentBlackDhalDeltaZ = getDhalDeltaZ(bp);

        // Find inner model in wp.torso
        const wpModel = wp.torso.children[0];
        const bpModel = bp.torso.children[0];
        
        wpModel.rotation.y = 0;
        bpModel.rotation.y = 0;
        
        const testWhiteDhalDeltaZ = getDhalDeltaZ(wp);
        const testBlackDhalDeltaZ = getDhalDeltaZ(bp);

        // Restore
        wpModel.rotation.y = Math.PI;
        bpModel.rotation.y = Math.PI;

        return {
          current_with_rotY_PI: {
            whiteDhalDeltaZ: currentWhiteDhalDeltaZ,
            whiteFacingEnemy: currentWhiteDhalDeltaZ < 0,
            blackDhalDeltaZ: currentBlackDhalDeltaZ,
            blackFacingEnemy: currentBlackDhalDeltaZ > 0
          },
          with_rotY_0: {
            whiteDhalDeltaZ: testWhiteDhalDeltaZ,
            whiteFacingEnemy: testWhiteDhalDeltaZ < 0,
            blackDhalDeltaZ: testBlackDhalDeltaZ,
            blackFacingEnemy: testBlackDhalDeltaZ > 0
          }
        };
      })()
    `,
    returnByValue: true
  });

  console.log('SIMULATION RESULT:\n', JSON.stringify(evalSim.result.value, null, 2));

  ws.close();
  chrome.kill();
}

testDiagnosis().catch(console.error);
