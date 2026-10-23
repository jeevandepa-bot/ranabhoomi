const { spawn } = require('child_process');
const fs = require('fs');

async function checkHorse() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9228',
    '--disable-gpu-sandbox',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9228',
    'http://localhost:8080/index.html'
  ]);
  await new Promise(r => setTimeout(r, 2000));
  let res, tabs;
  for (let i = 0; i < 15; i++) {
    try {
      res = await fetch('http://127.0.0.1:9228/json');
      tabs = await res.json();
      if (tabs && tabs.length > 0) break;
    } catch (e) {
      await new Promise(r => setTimeout(r, 400));
    }
  }
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  let id = 1;
  const p = new Map();
  ws.onmessage = e => { const d = JSON.parse(e.data); if (d.id && p.has(d.id)) { p.get(d.id)(d.result); p.delete(d.id); } };
  const send = (m, a = {}) => new Promise(res => { const i = id++; p.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: a })); });
  await new Promise(r => ws.onopen = r);
  await send('Runtime.enable');
  await send('Page.enable');
  await new Promise(r => setTimeout(r, 2500));

  await send('Runtime.evaluate', {
    expression: `
      document.getElementById('tabStudioBtn').click();
      studioPieceType = PIECE_KNIGHT;
      rebuildStudioCharacter();
      camState.distance = camState.targetDistance = 4.5;
      camState.pitch = camState.targetPitch = 0.35;
      camState.yaw = camState.targetYaw = 0.5;
      camState.lookPivot.set(0, 0.8, 0);
      camState.targetLookPivot.set(0, 0.8, 0);
    `
  });
  await new Promise(r => setTimeout(r, 800));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('test_horse_studio.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved test_horse_studio.png');

  ws.close();
  chrome.kill();
}
checkHorse().catch(console.error);
