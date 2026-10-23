const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const tempUserDataDir = path.join(__dirname, '.temp_chrome_profile_' + Date.now());

async function run() {
  console.log('Starting Visual Verification Capture...');
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9245',
    '--disable-gpu-sandbox',
    '--disable-cache',
    '--user-data-dir=' + tempUserDataDir,
    '--use-gl=angle',
    '--use-angle=d3d11',
    '--window-size=1920,1080',
    'http://localhost:8080/index.html'
  ]);

  await new Promise(r => setTimeout(r, 2200));

  let res, tabs;
  for (let i = 0; i < 15; i++) {
    try {
      res = await fetch('http://127.0.0.1:9245/json');
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

  // Wait for game ready
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    const evalRes = await send('Runtime.evaluate', {
      expression: 'typeof ModelManager !== "undefined" && ModelManager.isLoaded && typeof activeRigs !== "undefined" && activeRigs.length === 32',
      returnByValue: true
    });
    if (evalRes && evalRes.result && evalRes.result.value) break;
  }

  // 1. Capture Battlefield & Ruins Overview
  console.log('Capturing Battlefield & Ruins Overview...');
  await send('Runtime.evaluate', {
    expression: `
      skipOpeningCinematic();
      camState.distance = camState.targetDistance = 24.0;
      camState.pitch = camState.targetPitch = 0.42;
      camState.yaw = camState.targetYaw = 0.55;
      camState.lookPivot.set(0, 0, 0);
      camState.targetLookPivot.set(0, 0, 0);
    `
  });
  await new Promise(r => setTimeout(r, 800));
  const snapRuins = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('vivid_ruins_verification.png', Buffer.from(snapRuins.data, 'base64'));
  console.log('Saved vivid_ruins_verification.png');

  // 2. Capture Pawn in Studio View (Verifying Left Hand Shield, Right Hand Sword)
  console.log('Capturing Pawn Weapon Hand Verification...');
  await send('Runtime.evaluate', {
    expression: `
      document.getElementById('tabStudioBtn').click();
      studioPieceType = PIECE_PAWN;
      rebuildStudioCharacter();
      camState.distance = camState.targetDistance = 4.2;
      camState.pitch = camState.targetPitch = 0.20;
      camState.yaw = camState.targetYaw = 3.14; // Facing front of character
      camState.lookPivot.set(0, 0.95, 0);
      camState.targetLookPivot.set(0, 0.95, 0);
    `
  });
  await new Promise(r => setTimeout(r, 1200));
  const snapPawnFront = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('pawn_hands_front_verification.png', Buffer.from(snapPawnFront.data, 'base64'));
  console.log('Saved pawn_hands_front_verification.png');

  // Also capture from behind
  await send('Runtime.evaluate', {
    expression: `
      camState.yaw = camState.targetYaw = 0.0; // Facing back of character
    `
  });
  await new Promise(r => setTimeout(r, 800));
  const snapPawnBack = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('pawn_hands_back_verification.png', Buffer.from(snapPawnBack.data, 'base64'));
  console.log('Saved pawn_hands_back_verification.png');

  // 3. Inspect Bishop Ratha wheels
  console.log('Inspecting Bishop Ratha wheels...');
  await send('Runtime.evaluate', {
    expression: `
      studioPieceType = PIECE_BISHOP;
      rebuildStudioCharacter();
      camState.distance = camState.targetDistance = 4.5;
      camState.pitch = camState.targetPitch = 0.22;
      camState.yaw = camState.targetYaw = 1.25; // Side view of wheel
      camState.lookPivot.set(0, 0.65, 0);
      camState.targetLookPivot.set(0, 0.65, 0);
    `
  });
  await new Promise(r => setTimeout(r, 1200));
  const snapBishop = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('bishop_wheel_verification.png', Buffer.from(snapBishop.data, 'base64'));
  console.log('Saved bishop_wheel_verification.png');

  ws.close();
  chrome.kill();
  console.log('Visual verification complete!');
}

run().catch(e => console.error(e));
