const { spawn } = require('child_process');

async function checkFacing() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9240',
    '--disable-gpu-sandbox',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9240',
    'http://localhost:8080/index.html'
  ]);
  let res, tabs;
  for (let i = 0; i < 20; i++) {
    try {
      res = await fetch('http://127.0.0.1:9240/json');
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

  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 400));
    const chk = await send('Runtime.evaluate', {
      expression: 'typeof unitGrid !== "undefined" && unitGrid[0] && unitGrid[0][0] && unitGrid[0][0].root',
      returnByValue: true
    });
    if (chk && chk.result && chk.result.value) break;
  }

  const result = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const whiteRook = unitGrid[0][0];
        const blackRook = unitGrid[0][7];
        const whiteKnight = unitGrid[1][0];
        const blackKnight = unitGrid[1][7];

        function getInfo(rig, name) {
          const rootPos = new THREE.Vector3();
          rig.root.getWorldPosition(rootPos);
          let torsoRotY = rig.torso ? rig.torso.rotation.y : 0;
          let modelRotY = 0;
          if (rig.torso && rig.torso.children[0]) {
            modelRotY = rig.torso.children[0].rotation.y;
          }
          return {
            name,
            team: rig.team === 0 ? 'WHITE' : 'BLACK',
            rootPos: { x: +rootPos.x.toFixed(2), y: +rootPos.y.toFixed(2), z: +rootPos.z.toFixed(2) },
            rootRotY: +rig.root.rotation.y.toFixed(2),
            modelRotY: +modelRotY.toFixed(2),
            totalFacingRad: +(rig.root.rotation.y + modelRotY).toFixed(2)
          };
        }

        return {
          whiteRook: getInfo(whiteRook, 'White Rook (a1)'),
          blackRook: getInfo(blackRook, 'Black Rook (a8)'),
          whiteKnight: getInfo(whiteKnight, 'White Knight (b1)'),
          blackKnight: getInfo(blackKnight, 'Black Knight (b8)')
        };
      })()
    `,
    returnByValue: true
  });

  console.log('UNITS ROTATION AUDIT:');
  console.log(JSON.stringify(result.result.value, null, 2));

  ws.close();
  chrome.kill();
}
checkFacing().catch(console.error);
