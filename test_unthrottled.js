const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function testVsyncAndHeadroom() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const debugPort = 9265;
  const tempProfile = path.join(os.tmpdir(), 'chrome_vsync_' + Date.now());

  // Spawn Chrome with GPU acceleration and disabled frame rate limits to measure raw pipeline throughput
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${tempProfile}`,
    '--disable-gpu-sandbox',
    '--use-gl=angle',
    '--use-angle=d3d11',
    '--disable-frame-rate-limit',
    '--disable-gpu-vsync',
    '--window-size=1920,1080',
    'http://localhost:8080/index.html'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  let tabs = null;
  for (let i = 0; i < 15; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${debugPort}/json`);
      tabs = await res.json();
      if (tabs && tabs.length > 0) break;
    } catch (e) {
      await new Promise(r => setTimeout(r, 400));
    }
  }

  const target = tabs.find(t => t.type === 'page' && t.url.includes('localhost:8080')) || tabs[0];
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let msgId = 1;
  const pending = new Map();
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve } = pending.get(data.id);
      pending.delete(data.id);
      resolve(data.result);
    }
  };
  await new Promise(resolve => ws.onopen = resolve);
  await send('Runtime.enable');

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    const evalRes = await send('Runtime.evaluate', {
      expression: `typeof ModelManager !== "undefined" && ModelManager.isLoaded && typeof activeRigs !== "undefined" && activeRigs.length === 32`,
      returnByValue: true
    });
    if (evalRes && evalRes.result && evalRes.result.value) break;
  }

  const res = await send('Runtime.evaluate', {
    awaitPromise: true,
    expression: `(async () => {
      // Warm up
      for (let i = 0; i < 30; i++) await new Promise(r => requestAnimationFrame(r));

      // 1. Measure 200 normal frames in animateLoop
      const frameTimes = [];
      let lastT = performance.now();
      for (let i = 0; i < 200; i++) {
        const now = await new Promise(r => requestAnimationFrame(r));
        frameTimes.push(now - lastT);
        lastT = now;
      }

      function stats(arr) {
        const sorted = [...arr].sort((a, b) => a - b);
        const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
        const median = sorted[Math.floor(sorted.length / 2)];
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        return {
          mean: Number(mean.toFixed(2)),
          median: Number(median.toFixed(2)),
          min: Number(min.toFixed(2)),
          max: Number(max.toFixed(2)),
          p95: Number(p95.toFixed(2)),
          fps: Number((1000 / mean).toFixed(1)),
          under16_7Pct: Number(((sorted.filter(t => t <= 16.7).length / sorted.length) * 100).toFixed(1)),
          under20Pct: Number(((sorted.filter(t => t <= 20.0).length / sorted.length) * 100).toFixed(1))
        };
      }

      return {
        unthrottledStats: stats(frameTimes)
      };
    })()`,
    returnByValue: true
  });

  console.log('UNTHROTTLED STATS:', JSON.stringify(res.result.value, null, 2));
  ws.close();
  chrome.kill();
}

testVsyncAndHeadroom().catch(console.error);
