const { spawn } = require('child_process');

async function test() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9227',
    '--disable-gpu-sandbox',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9227',
    'http://localhost:8080/index.html'
  ]);
  await new Promise(r => setTimeout(r, 2000));
  const res = await fetch('http://127.0.0.1:9227/json');
  const tabs = await res.json();
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  let id = 1;
  const p = new Map();
  ws.onmessage = e => { const d = JSON.parse(e.data); if (d.id && p.has(d.id)) { p.get(d.id)(d); p.delete(d.id); } };
  const send = (m, a = {}) => new Promise(res => { const i = id++; p.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: a })); });
  await new Promise(r => ws.onopen = r);
  await send('Runtime.enable');
  await new Promise(r => setTimeout(r, 2500));
  await send('Runtime.evaluate', { expression: "document.getElementById('tabStudioBtn').click();" });
  await new Promise(r => setTimeout(r, 600));
  await send('Runtime.evaluate', { expression: "studioPieceType = PIECE_PAWN; rebuildStudioCharacter();" });
  await new Promise(r => setTimeout(r, 600));
  
  for (let styleId of [0, 1, 2]) {
    console.log(`\nTriggering Style ${styleId}...`);
    const r1 = await send('Runtime.evaluate', { expression: `triggerStudioKillPreview(${styleId})`, returnByValue: true });
    console.log('r1:', r1);
    
    // Wait until inKillSequence is true
    for (let w = 0; w < 30; w++) {
      await new Promise(r => setTimeout(r, 100));
      const inK = await send('Runtime.evaluate', { expression: 'studioHeroRig && studioHeroRig.inKillSequence', returnByValue: true });
      if (inK.result.value) break;
    }
    
    const r2 = await send('Runtime.evaluate', {
      expression: `({
        tag: document.getElementById('kineticTag').textContent,
        title: document.getElementById('kineticTitle').textContent,
        style: studioHeroRig ? studioHeroRig.currentKillStyle : null,
        inKill: studioHeroRig ? studioHeroRig.inKillSequence : null
      })`,
      returnByValue: true
    });
    console.log(`Style ${styleId} telemetry:`, r2.result.value);
    
    // Wait until inKillSequence is false
    for (let w = 0; w < 60; w++) {
      await new Promise(r => setTimeout(r, 100));
      const inK = await send('Runtime.evaluate', { expression: 'studioHeroRig && studioHeroRig.inKillSequence', returnByValue: true });
      if (!inK.result.value) break;
    }
    await new Promise(r => setTimeout(r, 800));
  }
  
  ws.close();
  chrome.kill();
}
test().catch(console.error);
