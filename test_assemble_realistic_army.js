const { spawn } = require('child_process');
const fs = require('fs');

async function testAssemble() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9272',
    '--disable-gpu-sandbox',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9272',
    'http://localhost:8080/index.html'
  ]);
  let res, tabs;
  for (let i = 0; i < 20; i++) {
    try {
      res = await fetch('http://127.0.0.1:9272/json');
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

  // Inject the cleanup on elephant right away in the active game
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        window.activeRigs.forEach(rig => {
          if (rig.type === 'r') { // Rook
            rig.root.traverse(child => {
              if (child.isMesh) {
                const n = child.name || '';
                const match = n.match(/Cylinder\\.?(\\d+)/);
                const cylNum = match ? parseInt(match[1]) : (n === 'Cylinder' ? 0 : -1);
                if (n.includes('Pedestal') || n.includes('Rune') ||
                    (n.startsWith('Torus') && !n.includes('Tusk')) ||
                    (cylNum >= 0 && (cylNum <= 3 || cylNum >= 33)) ||
                    n.includes('Cube') || n.includes('Bastion') || n.includes('Upper_Deck') ||
                    n.includes('Cone')) {
                  child.visible = false;
                }
              }
            });
          }
          if (rig.type === 'b') { // Bishop Chariot
            rig.root.traverse(child => {
              if (child.isMesh) {
                const n = child.name || '';
                // Hide crude orange cylinder mannequin and floating halo ring
                if (n.includes('Archer_Robe') || n.includes('Archer_Head') || n.includes('Prabhamandala') || n.includes('Halo')) {
                  child.visible = false;
                }
              }
            });
          }
        });
      })()
    `
  });

  // Take fresh closeup of White Elephant
  await send('Runtime.evaluate', {
    expression: `
      camState.distance = camState.targetDistance = 4.2;
      camState.pitch = camState.targetPitch = 0.32;
      camState.yaw = camState.targetYaw = 2.8;
      camState.lookPivot.set(-7.0, 1.4, 7.0);
      camState.targetLookPivot.set(-7.0, 1.4, 7.0);
    `
  });
  await new Promise(r => setTimeout(r, 600));
  const shotElephant = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('test_cleaned_white_elephant.png', Buffer.from(shotElephant.data, 'base64'));
  console.log('Saved test_cleaned_white_elephant.png');

  // Take fresh closeup of White Bishop
  await send('Runtime.evaluate', {
    expression: `
      camState.distance = camState.targetDistance = 3.6;
      camState.pitch = camState.targetPitch = 0.28;
      camState.yaw = camState.targetYaw = 2.8;
      camState.lookPivot.set(-3.0, 1.3, 7.0);
      camState.targetLookPivot.set(-3.0, 1.3, 7.0);
    `
  });
  await new Promise(r => setTimeout(r, 600));
  const shotBishop = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('test_cleaned_white_bishop.png', Buffer.from(shotBishop.data, 'base64'));
  console.log('Saved test_cleaned_white_bishop.png');

  ws.close();
  chrome.kill();
}
testAssemble().catch(console.error);
