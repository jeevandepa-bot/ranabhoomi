const { spawn } = require('child_process');
const fs = require('fs');

async function shot(filename = 'current_battlefield_env.png', targetUrl = 'http://localhost:8080/index.html') {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9301',
    '--disable-gpu-sandbox',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_env',
    targetUrl
  ]);

  let res, tabs;
  for (let i = 0; i < 20; i++) {
    try {
      res = await fetch('http://127.0.0.1:9301/json');
      tabs = await res.json();
      if (tabs && tabs.length > 0) break;
    } catch (e) {
      await new Promise(r => setTimeout(r, 400));
    }
  }

  const target = tabs.find(t => t.type === 'page') || tabs[0];
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 1;
  const p = new Map();
  ws.onmessage = e => { const d = JSON.parse(e.data); if (d.id && p.has(d.id)) { p.get(d.id)(d.result); p.delete(d.id); } };
  const send = (m, a = {}) => new Promise(res => { const i = id++; p.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: a })); });
  await new Promise(r => ws.onopen = r);
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.reload', { ignoreCache: true });
  await new Promise(r => setTimeout(r, 4000));
  await send('Runtime.evaluate', { expression: 'if (typeof skipIntroCinematic === "function") skipIntroCinematic();' });
  await new Promise(r => setTimeout(r, 1000));

  await send('Runtime.evaluate', {
    expression: `
      if (window.camState) {
        window.camState.distance = window.camState.targetDistance = 22.0;
        window.camState.pitch = window.camState.targetPitch = 0.32;
        window.camState.yaw = window.camState.targetYaw = 0.55;
      }
    `
  });
  await new Promise(r => setTimeout(r, 1200));

  const img = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(filename, Buffer.from(img.data, 'base64'));
  console.log('Saved', filename);

  await send('Browser.close');
  process.exit(0);
}

const outFile = process.argv[2] || 'current_battlefield_env.png';
const targetUrl = process.argv[3] || 'http://localhost:8080/index.html';
shot(outFile, targetUrl);
