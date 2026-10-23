const { spawn } = require('child_process');

async function checkFacing() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9234',
    '--disable-gpu-sandbox',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9234',
    'http://localhost:8080/index.html'
  ]);
  let res, tabs;
  for (let i = 0; i < 20; i++) {
    try {
      res = await fetch('http://127.0.0.1:9234/json');
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

  for (let i = 0; i < 35; i++) {
    await new Promise(r => setTimeout(r, 400));
    const chk = await send('Runtime.evaluate', {
      expression: 'typeof ModelManager !== "undefined" && ModelManager.isLoaded && typeof activeRigs !== "undefined" && activeRigs.length === 32',
      returnByValue: true
    });
    if (chk && chk.result && chk.result.value) break;
  }

  // Inspect the White Rook (e.g. file 0, rank 0) and Black Rook (file 0, rank 7)
  const facingCheck = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const whiteRook = unitGrid[0][0]; // a1
        const blackRook = unitGrid[0][7]; // a8
        const whiteKnight = unitGrid[1][0]; // b1
        const blackKnight = unitGrid[1][7]; // b8

        // Calculate trunk/face world position relative to root
        function getFrontZ(rig) {
          const wp = new THREE.Vector3();
          rig.root.getWorldPosition(wp);
          let maxZDiff = 0;
          let frontPartZ = 0;
          rig.root.traverse(c => {
            if (c.isMesh) {
              const cwp = new THREE.Vector3();
              c.getWorldPosition(cwp);
              const dz = cwp.z - wp.z;
              if (Math.abs(dz) > Math.abs(maxZDiff)) {
                maxZDiff = dz;
                frontPartZ = cwp.z;
              }
            }
          });
          return { rootZ: +wp.z.toFixed(2), frontPartZ: +frontPartZ.toFixed(2), facingDiffZ: +(frontPartZ - wp.z).toFixed(2), rootRotY: +rig.root.rotation.y.toFixed(2) };
        }

        return {
          whiteRook: getFrontZ(whiteRook),
          blackRook: getFrontZ(blackRook),
          whiteKnight: getFrontZ(whiteKnight),
          blackKnight: getFrontZ(blackKnight)
        };
      })()
    `,
    returnByValue: true
  });
  console.log('Facing check on board:', JSON.stringify(facingCheck.result.value, null, 2));

  ws.close();
  chrome.kill();
}
checkFacing().catch(console.error);
