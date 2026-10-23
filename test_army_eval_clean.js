const { spawn } = require('child_process');

async function testArmy() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9252',
    '--disable-gpu-sandbox',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9252',
    'http://localhost:8080/index.html'
  ]);

  let res, tabs;
  for (let i = 0; i < 20; i++) {
    try {
      res = await fetch('http://127.0.0.1:9252/json');
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
      expression: 'typeof window.activeRigs !== "undefined" && window.activeRigs.length === 32',
      returnByValue: true
    });
    if (chk && chk.result && chk.result.value) break;
  }

  const result = await send('Runtime.evaluate', {
    expression: `
      (() => {
        try {
          const whiteRook = window.unitGrid[0][0]; // a1
          const blackRook = window.unitGrid[0][7]; // a8
          const whiteKnight = window.unitGrid[1][0]; // b1
          const blackKnight = window.unitGrid[1][7]; // b8
          const whitePawn = window.unitGrid[0][1]; // a2

          let whiteElephantColorHex = null;
          whiteRook.root.traverse(c => {
            if (c.isMesh && c.material) {
              const mats = Array.isArray(c.material) ? c.material : [c.material];
              mats.forEach(m => {
                const mn = (m.name || '').toLowerCase();
                if (mn.includes('elephant') || mn.includes('skin')) {
                  whiteElephantColorHex = '#' + m.color.getHexString();
                }
              });
            }
          });

          const getModelScale = rig => {
            let s = 1;
            if (rig.torso && rig.torso.children[0]) {
              s = rig.torso.children[0].scale.x;
            }
            return +s.toFixed(2);
          };

          let totalHoverRings = 0;
          window.activeRigs.forEach(r => {
            if (r.archetypeEmblemMesh) totalHoverRings++;
          });

          return {
            whiteRookFacingY: +whiteRook.root.rotation.y.toFixed(2),
            blackRookFacingY: +blackRook.root.rotation.y.toFixed(2),
            whiteKnightFacingY: +whiteKnight.root.rotation.y.toFixed(2),
            blackKnightFacingY: +blackKnight.root.rotation.y.toFixed(2),
            whitePawnFacingY: +whitePawn.root.rotation.y.toFixed(2),
            whiteElephantColorHex,
            whiteKnightScale: getModelScale(whiteKnight),
            blackKnightScale: getModelScale(blackKnight),
            whitePawnScale: getModelScale(whitePawn),
            totalHoverRings
          };
        } catch (e) {
          return { error: e.message, stack: e.stack };
        }
      })()
    `,
    returnByValue: true
  });

  console.log('AUDIT RESULT:', JSON.stringify(result, null, 2));

  ws.close();
  chrome.kill();
}
testArmy().catch(console.error);
