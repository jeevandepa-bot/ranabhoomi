const { spawn } = require('child_process');
const fs = require('fs');

async function testVercelCleanSparks() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9299',
    '--disable-gpu-sandbox',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_clean_sparks',
    'https://ranabhoomi.vercel.app'
  ]);

  let res, tabs;
  for (let i = 0; i < 20; i++) {
    try {
      res = await fetch('http://127.0.0.1:9299/json');
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
  ws.onmessage = e => { const d = JSON.parse(e.data); if (d.id && p.has(d.id)) { p.get(d.id)(d.result); p.delete(d.id); } };
  const send = (m, a = {}) => new Promise(res => { const i = id++; p.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: a })); });
  await new Promise(r => ws.onopen = r);
  await send('Runtime.enable');

  await new Promise(r => setTimeout(r, 4500));
  await send('Runtime.evaluate', { expression: 'if (typeof skipIntroCinematic === "function") skipIntroCinematic();' });
  await new Promise(r => setTimeout(r, 1200));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('clean_field_board.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved clean_field_board.png');

  await send('Browser.close');
  process.exit(0);
}

testVercelCleanSparks();
