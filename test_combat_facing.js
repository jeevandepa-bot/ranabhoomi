const { spawn } = require('child_process');

async function testCombatFacing() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9250',
    '--disable-gpu-sandbox',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9250',
    'http://localhost:8080/index.html'
  ]);
  let res, tabs;
  for (let i = 0; i < 20; i++) {
    try {
      res = await fetch('http://127.0.0.1:9250/json');
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
  const send = (m, a = {}) => new Promise(r => { const i = id++; p.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: a })); });
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

  const result = await send('Runtime.evaluate', {
    expression: `
      (async () => {
        gameMode = 'pvp';
        // 1. White e2 -> e4
        const m1 = chess.generateLegalMoves().find(m => m.fromF === 4 && m.fromR === 1 && m.toF === 4 && m.toR === 3);
        await performChessMove(m1);
        await new Promise(r => setTimeout(r, 1200));

        // 2. Black d7 -> d5
        const m2 = chess.generateLegalMoves().find(m => m.fromF === 3 && m.fromR === 6 && m.toF === 3 && m.toR === 4);
        await performChessMove(m2);
        await new Promise(r => setTimeout(r, 1200));

        // 3. White e4 x d5 (Capture!)
        const m3 = chess.generateLegalMoves().find(m => m.fromF === 4 && m.fromR === 3 && m.toF === 3 && m.toR === 4 && m.isCapture);
        if (!m3) return { error: 'Capture move e4xd5 not found!' };

        await performChessMove(m3);
        // Wait for kill sequence and shatter animation to complete
        await new Promise(r => setTimeout(r, 3500));

        const attackerPostKill = unitGrid[3][4];
        if (!attackerPostKill) return { error: 'Attacker not on tile d5!' };

        return {
          success: true,
          attackerTile: 'd5 (f=3, r=4)',
          attackerTeam: attackerPostKill.team === TEAM_WHITE ? 'White' : 'Black',
          attackerRotY: +attackerPostKill.root.rotation.y.toFixed(4),
          targetExpectedRotY: +Math.PI.toFixed(4),
          isRotCorrect: Math.abs(attackerPostKill.root.rotation.y - Math.PI) < 0.05
        };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('Combat Facing Test Result:', JSON.stringify(result.result.value, null, 2));

  ws.close();
  chrome.kill();
}

testCombatFacing().catch(console.error);
