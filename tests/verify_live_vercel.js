const { spawn } = require('child_process');
const fs = require('fs');

async function testVercelFixed() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9292',
    '--disable-gpu-sandbox',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9292',
    'https://ranabhoomi.vercel.app'
  ]);

  let res, tabs;
  for (let i = 0; i < 20; i++) {
    try {
      res = await fetch('http://127.0.0.1:9292/json');
      tabs = await res.json();
      if (tabs && tabs.length > 0) break;
    } catch (e) {
      await new Promise(r => setTimeout(r, 400));
    }
  }

  const target = tabs.find(t => t.type === 'page' && t.url.includes('ranabhoomi')) || tabs[0];
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 1;
  const p = new Map();
  const networkErrors = [];

  ws.onmessage = e => {
    const d = JSON.parse(e.data);
    if (d.method === 'Network.responseReceived') {
      if (d.params.response.status >= 400) {
        networkErrors.push(d.params.response.status + ' ' + d.params.response.url);
      }
    }
    if (d.id && p.has(d.id)) { p.get(d.id)(d.result); p.delete(d.id); }
  };
  const send = (m, a = {}) => new Promise(res => { const i = id++; p.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: a })); });
  await new Promise(r => ws.onopen = r);
  await send('Runtime.enable');
  await send('Network.enable');

  await new Promise(r => setTimeout(r, 4500));

  await send('Runtime.evaluate', {
    expression: 'if (typeof startGameNow === "function") startGameNow(); if (typeof skipOpeningCinematic === "function") skipOpeningCinematic();'
  });
  await new Promise(r => setTimeout(r, 2000));

  console.log('Network errors on fixed Vercel:', networkErrors);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('vercel_fixed_board.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved vercel_fixed_board.png');

  await send('Browser.close');
  process.exit(0);
}

testVercelFixed();
