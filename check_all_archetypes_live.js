const { spawn } = require('child_process');
const fs = require('fs');

async function inspectAllPieces() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9258',
    '--disable-gpu-sandbox',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9258',
    'http://localhost:8080/index.html'
  ]);
  let res, tabs;
  for (let i = 0; i < 20; i++) {
    try {
      res = await fetch('http://127.0.0.1:9258/json');
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
      expression: 'typeof window.unitGrid !== "undefined" && !!window.unitGrid[0][0]',
      returnByValue: true
    });
    if (chk && chk.result && chk.result.value) break;
  }

  const pieces = [
    { name: 'Pawn_Padati', x: 0, y: 1, pos: [-7.0, 1.2, 5.0] },
    { name: 'Rook_Gajadhvaja', x: 0, y: 0, pos: [-7.0, 1.4, 7.0] },
    { name: 'Knight_Ashvarohi', x: 1, y: 0, pos: [-5.0, 1.3, 7.0] },
    { name: 'Bishop_Ratha', x: 2, y: 0, pos: [-3.0, 1.3, 7.0] },
    { name: 'Queen_Maharani', x: 3, y: 0, pos: [-1.0, 1.4, 7.0] },
    { name: 'King_Samrat', x: 4, y: 0, pos: [1.0, 1.5, 7.0] }
  ];

  for (const pc of pieces) {
    // Focus camera
    await send('Runtime.evaluate', {
      expression: `
        camState.distance = camState.targetDistance = 3.6;
        camState.pitch = camState.targetPitch = 0.28;
        camState.yaw = camState.targetYaw = 2.8;
        camState.lookPivot.set(${pc.pos[0]}, ${pc.pos[1]}, ${pc.pos[2]});
        camState.targetLookPivot.set(${pc.pos[0]}, ${pc.pos[1]}, ${pc.pos[2]});
      `
    });
    await new Promise(r => setTimeout(r, 600));
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`audit_char_${pc.name}_v2.png`, Buffer.from(shot.data, 'base64'));
    console.log(`Saved audit_char_${pc.name}_v2.png`);
  }

  ws.close();
  chrome.kill();
}
inspectAllPieces().catch(console.error);
