const { spawn } = require('child_process');
async function inspectElephant() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9258',
    '--disable-gpu-sandbox',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9258',
    'http://localhost:8080/index.html'
  ]);
  let res, tabs;
  for (let i = 0; i < 20; i++) {
    try {
      res = await fetch('http://127.0.0.1:9258/json');
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
        const nodes = [];
        rook.root.traverse(c => {
          nodes.push({ name: c.name, type: c.type, visible: c.visible });
        });
        return nodes;
      })()
    `,
    returnByValue: true
  });
  const visibleMeshes = result.result.value.filter(n => n.type === 'Mesh' && n.visible);
  console.log('TOTAL NODES:', result.result.value.length);
  console.log('VISIBLE MESHES:', visibleMeshes.map(m => m.name));
  ws.close();
  chrome.kill();
}
inspectElephant().catch(console.error);
