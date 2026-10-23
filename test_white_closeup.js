const { spawn } = require('child_process');
const fs = require('fs');

async function testElephantCloseup() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9254',
    '--disable-gpu-sandbox',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9254',
    'http://localhost:8080/index.html'
  ]);
  let res, tabs;
  for (let i = 0; i < 20; i++) {
    try {
      res = await fetch('http://127.0.0.1:9254/json');
      tabs = await res.json();
      if (tabs && tabs.length > 0) break;
    } catch (e) {
      await new Promise(r => setTimeout(r, 400));
    }
  }
  const target = tabs.find(t => t.type === 'page' && t.url.includes('localhost:8080')) || tabs[0];
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 1;
  const p = new Map();
  ws.onmessage = e => { const d = JSON.parse(e.data); if (d.id && p.has(d.id)) { p.get(d.id)(d.result); p.delete(d.id); } };
  const send = (m, a = {}) => new Promise(res => { const i = id++; p.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: a })); });
  await new Promise(r => ws.onopen = r);
  await send('Runtime.enable');
  await send('Page.enable');

  for (let i = 0; i < 35; i++) {
    await new Promise(r => setTimeout(r, 400));
    const chk = await send('Runtime.evaluate', {
      expression: 'typeof window.activeRigs !== "undefined" && window.activeRigs.length === 32',
      returnByValue: true
    });
    if (chk && chk.result && chk.result.value) break;
  }

  // Camera looking directly at White Rook at a1 (-7, 0, 7) from front-quarter view
  await send('Runtime.evaluate', {
    expression: `
      camState.distance = camState.targetDistance = 4.2;
      camState.pitch = camState.targetPitch = 0.32;
      camState.yaw = camState.targetYaw = 2.8; // Looking at front-three-quarter of White Rook
      camState.lookPivot.set(-7.0, 1.4, 7.0);
      camState.targetLookPivot.set(-7.0, 1.4, 7.0);
    `
  });
  await new Promise(r => setTimeout(r, 800));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('audit_white_elephant_closeup.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved audit_white_elephant_closeup.png');

  // Also capture Knight closeup at b1 (-5, 0, 7)
  await send('Runtime.evaluate', {
    expression: `
      camState.distance = camState.targetDistance = 3.6;
      camState.pitch = camState.targetPitch = 0.28;
      camState.yaw = camState.targetYaw = 2.8;
      camState.lookPivot.set(-5.0, 1.3, 7.0);
      camState.targetLookPivot.set(-5.0, 1.3, 7.0);
    `
  });
  await new Promise(r => setTimeout(r, 800));
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('audit_white_knight_closeup.png', Buffer.from(shot2.data, 'base64'));
  console.log('Saved audit_white_knight_closeup.png');

  ws.close();
  chrome.kill();
}
testElephantCloseup().catch(console.error);
