const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 9246;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://localhost:8080/index.html';
const OUT_BASE = path.join(__dirname, 'pure_board_frames');

async function run() {
  console.log('===============================================================');
  console.log('PURE BOARD RENDERING STABILITY AUDIT (ISOLATED FROM PARTICLES)');
  console.log('===============================================================');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-pure-board-'));
  if (fs.existsSync(OUT_BASE)) {
    fs.rmSync(OUT_BASE, { recursive: true, force: true });
  }
  fs.mkdirSync(OUT_BASE, { recursive: true });

  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${tmpDir}`,
    '--disable-gpu-sandbox',
    '--use-gl=angle',
    '--use-angle=d3d11',
    '--window-size=1920,1080',
    URL
  ]);

  let tabs = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      tabs = await res.json();
      if (tabs && tabs.length > 0) break;
    } catch (e) {}
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

  // Wait until models loaded
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 500));
    const evalRes = await send('Runtime.evaluate', {
      expression: 'typeof ModelManager !== "undefined" && ModelManager.isLoaded && typeof activeRigs !== "undefined" && activeRigs.length === 32',
      returnByValue: true
    });
    if (evalRes && evalRes.result && evalRes.result.value) break;
  }

  console.log('Models ready. Temporarily hiding atmospheric mist and particle systems to isolate pure board mesh...');
  await send('Runtime.evaluate', {
    expression: `
      if (typeof flameField !== "undefined") flameField.visible = false;
      if (typeof stormField !== "undefined") stormField.visible = false;
      if (typeof mistPlane1 !== "undefined") mistPlane1.visible = false;
      if (typeof mistPlane2 !== "undefined") mistPlane2.visible = false;
    `
  });

  const angles = [
    { name: 'default_33deg', pitch: 0.58, yaw: 0.32, dist: 21.0, pivotY: 0.4 },
    { name: 'grazing_5deg', pitch: 0.087266, yaw: 0.32, dist: 21.0, pivotY: 0.0 },
    { name: 'grazing_10deg', pitch: 0.174533, yaw: 0.32, dist: 21.0, pivotY: 0.0 },
    { name: 'grazing_15deg', pitch: 0.261799, yaw: 0.32, dist: 21.0, pivotY: 0.2 },
    { name: 'steep_85deg', pitch: 1.48353, yaw: 0.32, dist: 21.0, pivotY: 0.0 },
    { name: 'zoom_close_4_5', pitch: 0.58, yaw: 0.32, dist: 4.5, pivotY: 0.0 },
    { name: 'zoom_far_50_0', pitch: 0.58, yaw: 0.32, dist: 50.0, pivotY: 0.0 }
  ];

  for (const a of angles) {
    const dir = path.join(OUT_BASE, a.name);
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Testing pure board at: ${a.name} (pitch=${a.pitch.toFixed(3)}, dist=${a.dist})...`);

    await send('Runtime.evaluate', {
      expression: `
        camState.targetPitch = ${a.pitch};
        camState.pitch = ${a.pitch};
        camState.targetYaw = ${a.yaw};
        camState.yaw = ${a.yaw};
        camState.targetDistance = ${a.dist};
        camState.distance = ${a.dist};
        camState.targetLookPivot.set(0, ${a.pivotY}, 0);
        camState.lookPivot.set(0, ${a.pivotY}, 0);
      `
    });
    await new Promise(r => setTimeout(r, 600));

    for (let i = 0; i < 15; i++) {
      const ss = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(dir, `frame_${String(i).padStart(3, '0')}.png`), Buffer.from(ss.data, 'base64'));
      await new Promise(r => setTimeout(r, 66));
    }
  }

  // Restore ember particles
  await send('Runtime.evaluate', {
    expression: 'if (typeof emberField !== "undefined") { emberField.visible = true; }'
  });

  ws.close();
  chrome.kill();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}

  console.log('Pure board capture finished.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
