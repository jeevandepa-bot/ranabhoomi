const { spawn } = require('child_process');

async function testHead() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9230',
    '--disable-gpu-sandbox',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9230',
    'http://localhost:8080/index.html'
  ]);
  let res, tabs;
  for (let i = 0; i < 15; i++) {
    try {
      res = await fetch('http://127.0.0.1:9230/json');
      tabs = await res.json();
      if (tabs && tabs.length > 0) break;
    } catch (e) {
      await new Promise(r => setTimeout(r, 400));
    }
  }
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  let id = 1;
  const p = new Map();
  ws.onmessage = e => { const d = JSON.parse(e.data); if (d.id && p.has(d.id)) { p.get(d.id)(d.result); p.delete(d.id); } };
  const send = (m, a = {}) => new Promise(res => { const i = id++; p.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: a })); });
  await new Promise(r => ws.onopen = r);
  await send('Runtime.enable');
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 400));
    const chk = await send('Runtime.evaluate', {
      expression: 'typeof ModelManager !== "undefined" && ModelManager.isLoaded',
      returnByValue: true
    });
    if (chk && chk.result && chk.result.value) break;
  }

  const headCheck = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const rig = buildSculptedUnit(PIECE_KNIGHT, TEAM_WHITE);
        rig.root.rotation.y = 0;
        let headPos = null;
        let tailPos = null;
        rig.root.traverse(c => {
          if (c.isMesh) {
            const name = (c.name || '').toLowerCase();
            const wp = new THREE.Vector3();
            c.getWorldPosition(wp);
            if (name.includes('head') || name.includes('chamfron') || name.includes('bridle')) {
              headPos = { name: c.name, x: wp.x, y: wp.y, z: wp.z };
            }
            if (name.includes('tail') || name.includes('rump')) {
              tailPos = { name: c.name, x: wp.x, y: wp.y, z: wp.z };
            }
          }
        });
        // Also check overall box center of front vs back
        const box = new THREE.Box3().setFromObject(rig.root);
        return { headPos, tailPos, boxMinZ: box.min.z, boxMaxZ: box.max.z };
      })()
    `,
    returnByValue: true
  });
  console.log('Knight Facing Check (with root.rotation.y = 0):', JSON.stringify(headCheck, null, 2));

  ws.close();
  chrome.kill();
}
testHead().catch(console.error);
