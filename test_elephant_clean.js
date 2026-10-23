const { spawn } = require('child_process');

async function testElephantClean() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9270',
    '--disable-gpu-sandbox',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9270',
    'http://localhost:8080/index.html'
  ]);
  let res, tabs;
  for (let i = 0; i < 20; i++) {
    try {
      res = await fetch('http://127.0.0.1:9270/json');
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
      expression: 'typeof window.unitGrid !== "undefined" && !!window.unitGrid[0][0]',
      returnByValue: true
    });
    if (chk && chk.result && chk.result.value) break;
  }

  const result = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const rook = window.unitGrid[0][0];
        rook.root.traverse(child => {
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
        const remaining = [];
        rook.root.traverse(c => { if (c.isMesh && c.visible) remaining.push(c.name); });
        return remaining;
      })()
    `,
    returnByValue: true
  });
  console.log('REMAINING VISIBLE MESHES ON ELEPHANT:', result.result.value);
  ws.close();
  chrome.kill();
}
testElephantClean().catch(console.error);
