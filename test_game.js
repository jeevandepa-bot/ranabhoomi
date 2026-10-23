const { spawn } = require('child_process');
const fs = require('fs');

async function run() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu-sandbox',
    '--use-gl=angle',
    '--use-angle=d3d11',
    '--window-size=1920,1080',
    'http://localhost:8080/index.html'
  ]);

  console.log('Launched Chrome...');
  await new Promise(r => setTimeout(r, 2000));

  let res, tabs;
  for (let i = 0; i < 10; i++) {
    try {
      res = await fetch('http://127.0.0.1:9222/json');
      tabs = await res.json();
      if (tabs && tabs.length > 0) break;
    } catch (e) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  const target = tabs.find(t => t.type === 'page' && t.url.includes('localhost:8080')) || tabs[0];
  console.log('Connecting to page:', target.title, target.webSocketDebuggerUrl);

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
    } else if (data.method === 'Runtime.consoleAPICalled') {
      const text = data.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ');
      console.log(`[BROWSER CONSOLE ${data.params.type.toUpperCase()}]: ${text}`);
    } else if (data.method === 'Runtime.exceptionThrown') {
      console.error('[BROWSER EXCEPTION]:', data.params.exceptionDetails);
    }
  };

  await new Promise(resolve => ws.onopen = resolve);
  console.log('DevTools WebSocket connected.');

  await send('Runtime.enable');
  await send('Page.enable');

  // Poll until ModelManager is loaded and units are spawned
  console.log('Waiting for battlefield initialization...');
  let state = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    const evalRes = await send('Runtime.evaluate', {
      expression: `({
        modelManagerLoaded: typeof ModelManager !== 'undefined' ? ModelManager.isLoaded : false,
        modelKeys: typeof ModelManager !== 'undefined' ? Object.keys(ModelManager.models) : [],
        activeRigsCount: typeof activeRigs !== 'undefined' ? activeRigs.length : 0,
        realisticUnitsCount: typeof activeRigs !== 'undefined' ? activeRigs.filter(r => r.isRealistic).length : 0,
        sceneChildren: typeof scene !== 'undefined' ? scene.children.length : 0,
        fps: typeof lastFps !== 'undefined' ? lastFps : null
      })`,
      returnByValue: true
    });
    state = evalRes.result.value;
    console.log(`Step ${i}: modelsLoaded=${state.modelManagerLoaded}, activeRigs=${state.activeRigsCount}/${state.realisticUnitsCount}`);
    if (state.modelManagerLoaded && state.activeRigsCount === 32) {
      break;
    }
  }

  console.log('Battlefield State:', state);

  // Take screenshot
  const screenshotRes = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('browser_screenshot.png', Buffer.from(screenshotRes.data, 'base64'));
  console.log('Saved browser_screenshot.png (1080p)');

  ws.close();
  chrome.kill();
  console.log('Completed successfully!');
}

run().catch(err => {
  console.error('Test script failed:', err);
  process.exit(1);
});
