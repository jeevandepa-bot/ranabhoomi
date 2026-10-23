const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function run() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const debugPort = 9260;
  const tempProfile = path.join(os.tmpdir(), 'chrome_diag_' + Date.now());

  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${tempProfile}`,
    '--disable-gpu-sandbox',
    '--use-gl=angle',
    '--use-angle=d3d11',
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

  const diagResult = await send('Runtime.evaluate', {
    awaitPromise: true,
    expression: `(async () => {
      // 1. Check WebGL Renderer Info
      const gl = renderer.getContext();
      const dbgRenderInfo = gl.getExtension('WEBGL_debug_renderer_info');
      const gpuVendor = dbgRenderInfo ? gl.getParameter(dbgRenderInfo.UNMASKED_VENDOR_WEBGL) : 'unknown';
      const gpuRenderer = dbgRenderInfo ? gl.getParameter(dbgRenderInfo.UNMASKED_RENDERER_WEBGL) : 'unknown';

      // 2. Measure updateBaahubaliWorld CPU duration
      const updateDurations = [];
      const particleKinematicsDurations = [];
      for (let f = 0; f < 100; f++) {
        await new Promise(r => requestAnimationFrame(r));
        const t0 = performance.now();
        // Execute updateBaahubaliWorld
        updateBaahubaliWorld(0.016, performance.now() / 1000);
        const t1 = performance.now();
        updateDurations.push(t1 - t0);
      }

      // 3. Measure Differential Render Time:
      // A) Full Scene (baseline)
      const fullRenderDurations = [];
      for (let f = 0; f < 100; f++) {
        await new Promise(r => requestAnimationFrame(r));
        const t0 = performance.now();
        renderer.render(scene, camera);
        const t1 = performance.now();
        fullRenderDurations.push(t1 - t0);
      }

      // Find mist and particle meshes
      const mistPlanes = battlefieldGroup.children.filter(c => c.isMesh && c.geometry.type === 'PlaneGeometry' && c.geometry.parameters?.width === 84);
      const stormParticleField = battlefieldGroup.children.find(c => c.isPoints && c.geometry.attributes.position.count === 600);

      // B) With Mist Disabled
      mistPlanes.forEach(m => m.visible = false);
      const noMistRenderDurations = [];
      for (let f = 0; f < 100; f++) {
        await new Promise(r => requestAnimationFrame(r));
        const t0 = performance.now();
        renderer.render(scene, camera);
        const t1 = performance.now();
        noMistRenderDurations.push(t1 - t0);
      }
      mistPlanes.forEach(m => m.visible = true);

      // C) With Particles Disabled
      if (stormParticleField) stormParticleField.visible = false;
      const noParticlesRenderDurations = [];
      for (let f = 0; f < 100; f++) {
        await new Promise(r => requestAnimationFrame(r));
        const t0 = performance.now();
        renderer.render(scene, camera);
        const t1 = performance.now();
        noParticlesRenderDurations.push(t1 - t0);
      }
      if (stormParticleField) stormParticleField.visible = true;

      // D) With Both Mist & Particles Disabled
      mistPlanes.forEach(m => m.visible = false);
      if (stormParticleField) stormParticleField.visible = false;
      const noMistNoParticlesDurations = [];
      for (let f = 0; f < 100; f++) {
        await new Promise(r => requestAnimationFrame(r));
        const t0 = performance.now();
        renderer.render(scene, camera);
        const t1 = performance.now();
        noMistNoParticlesDurations.push(t1 - t0);
      }
      mistPlanes.forEach(m => m.visible = true);
      if (stormParticleField) stormParticleField.visible = true;

      // E) Check shadow map cost
      renderer.shadowMap.autoUpdate = false;
      const noShadowUpdateDurations = [];
      for (let f = 0; f < 100; f++) {
        await new Promise(r => requestAnimationFrame(r));
        const t0 = performance.now();
        renderer.render(scene, camera);
        const t1 = performance.now();
        noShadowUpdateDurations.push(t1 - t0);
      }
      renderer.shadowMap.autoUpdate = true;

      function avg(arr) { return Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(3)); }

      return {
        gpuVendor,
        gpuRenderer,
        devicePixelRatio: window.devicePixelRatio,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        updateBaahubaliWorldAvgMs: avg(updateDurations),
        renderCostsMs: {
          fullScene: avg(fullRenderDurations),
          noMist: avg(noMistRenderDurations),
          noParticles: avg(noParticlesRenderDurations),
          noMistNoParticles: avg(noMistNoParticlesDurations),
          noShadowAutoUpdate: avg(noShadowUpdateDurations)
        },
        differentialOverhead: {
          mistOverheadMs: Number((avg(fullRenderDurations) - avg(noMistRenderDurations)).toFixed(3)),
          particlesOverheadMs: Number((avg(fullRenderDurations) - avg(noParticlesRenderDurations)).toFixed(3)),
          totalM2VisualOverheadMs: Number((avg(fullRenderDurations) - avg(noMistNoParticlesDurations)).toFixed(3)),
          shadowMapOverheadMs: Number((avg(fullRenderDurations) - avg(noShadowUpdateDurations)).toFixed(3))
        }
      };
    })()`,
    returnByValue: true
  });

  console.log('DIAGNOSTIC RESULTS:\n', JSON.stringify(diagResult.result.value, null, 2));
  ws.close();
  chrome.kill();
}

run().catch(console.error);
