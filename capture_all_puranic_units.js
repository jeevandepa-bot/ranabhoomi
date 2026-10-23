const { spawn } = require('child_process');
const fs = require('fs');

async function run() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9225',
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
      res = await fetch('http://127.0.0.1:9225/json');
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

  // Wait until ready
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    const evalRes = await send('Runtime.evaluate', {
      expression: 'typeof ModelManager !== "undefined" && ModelManager.isLoaded && typeof activeRigs !== "undefined" && activeRigs.length === 32',
      returnByValue: true
    });
    if (evalRes.result.value) break;
  }

  // 1. Capture Cinematic Battlefield Shot
  console.log('Capturing Cinematic Battlefield Shot...');
  await send('Runtime.evaluate', {
    expression: `
      camState.distance = camState.targetDistance = 21.0;
      camState.pitch = camState.targetPitch = 0.58;
      camState.yaw = camState.targetYaw = 0.32;
      camState.lookPivot.set(0, 0.4, 0);
      camState.targetLookPivot.set(0, 0.4, 0);
    `
  });
  await new Promise(r => setTimeout(r, 1200));
  let shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('battlefield_cinematic.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved battlefield_cinematic.png');

  // 2. Switch to Studio Mode
  console.log('Switching to Studio Mode...');
  await send('Runtime.evaluate', {
    expression: `
      document.getElementById('tabStudioBtn').click();
    `
  });
  await new Promise(r => setTimeout(r, 800));

  const pieces = [
    { type: 1, name: 'padati', dist: 4.8, pivotY: 0.95 },
    { type: 4, name: 'gajadhvaja', dist: 6.8, pivotY: 1.15 },
    { type: 2, name: 'ashvarohi', dist: 5.6, pivotY: 1.05 },
    { type: 3, name: 'ratha', dist: 5.6, pivotY: 0.95 },
    { type: 5, name: 'maharani', dist: 5.0, pivotY: 1.0 },
    { type: 6, name: 'samrat', dist: 5.4, pivotY: 1.1 }
  ];

  for (const p of pieces) {
    console.log('Inspecting piece in studio:', p.name, 'type:', p.type);
    await send('Runtime.evaluate', {
      expression: `
        studioPieceType = ${p.type};
        rebuildStudioCharacter();
        // Face camera slightly at 3/4 hero angle
        studioHeroRig.root.rotation.y = -0.38;
        camState.distance = camState.targetDistance = ${p.dist};
        camState.pitch = camState.targetPitch = 0.22;
        camState.yaw = camState.targetYaw = 0.05;
        camState.lookPivot.set(0, ${p.pivotY}, 0);
        camState.targetLookPivot.set(0, ${p.pivotY}, 0);
      `
    });
    await new Promise(r => setTimeout(r, 800));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`studio_${p.name}.png`, Buffer.from(shot.data, 'base64'));
    console.log(`Saved studio_${p.name}.png`);
  }

  ws.close();
  chrome.kill();
  console.log('All screenshots captured successfully!');
}

run().catch(console.error);
