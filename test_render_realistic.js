const { spawn } = require('child_process');
const fs = require('fs');

async function testRenderRealisticCharacters() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9266',
    '--disable-gpu-sandbox',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9266',
    'http://localhost:8080/index.html'
  ]);
  let res, tabs;
  for (let i = 0; i < 20; i++) {
    try {
      res = await fetch('http://127.0.0.1:9266/json');
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
      expression: 'typeof window.THREE !== "undefined" && typeof window.scene !== "undefined"',
      returnByValue: true
    });
    if (chk && chk.result && chk.result.value) break;
  }

  const renderResult = await send('Runtime.evaluate', {
    expression: `
      (async () => {
        const loader = new THREE.GLTFLoader();
        const testGroup = new THREE.Group();
        testGroup.name = 'TEST_REALISTIC_GROUP';

        // 1. Soldier
        const soldierGltf = await new Promise(r => loader.load('assets/soldier.glb', r));
        const soldier = soldierGltf.scene;
        soldier.scale.setScalar(1.0);
        soldier.position.set(-1.5, 0, 0);
        testGroup.add(soldier);

        // 2. Queen
        const queenGltf = await new Promise(r => loader.load('assets/queen.glb', r));
        const queen = queenGltf.scene;
        queen.scale.setScalar(100.0);
        queen.position.set(1.5, 0, 0);
        testGroup.add(queen);

        window.scene.add(testGroup);

        camState.distance = camState.targetDistance = 4.5;
        camState.pitch = camState.targetPitch = 0.25;
        camState.yaw = camState.targetYaw = 0.0;
        camState.lookPivot.set(0, 1.2, 0);
        camState.targetLookPivot.set(0, 1.2, 0);

        return { ok: true };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('SPAWN RESULT:', renderResult.result.value);
  await new Promise(r => setTimeout(r, 800));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('test_realistic_soldier_queen.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved test_realistic_soldier_queen.png');

  ws.close();
  chrome.kill();
}
testRenderRealisticCharacters().catch(console.error);
