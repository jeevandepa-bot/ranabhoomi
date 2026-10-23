const { spawn } = require('child_process');

async function measure() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9229',
    '--disable-gpu-sandbox',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9229',
    'http://localhost:8080/index.html'
  ]);
  let res, tabs;
  for (let i = 0; i < 15; i++) {
    try {
      res = await fetch('http://127.0.0.1:9229/json');
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
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 400));
    const chk = await send('Runtime.evaluate', {
      expression: 'typeof ModelManager !== "undefined" && ModelManager.isLoaded && typeof activeRigs !== "undefined" && activeRigs.length === 32',
      returnByValue: true
    });
    if (chk && chk.result && chk.result.value) break;
  }

  const bounds = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const types = [PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING];
        const names = ['Pawn', 'Knight', 'Bishop', 'Rook', 'Queen', 'King'];
        const results = {};
        types.forEach((t, i) => {
          const rig = buildSculptedUnit(t, TEAM_WHITE);
          const box = new THREE.Box3().setFromObject(rig.root);
          const size = new THREE.Vector3();
          box.getSize(size);
          results[names[i]] = {
            width_X: +size.x.toFixed(3),
            height_Y: +size.y.toFixed(3),
            length_Z: +size.z.toFixed(3),
            minY: +box.min.y.toFixed(3),
            maxY: +box.max.y.toFixed(3)
          };
        });
        return results;
      })()
    `,
    returnByValue: true
  });
  console.log('Current Model Dimensions:', JSON.stringify(bounds, null, 2));

  ws.close();
  chrome.kill();
}
measure().catch(console.error);
