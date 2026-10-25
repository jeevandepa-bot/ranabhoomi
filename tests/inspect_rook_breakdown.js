const { spawn } = require('child_process');

async function inspectRook() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9262',
    '--disable-gpu-sandbox',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9262',
    'http://localhost:8080/index.html'
  ]);

  let res, tabs;
  for (let i = 0; i < 20; i++) {
    try {
      res = await fetch('http://127.0.0.1:9262/json');
      tabs = await res.json();
      if (tabs && tabs.length > 0) break;
    } catch (e) {
      await new Promise(r => setTimeout(r, 400));
    }
  }

  const target = tabs[0];
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 1;
  const p = new Map();
  ws.onmessage = e => { const d = JSON.parse(e.data); if (d.id && p.has(d.id)) { p.get(d.id)(d.result); p.delete(d.id); } };
  const send = (m, a = {}) => new Promise(r => { const i = id++; p.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: a })); });
  await new Promise(r => ws.onopen = r);
  await send('Runtime.enable');

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    const chk = await send('Runtime.evaluate', { expression: 'typeof activeRigs !== "undefined" && activeRigs.length === 32', returnByValue: true });
    if (chk && chk.result && chk.result.value) break;
  }

  const r = await send('Runtime.evaluate', {
    expression: `(() => {
      const rook = activeRigs[0];
      const rootPos = new THREE.Vector3();
      rook.root.getWorldPosition(rootPos);
      const box = new THREE.Box3().setFromObject(rook.root);
      const size = new THREE.Vector3();
      box.getSize(size);

      const meshes = [];
      rook.root.traverse(c => {
        if (c.isMesh && c.visible !== false) {
          const b = new THREE.Box3().setFromObject(c);
          const s = new THREE.Vector3();
          b.getSize(s);
          meshes.push({
            name: c.name,
            parentName: c.parent ? c.parent.name : null,
            width_X: +s.x.toFixed(4),
            height_Y: +s.y.toFixed(4),
            length_Z: +s.z.toFixed(4),
            minX: +(b.min.x - rootPos.x).toFixed(4),
            maxX: +(b.max.x - rootPos.x).toFixed(4),
            minY: +b.min.y.toFixed(4),
            minZ: +(b.min.z - rootPos.z).toFixed(4),
            maxZ: +(b.max.z - rootPos.z).toFixed(4)
          });
        }
      });
      meshes.sort((a,b) => b.width_X - a.width_X);
      return {
        overallSize: { x: +size.x.toFixed(4), y: +size.y.toFixed(4), z: +size.z.toFixed(4) },
        top5Meshes: meshes.slice(0, 5),
        rootChildren: rook.root.children.map(c => ({ name: c.name, type: c.type, isMesh: !!c.isMesh }))
      };
    })()`,
    returnByValue: true
  });

  console.log(JSON.stringify(r.result.value, null, 2));
  ws.close();
  chrome.kill();
}

inspectRook().catch(console.error);
