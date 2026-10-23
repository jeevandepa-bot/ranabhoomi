const { spawn } = require('child_process');
const fs = require('fs');

async function testAnisotropyComparison() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9227',
    '--disable-gpu-sandbox',
    '--use-gl=angle',
    '--use-angle=d3d11',
    '--window-size=1920,1080',
    'http://localhost:8080/index.html'
  ]);

  await new Promise(r => setTimeout(r, 2000));
  let res, tabs;
  for (let i = 0; i < 15; i++) {
    try {
      res = await fetch('http://127.0.0.1:9227/json');
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

  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 500));
    const evalRes = await send('Runtime.evaluate', {
      expression: 'typeof ModelManager !== "undefined" && ModelManager.isLoaded && typeof activeRigs !== "undefined" && activeRigs.length === 32',
      returnByValue: true
    });
    if (evalRes && evalRes.result && evalRes.result.value) break;
  }

  // Set camera to grazing angle
  await send('Runtime.evaluate', {
    expression: `
      camState.distance = camState.targetDistance = 16.0;
      camState.pitch = camState.targetPitch = 0.08;
      camState.yaw = camState.targetYaw = 0.0;
      camState.lookPivot.set(0, 0.1, 0);
      camState.targetLookPivot.set(0, 0.1, 0);
    `
  });
  await new Promise(r => setTimeout(r, 1000));
  let shotBaseline = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('comparison_aniso1_grazing.png', Buffer.from(shotBaseline.data, 'base64'));

  // Now dynamically set anisotropy = 16 on all tile and runic textures
  await send('Runtime.evaluate', {
    expression: `
      const maxA = renderer.capabilities.getMaxAnisotropy();
      [lightTileMat, darkTileMat].forEach(mat => {
        ['map', 'normalMap', 'roughnessMap', 'emissiveMap'].forEach(mKey => {
          if (mat[mKey]) {
            mat[mKey].anisotropy = maxA;
            mat[mKey].needsUpdate = true;
          }
        });
      });
      const rgMesh = battlefieldGroup.children.find(c => c.geometry && c.geometry.type === 'PlaneGeometry' && c.geometry.parameters.width === 16);
      if (rgMesh && rgMesh.material.map) {
        rgMesh.material.map.anisotropy = maxA;
        rgMesh.material.map.needsUpdate = true;
      }
    `
  });
  await new Promise(r => setTimeout(r, 1000));
  let shotAniso16 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('comparison_aniso16_grazing.png', Buffer.from(shotAniso16.data, 'base64'));

  ws.close();
  chrome.kill();
  console.log('Saved comparison_aniso1_grazing.png and comparison_aniso16_grazing.png');
}

testAnisotropyComparison().catch(console.error);
