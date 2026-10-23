const { spawn } = require('child_process');

async function testBaseGlbs() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9262',
    '--disable-gpu-sandbox',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9262',
    'http://localhost:8080/index.html'
  ]);
  let res, tabs;
  for (let i = 0; i < 20; i++) {
    try {
      res = await fetch('http://127.0.0.1:9262/json');
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
        try {
          const loader = new THREE.GLTFLoader();
          const results = {};
          const urls = ['assets/soldier.glb', 'assets/queen.glb', 'assets/horse.glb', 'assets/elephant.glb'];
          for (const url of urls) {
            try {
              const gltf = await new Promise((res, rej) => loader.load(url, res, undefined, rej));
              let meshCount = 0;
              let bbox = new THREE.Box3().setFromObject(gltf.scene);
              let size = new THREE.Vector3();
              bbox.getSize(size);
              gltf.scene.traverse(c => { if (c.isMesh) meshCount++; });
              results[url] = { ok: true, meshes: meshCount, size: [size.x.toFixed(2), size.y.toFixed(2), size.z.toFixed(2)] };
            } catch (e) {
              results[url] = { ok: false, error: e.message };
            }
          }
          return results;
        } catch(err) {
          return { fatal: err.message };
        }
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('BASE ASSET LOAD RESULTS:', JSON.stringify(evalResult.result.value, null, 2));
  ws.close();
  chrome.kill();
}
testBaseGlbs().catch(console.error);
