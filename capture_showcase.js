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

  // Wait until models loaded
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    const evalRes = await send('Runtime.evaluate', {
      expression: 'typeof ModelManager !== "undefined" && ModelManager.isLoaded && typeof activeRigs !== "undefined" && activeRigs.length === 32',
      returnByValue: true
    });
    if (evalRes && evalRes.result && evalRes.result.value) break;
  }

  // 1. Cinematic Close-up of Deva Army (Front Angle)
  await send('Runtime.evaluate', {
    expression: `
      camState.distance = camState.targetDistance = 9.5;
      camState.pitch = camState.targetPitch = 0.32;
      camState.yaw = camState.targetYaw = 0.05;
      camState.lookPivot.set(0, 1.2, -4.5);
      camState.targetLookPivot.set(0, 1.2, -4.5);
    `
  });
  await new Promise(r => setTimeout(r, 1200));
  const shotDeva = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('showcase_deva_monoliths.png', Buffer.from(shotDeva.data, 'base64'));
  console.log('Saved showcase_deva_monoliths.png');

  // 2. Cinematic Close-up of Asura Army (Midnight Obsidian Monoliths)
  await send('Runtime.evaluate', {
    expression: `
      camState.distance = camState.targetDistance = 9.5;
      camState.pitch = camState.targetPitch = 0.32;
      camState.yaw = camState.targetYaw = Math.PI - 0.05;
      camState.lookPivot.set(0, 1.2, 4.5);
      camState.targetLookPivot.set(0, 1.2, 4.5);
    `
  });
  await new Promise(r => setTimeout(r, 1200));
  const shotAsura = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('showcase_asura_monoliths.png', Buffer.from(shotAsura.data, 'base64'));
  console.log('Saved showcase_asura_monoliths.png');

  // 3. Wide Epic Clash Angle
  await send('Runtime.evaluate', {
    expression: `
      camState.distance = camState.targetDistance = 16.5;
      camState.pitch = camState.targetPitch = 0.42;
      camState.yaw = camState.targetYaw = 0.65;
      camState.lookPivot.set(0, 0.8, 0);
      camState.targetLookPivot.set(0, 0.8, 0);
    `
  });
  await new Promise(r => setTimeout(r, 1200));
  const shotClash = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('showcase_epic_clash.png', Buffer.from(shotClash.data, 'base64'));
  console.log('Saved showcase_epic_clash.png');

  ws.close();
  chrome.kill();
  console.log('All showcase shots saved successfully!');
}

run().catch(console.error);
