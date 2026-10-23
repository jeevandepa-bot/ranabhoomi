const { spawn } = require('child_process');
const fs = require('fs');

async function captureVerificationShots() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9244',
    '--disable-gpu-sandbox',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9244',
    'http://localhost:8080/index.html'
  ]);

  let res, tabs;
  for (let i = 0; i < 20; i++) {
    try {
      res = await fetch('http://127.0.0.1:9244/json');
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

  // Skip cinematic to land on battle board
  await send('Runtime.evaluate', {
    expression: 'if (typeof skipIntroCinematic === "function") skipIntroCinematic();'
  });
  await new Promise(r => setTimeout(r, 1200));

  // 1. Overall battlefield isometric view
  await send('Runtime.evaluate', {
    expression: `
      camState.distance = camState.targetDistance = 14.5;
      camState.pitch = camState.targetPitch = 0.52;
      camState.yaw = camState.targetYaw = 0.65;
      camState.lookPivot.set(0, 0, 0);
      camState.targetLookPivot.set(0, 0, 0);
    `
  });
  await new Promise(r => setTimeout(r, 800));
  let shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('audit_battlefield_overview.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved audit_battlefield_overview.png');

  // 2. White Pawn Padati closeup showing Dhal shield and Khanda sword
  await send('Runtime.evaluate', {
    expression: `
      const pawnRig = activeRigs.find(r => r.type === 1 && r.team === TEAM_WHITE);
      const wp = new THREE.Vector3();
      pawnRig.root.getWorldPosition(wp);
      camState.distance = camState.targetDistance = 3.6;
      camState.pitch = camState.targetPitch = 0.22;
      camState.yaw = camState.targetYaw = 0.15; // front view looking at white pawn
      camState.lookPivot.copy(wp).add(new THREE.Vector3(0, 0.75, 0));
      camState.targetLookPivot.copy(camState.lookPivot);
    `
  });
  await new Promise(r => setTimeout(r, 800));
  shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('audit_pawn_padati_closeup.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved audit_pawn_padati_closeup.png');

  // 3. White Elephant Gajraj closeup showing forward tusks and howdah
  await send('Runtime.evaluate', {
    expression: `
      const rookRig = activeRigs.find(r => r.type === 4 && r.team === TEAM_WHITE);
      const wp = new THREE.Vector3();
      rookRig.root.getWorldPosition(wp);
      camState.distance = camState.targetDistance = 5.2;
      camState.pitch = camState.targetPitch = 0.25;
      camState.yaw = camState.targetYaw = 0.35; // front 3/4 view looking at elephant
      camState.lookPivot.copy(wp).add(new THREE.Vector3(0, 1.1, 0));
      camState.targetLookPivot.copy(camState.lookPivot);
    `
  });
  await new Promise(r => setTimeout(r, 800));
  shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('audit_elephant_gajraj_closeup.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved audit_elephant_gajraj_closeup.png');

  ws.close();
  chrome.kill();
  console.log('All verification shots complete.');
}

captureVerificationShots().catch(console.error);
