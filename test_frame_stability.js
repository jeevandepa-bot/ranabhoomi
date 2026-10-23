const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

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
    if (evalRes.result.value) break;
  }

  // Ensure output directory exists
  const outDir = path.join(__dirname, 'temp_frames');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  console.log('Capturing 30 consecutive frames during normal battlefield rendering...');
  const framePaths = [];
  for (let i = 0; i < 30; i++) {
    const ss = await send('Page.captureScreenshot', { format: 'png' });
    const p = path.join(outDir, `frame_${String(i).padStart(3, '0')}.png`);
    fs.writeFileSync(p, Buffer.from(ss.data, 'base64'));
    framePaths.push(p);
    await new Promise(r => setTimeout(r, 66)); // ~15-30 fps sampling
  }

  console.log(`Captured ${framePaths.length} frames.`);
  ws.close();
  chrome.kill();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
