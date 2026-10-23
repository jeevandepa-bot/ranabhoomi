const { spawn } = require('child_process');

async function inspectStructure() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9288',
    '--disable-gpu-sandbox',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9288',
    'http://localhost:8080/index.html'
  ]);

  let tabs;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9288/json');
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

  const evalInspect = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const wp = unitGrid[0][1];
        
        const dump = {
          rigKeys: Object.keys(wp),
          torsoChildren: wp.torso.children.map(c => ({ name: c.name, type: c.type, rotY: c.rotation.y })),
          rootChildren: wp.root.children.map(c => ({ name: c.name, type: c.type, rotY: c.rotation.y })),
          bodyRootChildren: wp.bodyRoot.children.map(c => ({ name: c.name, type: c.type, rotY: c.rotation.y })),
          hasMixer: !!wp.mixer,
          isRealistic: wp.isRealistic
        };

        // Let's test rotating wp.root or wp.torso or wp.bodyRoot
        const origRootRot = wp.root.rotation.y;
        const rootPos = new THREE.Vector3();
        wp.root.getWorldPosition(rootPos);
        
        function getDhalZ() {
          let z = null;
          wp.root.traverse(c => {
            if (c.isMesh && (c.name || '').includes('Padati_Dhal')) {
              c.updateWorldMatrix(true, false);
              const b = new THREE.Box3().setFromObject(c);
              const cen = new THREE.Vector3();
              b.getCenter(cen);
              z = cen.z;
            }
          });
          return z !== null ? +(z - rootPos.z).toFixed(3) : null;
        }

        const dhalBefore = getDhalZ();
        
        // Rotate wp.root by PI
        wp.root.rotation.y += Math.PI;
        wp.root.updateMatrixWorld(true);
        const dhalAfterRotRoot = getDhalZ();
        wp.root.rotation.y = origRootRot;
        wp.root.updateMatrixWorld(true);

        return {
          dump,
          dhalBefore,
          dhalAfterRotRoot
        };
      })()
    `,
    returnByValue: true
  });

  console.log('HIERARCHY INSPECTION:\n', JSON.stringify(evalInspect.result.value, null, 2));

  ws.close();
  chrome.kill();
}

inspectStructure().catch(console.error);
