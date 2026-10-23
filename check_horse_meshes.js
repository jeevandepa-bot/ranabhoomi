const { spawn } = require('child_process');

async function testMeshes() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9231',
    '--disable-gpu-sandbox',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9231',
    'http://localhost:8080/index.html'
  ]);
  let res, tabs;
  for (let i = 0; i < 15; i++) {
    try {
      res = await fetch('http://127.0.0.1:9231/json');
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
      expression: 'typeof ModelManager !== "undefined" && ModelManager.isLoaded && typeof activeRigs !== "undefined" && activeRigs.length === 32',
      returnByValue: true
    });
    if (chk && chk.result && chk.result.value) break;
  }

  const list = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const m = ModelManager.models.ashvarohi.scene;
        const out = [];
        m.traverse(c => {
          if (c.isMesh) {
            const b = new THREE.Box3().setFromObject(c);
            out.push({ name: c.name, minZ: +b.min.z.toFixed(2), maxZ: +b.max.z.toFixed(2), centerZ: +((b.min.z + b.max.z)/2).toFixed(2) });
          }
        });
        return out;
      })()
    `,
    returnByValue: true
  });
  console.log('Horse Mesh Z positions in raw GLTF:', JSON.stringify(list.result.value, null, 2));

  ws.close();
  chrome.kill();
}
testMeshes().catch(console.error);
