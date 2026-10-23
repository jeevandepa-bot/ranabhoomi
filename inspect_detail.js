const { spawn } = require('child_process');

async function inspectDetail() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9264',
    '--disable-gpu-sandbox',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9264',
    'http://localhost:8080/index.html'
  ]);
  let res, tabs;
  for (let i = 0; i < 20; i++) {
    try {
      res = await fetch('http://127.0.0.1:9264/json');
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
      expression: 'typeof window.THREE !== "undefined" && typeof window.THREE.GLTFLoader === "function"',
      returnByValue: true
    });
    if (chk && chk.result && chk.result.value) break;
  }

  const evalResult = await send('Runtime.evaluate', {
    expression: `
      (async () => {
        const loader = new THREE.GLTFLoader();
        const soldierGltf = await new Promise((res, rej) => loader.load('assets/soldier.glb', res, undefined, rej));
        const queenGltf = await new Promise((res, rej) => loader.load('assets/queen.glb', res, undefined, rej));

        const soldierInfo = [];
        soldierGltf.scene.traverse(c => {
          if (c.isMesh) {
            soldierInfo.push({ name: c.name, type: c.type, mat: c.material ? (Array.isArray(c.material) ? c.material.map(m=>m.name) : c.material.name) : null });
          }
        });

        const queenInfo = [];
        queenGltf.scene.traverse(c => {
          if (c.isMesh) {
            queenInfo.push({ name: c.name, type: c.type, mat: c.material ? (Array.isArray(c.material) ? c.material.map(m=>m.name) : c.material.name) : null });
          }
        });

        return { soldierInfo, queenInfo };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('DETAILS:', JSON.stringify(evalResult.result.value, null, 2));
  ws.close();
  chrome.kill();
}
inspectDetail().catch(console.error);
