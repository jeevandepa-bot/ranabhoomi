const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 9245;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://localhost:8080/index.html';
const OUT_BASE = path.join(__dirname, 'stress_frames');

async function runStressTest() {
  console.log('===============================================================');
  console.log('ADVERSARIAL RENDERING STRESS TEST — challenger_m1_1');
  console.log('===============================================================');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-stress-'));
  if (fs.existsSync(OUT_BASE)) {
    fs.rmSync(OUT_BASE, { recursive: true, force: true });
  }
  fs.mkdirSync(OUT_BASE, { recursive: true });

  console.log(`Starting isolated Chrome on port ${PORT}...`);
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${tmpDir}`,
    '--disable-gpu-sandbox',
    '--use-gl=angle',
    '--use-angle=d3d11',
    '--window-size=1920,1080',
    URL
  ]);

  chrome.on('error', (err) => {
    console.error('Failed to spawn Chrome:', err);
  });

  // Wait for Chrome remote debugging port
  let tabs = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      tabs = await res.json();
      if (tabs && tabs.length > 0) break;
    } catch (e) {
      // retry
    }
  }

  if (!tabs || tabs.length === 0) {
    chrome.kill();
    throw new Error('Could not connect to Chrome debugging endpoint');
  }

  const target = tabs.find(t => t.type === 'page' && t.url.includes('localhost:8080')) || tabs[0];
  console.log('Connected to target tab:', target.title, target.webSocketDebuggerUrl);

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
  await send('Page.enable');

  console.log('Waiting for 3D battlefield and all 32 unit models to load...');
  let ready = false;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 500));
    const evalRes = await send('Runtime.evaluate', {
      expression: 'typeof ModelManager !== "undefined" && ModelManager.isLoaded && typeof activeRigs !== "undefined" && activeRigs.length === 32',
      returnByValue: true
    });
    if (evalRes && evalRes.result && evalRes.result.value) {
      ready = true;
      break;
    }
  }

  if (!ready) {
    ws.close();
    chrome.kill();
    throw new Error('Battlefield models failed to load within timeout');
  }
  console.log('Battlefield fully loaded: 32 active rigs confirmed.');

  // Helper to capture a series of frames
  async function captureFrames(suiteName, count, intervalMs, setupFn, stepFn) {
    const dir = path.join(OUT_BASE, suiteName);
    fs.mkdirSync(dir, { recursive: true });
    console.log(`\n--- Running Suite: ${suiteName} (${count} frames) ---`);

    if (setupFn) {
      await send('Runtime.evaluate', { expression: `(${setupFn.toString()})()` });
      await new Promise(r => setTimeout(r, 600)); // allow camera to settle
    }

    for (let i = 0; i < count; i++) {
      if (stepFn) {
        await send('Runtime.evaluate', { expression: `(${stepFn.toString()})(${i}, ${count})` });
        await new Promise(r => setTimeout(r, intervalMs));
      } else {
        await new Promise(r => setTimeout(r, intervalMs));
      }
      const ss = await send('Page.captureScreenshot', { format: 'png' });
      const p = path.join(dir, `frame_${String(i).padStart(3, '0')}.png`);
      fs.writeFileSync(p, Buffer.from(ss.data, 'base64'));
    }
    console.log(`Captured ${count} frames for ${suiteName}.`);
  }

  // Suite 1: Shallow Grazing Pitch 5 degrees (Stationary hold)
  await captureFrames('suite1_grazing_5deg_stationary', 20, 66, () => {
    // 5 degrees = 0.087266 rad
    camState.targetPitch = 0.087266;
    camState.pitch = 0.087266;
    camState.targetYaw = 0.0;
    camState.yaw = 0.0;
    camState.targetDistance = 21.0;
    camState.distance = 21.0;
    camState.targetLookPivot.set(0, 0.4, 0);
    camState.lookPivot.set(0, 0.4, 0);
  });

  // Suite 2: Shallow Grazing Pitch 5 degrees (Slow yaw orbit)
  await captureFrames('suite2_grazing_5deg_orbit', 20, 66, () => {
    camState.targetPitch = 0.087266;
    camState.pitch = 0.087266;
    camState.targetDistance = 21.0;
    camState.distance = 21.0;
    camState.targetLookPivot.set(0, 0.4, 0);
    camState.lookPivot.set(0, 0.4, 0);
  }, (step) => {
    camState.targetYaw = step * 0.02;
    camState.yaw = camState.targetYaw;
  });

  // Suite 3: Shallow Pitch 15 degrees (Stationary hold)
  await captureFrames('suite3_grazing_15deg_stationary', 20, 66, () => {
    // 15 degrees = 0.261799 rad
    camState.targetPitch = 0.261799;
    camState.pitch = 0.261799;
    camState.targetYaw = 0.32;
    camState.yaw = 0.32;
    camState.targetDistance = 21.0;
    camState.distance = 21.0;
    camState.targetLookPivot.set(0, 0.4, 0);
    camState.lookPivot.set(0, 0.4, 0);
  });

  // Suite 4: Steep Pitch 85 degrees Top-Down (Stationary hold)
  await captureFrames('suite4_steep_85deg_stationary', 20, 66, () => {
    // 85 degrees = 1.48353 rad
    camState.targetPitch = 1.48353;
    camState.pitch = 1.48353;
    camState.targetYaw = 0.0;
    camState.yaw = 0.0;
    camState.targetDistance = 21.0;
    camState.distance = 21.0;
    camState.targetLookPivot.set(0, 0.4, 0);
    camState.lookPivot.set(0, 0.4, 0);
  });

  // Suite 5: Steep Pitch 85 degrees Top-Down (Yaw Orbit)
  await captureFrames('suite5_steep_85deg_orbit', 20, 66, () => {
    camState.targetPitch = 1.48353;
    camState.pitch = 1.48353;
    camState.targetDistance = 21.0;
    camState.distance = 21.0;
    camState.targetLookPivot.set(0, 0.4, 0);
    camState.lookPivot.set(0, 0.4, 0);
  }, (step) => {
    camState.targetYaw = step * 0.025;
    camState.yaw = camState.targetYaw;
  });

  // Suite 6: Extreme Zoom-In (Distance = 4.5, close proximity)
  await captureFrames('suite6_zoom_close_4_5', 20, 66, () => {
    camState.targetPitch = 0.58;
    camState.pitch = 0.58;
    camState.targetYaw = 0.32;
    camState.yaw = 0.32;
    camState.targetDistance = 4.5;
    camState.distance = 4.5;
    camState.targetLookPivot.set(0, 0.4, 0);
    camState.lookPivot.set(0, 0.4, 0);
  });

  // Suite 7: Extreme Zoom-Out (Distance = 50.0, far distance)
  await captureFrames('suite7_zoom_far_50_0', 20, 66, () => {
    camState.targetPitch = 0.58;
    camState.pitch = 0.58;
    camState.targetYaw = 0.32;
    camState.yaw = 0.32;
    camState.targetDistance = 50.0;
    camState.distance = 50.0;
    camState.targetLookPivot.set(0, 0.4, 0);
    camState.lookPivot.set(0, 0.4, 0);
  });

  // Suite 8: Rapid 360-degree Orbit (40 steps covering full 2*PI rotation)
  await captureFrames('suite8_rapid_360_orbit', 40, 50, () => {
    camState.targetPitch = 0.45;
    camState.pitch = 0.45;
    camState.targetDistance = 21.0;
    camState.distance = 21.0;
    camState.targetLookPivot.set(0, 0.4, 0);
    camState.lookPivot.set(0, 0.4, 0);
  }, (step, total) => {
    const angle = (step / total) * Math.PI * 2;
    camState.targetYaw = angle;
    camState.yaw = angle;
  });

  // Invariant & Depth Audit
  console.log('\n--- Running Deep Geometry & Depth Invariant Audit ---');
  const auditRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const tileTops = tileMeshes.map(m => m.position.y + 0.06);
      const minTileTop = Math.min(...tileTops);
      const maxTileTop = Math.max(...tileTops);

      const daisTop = boardDais.position.y + 0.14;
      const rimTop = daisRim.position.y + 0.04;

      // Sample brazier intensities over time
      const lightIntensities = brazierLights.map(b => b.light.intensity);

      // Check brass inlay geometry
      const verticalStrips = [];
      const horizontalStrips = [];
      battlefieldGroup.children.forEach(child => {
        if (child.material === gridBrassMat && child.geometry) {
          const params = child.geometry.parameters;
          if (params.width === 0.04 && params.depth === 16.0) {
            verticalStrips.push({ x: child.position.x, y: child.position.y, z: child.position.z });
          } else if (params.width === 1.958 && params.depth === 0.04) {
            horizontalStrips.push({ x: child.position.x, y: child.position.y, z: child.position.z });
          }
        }
      });

      return {
        tileTopElevation: { min: minTileTop, max: maxTileTop },
        daisTopElevation: daisTop,
        rimTopElevation: rimTop,
        daisGap: minTileTop - daisTop,
        rimGap: minTileTop - rimTop,
        daisReceiveShadow: boardDais.receiveShadow,
        verticalStripsCount: verticalStrips.length,
        horizontalStripsCount: horizontalStrips.length,
        brazierLightsCount: brazierLights.length,
        brazierIntensities: lightIntensities,
        cameraNear: camera.near,
        cameraFar: camera.far,
        cameraFrustumRatio: camera.far / camera.near,
        logarithmicDepthBuffer: renderer.capabilities.logarithmicDepthBuffer,
        shadowBias: sunLight.shadow.bias,
        shadowNormalBias: sunLight.shadow.normalBias
      };
    })()`,
    returnByValue: true
  });

  const auditData = auditRes.result.value;
  console.log('Geometry & Depth Audit Result:', JSON.stringify(auditData, null, 2));

  fs.writeFileSync(path.join(OUT_BASE, 'geometry_depth_audit.json'), JSON.stringify(auditData, null, 2));

  ws.close();
  chrome.kill();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (e) {}

  console.log('\nAll stress frame captures complete. Data saved to:', OUT_BASE);
}

runStressTest().catch(err => {
  console.error('Fatal error during stress test:', err);
  process.exit(1);
});
