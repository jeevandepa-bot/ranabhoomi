const { spawn } = require('child_process');

async function testFacing() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9227',
    '--disable-gpu-sandbox',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9227',
    'http://localhost:8080/index.html'
  ]);
  let res, tabs;
  for (let i = 0; i < 15; i++) {
    try {
      res = await fetch('http://127.0.0.1:9227/json');
      tabs = await res.json();
      if (tabs && tabs.length > 0) break;
    } catch (e) {
      await new Promise(r => setTimeout(r, 400));
    }
  }
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  let id = 1;
  const p = new Map();
  ws.onmessage = e => {
    const d = JSON.parse(e.data);
    if (d.id && p.has(d.id)) { p.get(d.id)(d.result); p.delete(d.id); }
    else if (d.method === 'Runtime.consoleAPICalled') {
      console.log('BROWSER CONSOLE:', d.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' '));
    } else if (d.method === 'Runtime.exceptionThrown') {
      console.error('BROWSER EXCEPTION:', d.params.exceptionDetails);
    }
  };
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

  // Check moves
  const evalMove = await send('Runtime.evaluate', {
    expression: `
      (async () => {
        // Change gameMode to 'pvp' to prevent AI interference
        gameMode = 'pvp';
        
        // Find legal moves for e2
        const legal = chess.generateLegalMoves().filter(m => m.fromF === 4 && m.fromR === 1);
        console.log('Legal moves for e2:', legal);
        
        // Execute move e2 -> e4
        const m = legal.find(mv => mv.toF === 4 && mv.toR === 3);
        if (!m) return { error: 'No move e2-e4 found', legal };
        
        await performChessMove(m);
        await new Promise(r => setTimeout(r, 1500));
        
        const rigAtE4 = unitGrid[4][3];
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(rigAtE4.root.quaternion);
        
        // Now Black move e7 -> e5
        const legalBlack = chess.generateLegalMoves().filter(mv => mv.fromF === 4 && mv.fromR === 6);
        const mBlack = legalBlack.find(mv => mv.toF === 4 && mv.toR === 4);
        
        await performChessMove(mBlack);
        await new Promise(r => setTimeout(r, 1500));
        
        const rigAtE5 = unitGrid[4][4];
        const forwardBlack = new THREE.Vector3(0, 0, 1).applyQuaternion(rigAtE5.root.quaternion);
        
        return {
          whiteE4: {
            team: rigAtE4.team === TEAM_WHITE ? 'White' : 'Black',
            rotY: +rigAtE4.root.rotation.y.toFixed(4),
            forwardZ: +forward.z.toFixed(4)
          },
          blackE5: {
            team: rigAtE5.team === TEAM_WHITE ? 'White' : 'Black',
            rotY: +rigAtE5.root.rotation.y.toFixed(4),
            forwardZ: +forwardBlack.z.toFixed(4)
          }
        };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('evalMove:', JSON.stringify(evalMove, null, 2));

  ws.close();
  chrome.kill();
}

testFacing().catch(console.error);
