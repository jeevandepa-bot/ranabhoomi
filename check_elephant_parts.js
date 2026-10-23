const { spawn } = require('child_process');

async function checkElephantParts() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9235',
    '--disable-gpu-sandbox',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9235',
    'http://localhost:8080/index.html'
  ]);
  let res, tabs;
  for (let i = 0; i < 20; i++) {
    try {
      res = await fetch('http://127.0.0.1:9235/json');
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
  const send = (m, a = {}) => new Promise(res => { const i = id++; p.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: a })); });
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

  const parts = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const whiteRook = unitGrid[0][0]; // White Rook on a1
        const list = [];
        whiteRook.root.traverse(c => {
          if (c.isMesh) {
            const n = (c.name || '').toLowerCase();
            if (n.includes('trunk') || n.includes('tusk') || n.includes('tail') || n.includes('head') || n.includes('ear')) {
              const wp = new THREE.Vector3();
              c.getWorldPosition(wp);
              list.push({ name: c.name, worldZ: +wp.z.toFixed(2), localZ: +c.position.z.toFixed(2) });
            }
          }
        });
        return list;
      })()
    `,
    returnByValue: true
  });
  console.log('White Rook anatomical parts Z positions:', JSON.stringify(parts.result.value, null, 2));

  ws.close();
  chrome.kill();
}
checkElephantParts().catch(console.error);
