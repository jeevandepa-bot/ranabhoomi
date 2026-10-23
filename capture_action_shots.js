const { spawn } = require('child_process');
const fs = require('fs');

async function captureAction() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9255',
    '--disable-gpu-sandbox',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9255',
    'http://localhost:8080/index.html'
  ]);

  let res, tabs;
  for (let i = 0; i < 20; i++) {
    try {
      res = await fetch('http://127.0.0.1:9255/json');
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
      expression: 'typeof ModelManager !== "undefined" && ModelManager.isLoaded && typeof activeRigs !== "undefined" && activeRigs.length === 32',
      returnByValue: true
    });
    if (chk && chk.result && chk.result.value) break;
  }

  // 1. Capture Cinematic Frame during opening flyover
  await new Promise(r => setTimeout(r, 800));
  let shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('audit_cinematic_opening.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved audit_cinematic_opening.png');

  // Skip cinematic to battle
  await send('Runtime.evaluate', {
    expression: 'if (typeof skipIntroCinematic === "function") skipIntroCinematic();'
  });
  await new Promise(r => setTimeout(r, 1200));

  // 2. Trigger Pawn Walk & capture mid-stride
  await send('Runtime.evaluate', {
    expression: `
      const pawnRig = activeRigs.find(r => r.type === 1 && r.team === 0);
      const targetPos = pawnRig.root.position.clone().add(new THREE.Vector3(0, 0, -4.0));
      camState.distance = camState.targetDistance = 4.2;
      camState.pitch = camState.targetPitch = 0.20;
      camState.yaw = camState.targetYaw = 0.85; // 3/4 side view to see leg stride
      camState.lookPivot.copy(pawnRig.root.position).add(new THREE.Vector3(0, 0.75, 0));
      camState.targetLookPivot.copy(camState.lookPivot);
      animateUnitWalkTo(pawnRig, targetPos, 2.5, false);
    `
  });

  await new Promise(r => setTimeout(r, 900)); // mid-stride capture
  shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('audit_pawn_mid_stride_walking.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved audit_pawn_mid_stride_walking.png');

  await send('Browser.close');
  process.exit(0);
}

captureAction();
