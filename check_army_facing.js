const { spawn } = require('child_process');
const fs = require('fs');

async function testBoard() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9232',
    '--disable-gpu-sandbox',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9232',
    'http://localhost:8080/index.html'
  ]);
  let res, tabs;
  for (let i = 0; i < 15; i++) {
    try {
      res = await fetch('http://127.0.0.1:9232/json');
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
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 400));
    const chk = await send('Runtime.evaluate', {
      expression: 'typeof ModelManager !== "undefined" && ModelManager.isLoaded && typeof activeRigs !== "undefined" && activeRigs.length === 32',
      returnByValue: true
    });
    if (chk && chk.result && chk.result.value) break;
  }

  // Camera side view looking at row 1 and 2
  await send('Runtime.evaluate', {
    expression: `
      camState.distance = camState.targetDistance = 12.0;
      camState.pitch = camState.targetPitch = 0.40;
      camState.yaw = camState.targetYaw = 1.57; // side view
      camState.lookPivot.set(0, 0.5, 3.0);
      camState.targetLookPivot.set(0, 0.5, 3.0);
    `
  });
  await new Promise(r => setTimeout(r, 800));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('test_army_facing_side.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved test_army_facing_side.png');

  ws.close();
  chrome.kill();
}
testBoard().catch(console.error);
