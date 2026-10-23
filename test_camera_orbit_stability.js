const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

async function run() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9226',
    '--disable-gpu-sandbox',
    '--use-gl=angle',
    '--use-angle=d3d11',
    '--window-size=1920,1080',
    'http://localhost:8080/index.html'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  let res, tabs;
  for (let i = 0; i < 10; i++) {
    try {
      res = await fetch('http://127.0.0.1:9226/json');
      tabs = await res.json();
      if (tabs && tabs.length > 0) break;
    } catch (e) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  const target = tabs.find(t => t.type === 'page' && t.url.includes('localhost:8080')) || tabs[0];
  const ws = new WebSocket(target.webSocketDebuggerUrl);

  let msgId = 1;
  const pending = new Map();
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve } = pending.get(data.id);
      pending.delete(data.id);
      resolve(data.result);
    }
  };

  await new Promise(resolve => ws.onopen = resolve);
  await send('Runtime.enable');
  await send('Page.enable');

  // Wait until models loaded
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    const evalRes = await send('Runtime.evaluate', {
      expression: 'typeof ModelManager !== "undefined" && ModelManager.isLoaded && typeof activeRigs !== "undefined" && activeRigs.length === 32',
      returnByValue: true
    });
    if (evalRes.result.value) break;
  }

  const orbitDir = path.join(__dirname, 'orbit_frames');
  if (!fs.existsSync(orbitDir)) fs.mkdirSync(orbitDir);

  console.log('Testing slow camera yaw orbit and verifying board stability...');
  // Orbit camera yaw smoothly
  for (let step = 0; step < 20; step++) {
    await send('Runtime.evaluate', {
      expression: `camState.targetYaw = 0.32 + ${step * 0.015}; camState.yaw = camState.targetYaw;`
    });
    await new Promise(r => setTimeout(r, 80));
    const ss = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(orbitDir, `orbit_${String(step).padStart(3, '0')}.png`), Buffer.from(ss.data, 'base64'));
  }

  console.log('Orbit capture complete. Checking board colors across orbit...');
  // Inspect tile colors from JavaScript
  const evalColorRes = await send('Runtime.evaluate', {
    expression: `(() => {
      // Check that all 64 tile meshes are present and top surface is y = 0
      const heights = tileMeshes.map(m => m.position.y + 0.06); // top face
      const daisTop = boardDais.position.y + 0.14; // height 0.28 / 2
      const rimTop = daisRim.position.y + 0.04; // height 0.08 / 2
      return {
        tileTopElevation: Math.max(...heights),
        daisTopElevation: daisTop,
        rimTopElevation: rimTop,
        isDaisRecessed: daisTop <= -0.060,
        isRimRecessed: rimTop <= -0.015,
        daisReceiveShadow: boardDais.receiveShadow
      };
    })()`,
    returnByValue: true
  });

  console.log('Geometry Elevation State:', evalColorRes.result.value);

  ws.close();
  chrome.kill();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
