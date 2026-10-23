const { spawn } = require('child_process');
const fs = require('fs');

async function run() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9224',
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
      res = await fetch('http://127.0.0.1:9224/json');
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

  console.log('Switching to Sculpt & Kill Studio via tabStudioBtn...');
  await send('Runtime.evaluate', {
    expression: `
      document.getElementById('tabStudioBtn').click();
      camState.distance = camState.targetDistance = 4.8;
      camState.pitch = camState.targetPitch = 0.28;
      camState.yaw = camState.targetYaw = 0.35;
      camState.lookPivot.set(0, 0.9, 0);
      camState.targetLookPivot.set(0, 0.9, 0);
    `
  });
  await new Promise(r => setTimeout(r, 1000));

  const pieces = [
    { type: 1, name: 'padati' },
    { type: 4, name: 'gajadhvaja' },
    { type: 2, name: 'ashvarohi' },
    { type: 3, name: 'ratha' },
    { type: 5, name: 'maharani' },
    { type: 6, name: 'samrat' }
  ];

  for (const p of pieces) {
    console.log('Inspecting piece in studio:', p.name);
    await send('Runtime.evaluate', {
      expression: `
        studioPieceType = ${p.type};
        rebuildStudioCharacter();
        if (${p.type} === 4) { // Elephant is wider/taller
          camState.distance = camState.targetDistance = 6.2;
          camState.lookPivot.set(0, 1.1, 0);
          camState.targetLookPivot.set(0, 1.1, 0);
        } else if (${p.type} === 2 || ${p.type} === 3) {
          camState.distance = camState.targetDistance = 5.6;
          camState.lookPivot.set(0, 0.95, 0);
          camState.targetLookPivot.set(0, 0.95, 0);
        } else if (${p.type} === 6) { // King
          camState.distance = camState.targetDistance = 5.4;
          camState.lookPivot.set(0, 1.0, 0);
          camState.targetLookPivot.set(0, 1.0, 0);
        } else {
          camState.distance = camState.targetDistance = 4.8;
          camState.lookPivot.set(0, 0.9, 0);
          camState.targetLookPivot.set(0, 0.9, 0);
        }
      `
    });
    await new Promise(r => setTimeout(r, 800));
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`studio_${p.name}.png`, Buffer.from(shot.data, 'base64'));
    console.log(`Saved studio_${p.name}.png`);
  }

  ws.close();
  chrome.kill();
  console.log('All studio views captured!');
}

run().catch(console.error);
