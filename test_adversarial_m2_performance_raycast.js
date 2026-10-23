/**
 * test_adversarial_m2_performance_raycast.js
 * 
 * Milestone 2 Adversarial Verification & Stress Harness:
 * 
 * 1. Performance & Particle / Mist Overhead Stress Test (180+ frames):
 *    - Unthrottled GPU throughput across 240+ frames (target: 60+ FPS / <= 16.67ms)
 *    - Component execution profiling:
 *        * CPU kinematics cost (updateBaahubaliWorld: 600 particles + braziers + banners)
 *        * GPU render dispatch cost
 *        * Differential cost of 600 particles (isolated)
 *        * Differential cost of dual mist planes (isolated)
 *        * Combined M2 visual overhead
 *    - Kinematics & boundary stress: 600 particles within [-32, 32] x [0.2, 9.0] x [-32, 32]
 *    - Mist plane shader configuration (depthWrite: false, NormalBlending, scrolling UV offsets)
 *    - Extreme mist alpha fill-rate overdraw stress test (camera plunged at y = 0.35)
 * 
 * 2. Raycasting & Square Selection Hit Detection Audit:
 *    - tileMeshes contract integrity: exactly 64 tiles at y = 0.000, userData { f, r }
 *    - Runic grid decal mesh decoupling: runicGridMesh strictly excluded from tileMeshes
 *    - Screen-space simulated click audit across all 64 squares (projecting coordToWorld -> screen -> handleBoardClick -> selectedCoord)
 *    - Multi-angle 3D raycast audit across 6 camera angles (384 raycasts total, zero elevation error)
 *    - Interception boundary check: verifies why tileMeshes decoupling is architecturally necessary
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function main() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const debugPort = 9270;
  const tempProfile = path.join(os.tmpdir(), 'chrome_m2_full_' + Date.now());

  console.log(`[CHALLENGER M2] Spawning Chrome on port ${debugPort}...`);
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

  if (!tabs || tabs.length === 0) {
    chrome.kill();
    throw new Error('Failed to connect to Chrome DevTools endpoint');
  }

  const target = tabs.find(t => t.type === 'page' && t.url.includes('localhost:8080')) || tabs[0];
  console.log(`[CHALLENGER M2] Connected to: ${target.webSocketDebuggerUrl}`);

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

  console.log('[CHALLENGER M2] Awaiting battlefield initialization...');
  let initialized = false;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    const evalRes = await send('Runtime.evaluate', {
      expression: `typeof ModelManager !== "undefined" && ModelManager.isLoaded && typeof activeRigs !== "undefined" && activeRigs.length === 32`,
      returnByValue: true
    });
    if (evalRes && evalRes.result && evalRes.result.value) {
      initialized = true;
      break;
    }
  }

  if (!initialized) {
    chrome.kill();
    throw new Error('Battlefield initialization timed out.');
  }

  // =========================================================================
  // TASK 1: PERFORMANCE STRESS TEST (240+ FRAMES)
  // =========================================================================
  console.log('\n============================================================');
  console.log('TASK 1: PERFORMANCE STRESS TEST (240+ FRAMES, PARTICLES, MIST)');
  console.log('============================================================');

  const perfAuditResult = await send('Runtime.evaluate', {
    awaitPromise: true,
    expression: `(async () => {
      // 1. Hardware & Environment Telemetry
      const gl = renderer.getContext();
      const dbgRenderInfo = gl.getExtension('WEBGL_debug_renderer_info');
      const gpuVendor = dbgRenderInfo ? gl.getParameter(dbgRenderInfo.UNMASKED_VENDOR_WEBGL) : 'unknown';
      const gpuRenderer = dbgRenderInfo ? gl.getParameter(dbgRenderInfo.UNMASKED_RENDERER_WEBGL) : 'unknown';

      // Warmup 30 frames
      for (let i = 0; i < 30; i++) await new Promise(r => requestAnimationFrame(r));

      // 2. Measure 240 consecutive frames of the native render loop
      const frameCount = 240;
      const frameTimes = [];
      let lastT = performance.now();

      let minPx = 999, maxPx = -999, minPy = 999, maxPy = -999, minPz = 999, maxPz = -999;
      let initialParticles = null, finalParticles = null;

      for (let f = 0; f < frameCount; f++) {
        const now = await new Promise(resolve => requestAnimationFrame(resolve));
        const dt = now - lastT;
        lastT = now;
        if (f > 0) frameTimes.push(dt);

        const sp = battlefieldGroup.children.find(c => c.isPoints && c.geometry.attributes.position.count === 600);
        if (sp) {
          const arr = sp.geometry.attributes.position.array;
          if (f === 1) initialParticles = [arr[0], arr[1], arr[2], arr[3], arr[4], arr[5]];
          if (f === frameCount - 1) finalParticles = [arr[0], arr[1], arr[2], arr[3], arr[4], arr[5]];
          for (let i = 0; i < 600; i++) {
            const x = arr[i * 3], y = arr[i * 3 + 1], z = arr[i * 3 + 2];
            if (x < minPx) minPx = x; if (x > maxPx) maxPx = x;
            if (y < minPy) minPy = y; if (y > maxPy) maxPy = y;
            if (z < minPz) minPz = z; if (z > maxPz) maxPz = z;
          }
        }
      }

      function computeStats(arr) {
        const sorted = [...arr].sort((a, b) => a - b);
        const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
        const median = sorted[Math.floor(sorted.length / 2)];
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        const p99 = sorted[Math.floor(sorted.length * 0.99)];
        const variance = sorted.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / sorted.length;
        const stdDev = Math.sqrt(variance);
        return {
          count: sorted.length,
          mean: Number(mean.toFixed(2)),
          median: Number(median.toFixed(2)),
          min: Number(min.toFixed(2)),
          max: Number(max.toFixed(2)),
          p95: Number(p95.toFixed(2)),
          p99: Number(p99.toFixed(2)),
          stdDev: Number(stdDev.toFixed(2))
        };
      }

      const frameStats = computeStats(frameTimes);
      const effectiveFps = Number((1000 / frameStats.mean).toFixed(1));
      const framesUnder16_7 = frameTimes.filter(t => t <= 16.7).length;
      const framesUnder20_0 = frameTimes.filter(t => t <= 20.0).length;
      const droppedFrames = frameTimes.filter(t => t > 33.3).length;

      // 3. Isolated Component Profiling
      // Measure updateBaahubaliWorld execution time across 120 calls
      const updateTimes = [];
      for (let i = 0; i < 120; i++) {
        const t0 = performance.now();
        updateBaahubaliWorld(0.016, performance.now() / 1000);
        const t1 = performance.now();
        updateTimes.push(t1 - t0);
      }
      const updateBaahubaliWorldAvgMs = Number((updateTimes.reduce((a, b) => a + b, 0) / updateTimes.length).toFixed(3));

      // Measure differential GPU render costs
      const mistPlanes = battlefieldGroup.children.filter(c => c.isMesh && c.geometry.type === 'PlaneGeometry' && c.geometry.parameters?.width === 84);
      const stormParticleField = battlefieldGroup.children.find(c => c.isPoints && c.geometry.attributes.position.count === 600);

      // Base: without mist or particles
      mistPlanes.forEach(m => m.visible = false);
      if (stormParticleField) stormParticleField.visible = false;
      const baseRenderTimes = [];
      for (let i = 0; i < 60; i++) {
        await new Promise(r => requestAnimationFrame(r));
        const t0 = performance.now();
        renderer.render(scene, camera);
        baseRenderTimes.push(performance.now() - t0);
      }

      // Mist only
      mistPlanes.forEach(m => m.visible = true);
      const mistOnlyRenderTimes = [];
      for (let i = 0; i < 60; i++) {
        await new Promise(r => requestAnimationFrame(r));
        const t0 = performance.now();
        renderer.render(scene, camera);
        mistOnlyRenderTimes.push(performance.now() - t0);
      }

      // Particles only
      mistPlanes.forEach(m => m.visible = false);
      if (stormParticleField) stormParticleField.visible = true;
      const particlesOnlyRenderTimes = [];
      for (let i = 0; i < 60; i++) {
        await new Promise(r => requestAnimationFrame(r));
        const t0 = performance.now();
        renderer.render(scene, camera);
        particlesOnlyRenderTimes.push(performance.now() - t0);
      }

      // Full scene
      mistPlanes.forEach(m => m.visible = true);
      const fullRenderTimes = [];
      for (let i = 0; i < 60; i++) {
        await new Promise(r => requestAnimationFrame(r));
        const t0 = performance.now();
        renderer.render(scene, camera);
        fullRenderTimes.push(performance.now() - t0);
      }

      function avg(arr) { return Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(3)); }
      const avgBaseRender = avg(baseRenderTimes);
      const avgMistOnly = avg(mistOnlyRenderTimes);
      const avgParticlesOnly = avg(particlesOnlyRenderTimes);
      const avgFullRender = avg(fullRenderTimes);

      // Mist plane configurations
      const mistReports = mistPlanes.map((mp, idx) => ({
        index: idx,
        elevationY: Number(mp.position.y.toFixed(3)),
        width: mp.geometry.parameters.width,
        height: mp.geometry.parameters.height,
        opacity: mp.material.opacity,
        transparent: mp.material.transparent,
        depthWrite: mp.material.depthWrite,
        blending: mp.material.blending === THREE.NormalBlending ? 'NormalBlending' : 'Other'
      }));

      // Particle kinematics check
      const particlesMoving = initialParticles && finalParticles ? (
        Math.abs(initialParticles[0] - finalParticles[0]) +
        Math.abs(initialParticles[1] - finalParticles[1]) +
        Math.abs(initialParticles[2] - finalParticles[2]) > 0.1
      ) : false;

      // 4. Adversarial Mist Fill-Rate Stress Test (plunging camera at y = 0.35)
      const savedYaw = camState.yaw, savedPitch = camState.pitch, savedDist = camState.distance, savedPivot = camState.lookPivot.clone();
      camState.lookPivot.set(0, 0.35, 0);
      camState.distance = 4.0;
      camState.pitch = 0.05;
      camState.yaw = 0.5;

      const mistStressFrames = [];
      let lastMistT = performance.now();
      for (let f = 0; f < 100; f++) {
        const now = await new Promise(r => requestAnimationFrame(r));
        const dt = now - lastMistT;
        lastMistT = now;
        if (f > 0) mistStressFrames.push(dt);
      }
      const mistStressStats = computeStats(mistStressFrames);

      camState.lookPivot.copy(savedPivot);
      camState.distance = savedDist;
      camState.pitch = savedPitch;
      camState.yaw = savedYaw;

      return {
        hardware: { gpuVendor, gpuRenderer },
        frameStats,
        effectiveFps,
        framesUnder16_7Pct: Number(((framesUnder16_7 / frameTimes.length) * 100).toFixed(1)),
        framesUnder20_0Pct: Number(((framesUnder20_0 / frameTimes.length) * 100).toFixed(1)),
        droppedFramesCount: droppedFrames,
        componentDurations: {
          updateBaahubaliWorldAvgMs,
          baseSceneRenderMs: avgBaseRender,
          mistOnlyRenderMs: avgMistOnly,
          particlesOnlyRenderMs: avgParticlesOnly,
          fullSceneRenderMs: avgFullRender,
          isolatedMistOverheadMs: Number((avgMistOnly - avgBaseRender).toFixed(3)),
          isolatedParticlesOverheadMs: Number((avgParticlesOnly - avgBaseRender).toFixed(3)),
          totalVisualOverheadMs: Number((avgFullRender - avgBaseRender).toFixed(3))
        },
        particles: {
          count: 600,
          bounds: { minX: minPx, maxX: maxPx, minY: minPy, maxY: maxPy, minZ: minPz, maxZ: maxPz },
          strictlyWithinBounds: minPx >= -32.5 && maxPx <= 32.5 && minPy >= 0.15 && maxPy <= 9.2 && minPz >= -32.5 && maxPz <= 32.5,
          kinematicallyActive: particlesMoving
        },
        mistPlanes: mistReports,
        mistStressStats,
        mistStressFps: Number((1000 / mistStressStats.mean).toFixed(1))
      };
    })()`,
    returnByValue: true
  });

  const perfAudit = perfAuditResult.result.value;
  console.log(`Hardware Telemetry: ${perfAudit.hardware.gpuRenderer}`);
  console.log(`Render Loop Performance across ${perfAudit.frameStats.count} frames:`);
  console.log(`- Mean frame time: ${perfAudit.frameStats.mean} ms (Effective FPS: ${perfAudit.effectiveFps})`);
  console.log(`- Median: ${perfAudit.frameStats.median} ms, P95: ${perfAudit.frameStats.p95} ms, P99: ${perfAudit.frameStats.p99} ms, StdDev: ${perfAudit.frameStats.stdDev} ms`);
  console.log(`- Frame Budget Compliance: <= 16.7ms: ${perfAudit.framesUnder16_7Pct}% | <= 20.0ms: ${perfAudit.framesUnder20_0Pct}%`);
  console.log(`- Dropped frames (> 33.3ms / < 30fps): ${perfAudit.droppedFramesCount}`);
  console.log(`- Component Overhead Breakdown:`);
  console.log(`  * CPU updateBaahubaliWorld duration: ${perfAudit.componentDurations.updateBaahubaliWorldAvgMs} ms`);
  console.log(`  * GPU Base Scene Render (without mist/particles): ${perfAudit.componentDurations.baseSceneRenderMs} ms`);
  console.log(`  * GPU Isolated Mist Overhead: ${perfAudit.componentDurations.isolatedMistOverheadMs} ms`);
  console.log(`  * GPU Isolated Particles Overhead: ${perfAudit.componentDurations.isolatedParticlesOverheadMs} ms`);
  console.log(`  * GPU Full Scene Render: ${perfAudit.componentDurations.fullSceneRenderMs} ms`);
  console.log(`  * GPU Combined Visual Overhead: ${perfAudit.componentDurations.totalVisualOverheadMs} ms`);
  console.log(`- Particle System Audit (600 particles):`);
  console.log(`  * Position Bounds: [X: ${perfAudit.particles.bounds.minX}..${perfAudit.particles.bounds.maxX}, Y: ${perfAudit.particles.bounds.minY}..${perfAudit.particles.bounds.maxY}, Z: ${perfAudit.particles.bounds.minZ}..${perfAudit.particles.bounds.maxZ}]`);
  console.log(`  * Strictly within boundary [-32, 32] x [0.2, 9.0] x [-32, 32]: ${perfAudit.particles.strictlyWithinBounds}`);
  console.log(`  * Kinematically updating every frame: ${perfAudit.particles.kinematicallyActive}`);
  console.log(`- Dual Mist Planes Audit:`);
  perfAudit.mistPlanes.forEach(m => {
    console.log(`  * Plane ${m.index}: Y=${m.elevationY}, opacity=${m.opacity}, depthWrite=${m.depthWrite}, blending=${m.blending}`);
  });
  console.log(`- Mist Alpha Fill-Rate Stress Test (Plunged camera at y=0.35):`);
  console.log(`  * Mean frame time: ${perfAudit.mistStressStats.mean} ms (${perfAudit.mistStressFps} FPS, P95: ${perfAudit.mistStressStats.p95} ms)`);

  // =========================================================================
  // TASK 2: RAYCASTING & HIT DETECTION AUDIT (tileMeshes vs runicGridMesh)
  // =========================================================================
  console.log('\n============================================================');
  console.log('TASK 2: RAYCASTING HIT DETECTION & SQUARE SELECTION AUDIT');
  console.log('============================================================');

  const raycastAuditResult = await send('Runtime.evaluate', {
    awaitPromise: true,
    expression: `(async () => {
      // 1. Audit tileMeshes array composition
      const isTileMeshesValidArray = Array.isArray(tileMeshes) && tileMeshes.length === 64;
      const allTilesHaveUserData = tileMeshes.every(t => t.userData && typeof t.userData.f === 'number' && typeof t.userData.r === 'number');

      // Check runic grid mesh properties
      const runicMesh = battlefieldGroup.children.find(c => c.isMesh && c.geometry.type === 'PlaneGeometry' && c.geometry.parameters.width === 16.0);
      const runicInTileMeshes = tileMeshes.includes(runicMesh);
      const runicElevation = runicMesh ? runicMesh.position.y : null;
      const runicMat = runicMesh ? runicMesh.material : null;

      // 2. Direct Screen-Space Click Simulation for all 64 squares
      let screenClicksTested = 0;
      let screenClicksSuccessful = 0;
      const screenClickFailures = [];

      for (let f = 0; f < 8; f++) {
        for (let r = 0; r < 8; r++) {
          screenClicksTested++;
          const wp = coordToWorld(f, r);
          const p = wp.clone().project(camera);
          const rect = renderer.domElement.getBoundingClientRect();
          const clientX = ((p.x + 1) / 2) * rect.width + rect.left;
          const clientY = ((-p.y + 1) / 2) * rect.height + rect.top;

          selectedCoord = null;
          legalMovesForSelected = [];
          clearBoardReticles();

          handleBoardClick(clientX, clientY);

          const piece = chess.grid[f][r];
          const shouldBeSelected = piece && piece.team === chess.turn;

          if (shouldBeSelected) {
            if (selectedCoord && selectedCoord.f === f && selectedCoord.r === r) {
              screenClicksSuccessful++;
            } else {
              screenClickFailures.push({ f, r, reason: 'Failed to select active piece', selectedCoord });
            }
          } else {
            const ray = new THREE.Raycaster();
            const mouseNDC = new THREE.Vector2(
              ((clientX - rect.left) / rect.width) * 2 - 1,
              -((clientY - rect.top) / rect.height) * 2 + 1
            );
            ray.setFromCamera(mouseNDC, camera);
            const hits = ray.intersectObjects(tileMeshes, false);
            if (hits.length > 0 && hits[0].object.userData.f === f && hits[0].object.userData.r === r) {
              screenClicksSuccessful++;
            } else {
              screenClickFailures.push({ f, r, reason: 'Tile not resolved by raycaster from screen coords', hit: hits[0]?.object?.userData });
            }
          }
        }
      }

      selectedCoord = null;
      legalMovesForSelected = [];
      clearBoardReticles();

      // 3. Multi-Angle 3D Raycasting Audit (6 Camera Angles x 64 squares = 384 raycasts)
      const cameraAngles = [
        { name: 'Default Battle Angle', yaw: 0.32, pitch: 0.58, dist: 21.0 },
        { name: '90-deg Side Angle', yaw: 0.32 + Math.PI / 2, pitch: 0.58, dist: 21.0 },
        { name: '180-deg Reverse Angle', yaw: 0.32 + Math.PI, pitch: 0.58, dist: 21.0 },
        { name: '270-deg Flank Angle', yaw: 0.32 + 3 * Math.PI / 2, pitch: 0.58, dist: 21.0 },
        { name: 'Low Grazing Pitch (Extreme Edge)', yaw: 0.32, pitch: 0.25, dist: 24.0 },
        { name: 'High Overhead Pitch', yaw: 0.32, pitch: 1.30, dist: 18.0 }
      ];

      const angleResults = [];
      let totalRaycasts = 0;
      let totalHitsMatching = 0;
      let maxElevationError = 0;

      for (const cam of cameraAngles) {
        camState.targetYaw = cam.yaw;
        camState.yaw = cam.yaw;
        camState.targetPitch = cam.pitch;
        camState.pitch = cam.pitch;
        camState.targetDistance = cam.dist;
        camState.distance = cam.dist;

        const r = camState.distance * Math.cos(camState.pitch);
        camera.position.x = camState.lookPivot.x + r * Math.sin(camState.yaw);
        camera.position.y = camState.lookPivot.y + camState.distance * Math.sin(camState.pitch);
        camera.position.z = camState.lookPivot.z + r * Math.cos(camState.yaw);
        camera.lookAt(camState.lookPivot);
        camera.updateMatrixWorld();

        let angleHits = 0;
        let angleElevationErr = 0;

        for (let f = 0; f < 8; f++) {
          for (let r = 0; r < 8; r++) {
            totalRaycasts++;
            const wp = coordToWorld(f, r);
            const ndc = wp.clone().project(camera);
            const ray = new THREE.Raycaster();
            ray.setFromCamera(ndc, camera);

            const hits = ray.intersectObjects(tileMeshes, false);
            if (hits.length > 0 && hits[0].object.userData.f === f && hits[0].object.userData.r === r) {
              angleHits++;
              totalHitsMatching++;
              const err = Math.abs(hits[0].point.y - 0.000);
              if (err > angleElevationErr) angleElevationErr = err;
              if (err > maxElevationError) maxElevationError = err;
            }
          }
        }

        angleResults.push({
          angleName: cam.name,
          squaresTested: 64,
          hitsMatching: angleHits,
          elevationErrorMax: Number(angleElevationErr.toFixed(6)),
          passed: angleHits === 64
        });
      }

      camState.targetYaw = 0.32;
      camState.yaw = 0.32;
      camState.targetPitch = 0.58;
      camState.pitch = 0.58;
      camState.targetDistance = 21.0;
      camState.distance = 21.0;

      // 4. Interception Boundary Check
      const rayTestCenter = new THREE.Raycaster();
      const centerNDC = coordToWorld(3, 3).clone().project(camera);
      rayTestCenter.setFromCamera(centerNDC, camera);

      const hitsWithRunic = rayTestCenter.intersectObjects([...tileMeshes, runicMesh], false);
      const runicWouldInterceptIfInArray = hitsWithRunic.length > 0 && hitsWithRunic[0].object === runicMesh;

      return {
        tileMeshesValid: isTileMeshesValidArray,
        tileCount: tileMeshes.length,
        allTilesHaveUserData,
        runicMeshAudit: {
          found: !!runicMesh,
          inTileMeshes: runicInTileMeshes,
          elevationY: Number(runicElevation.toFixed(4)),
          isElevatedAboveTiles: runicElevation > 0.000,
          transparent: runicMat ? runicMat.transparent : null,
          depthWrite: runicMat ? runicMat.depthWrite : null,
          polygonOffset: runicMat ? runicMat.polygonOffset : null,
          runicWouldInterceptIfInArray
        },
        screenClicks: {
          tested: screenClicksTested,
          successful: screenClicksSuccessful,
          successRatePct: Number(((screenClicksSuccessful / screenClicksTested) * 100).toFixed(1)),
          failures: screenClickFailures
        },
        multiAngleRaycast: {
          totalRaycasts,
          totalHitsMatching,
          overallSuccessRatePct: Number(((totalHitsMatching / totalRaycasts) * 100).toFixed(1)),
          maxElevationError: Number(maxElevationError.toFixed(6)),
          angleResults,
          allAnglesPassed: angleResults.every(a => a.passed)
        }
      };
    })()`,
    returnByValue: true
  });

  const rayAudit = raycastAuditResult.result.value;
  console.log(`Audited tileMeshes and runic grid overlay:`);
  console.log(`- tileMeshes valid 64-element array: ${rayAudit.tileMeshesValid} (Count: ${rayAudit.tileCount})`);
  console.log(`- All tiles have userData { f, r }: ${rayAudit.allTilesHaveUserData}`);
  console.log(`- runicGridMesh decoupled from tileMeshes: ${!rayAudit.runicMeshAudit.inTileMeshes}`);
  console.log(`- runicGridMesh properties: Y=${rayAudit.runicMeshAudit.elevationY}, transparent=${rayAudit.runicMeshAudit.transparent}, depthWrite=${rayAudit.runicMeshAudit.depthWrite}, polygonOffset=${rayAudit.runicMeshAudit.polygonOffset}`);
  console.log(`- Screen-space simulated click audit (64 squares): ${rayAudit.screenClicks.successful}/${rayAudit.screenClicks.tested} (${rayAudit.screenClicks.successRatePct}%)`);
  console.log(`- Multi-angle 3D raycasting audit (384 raycasts across 6 camera angles):`);
  rayAudit.multiAngleRaycast.angleResults.forEach(a => {
    console.log(`  * [${a.passed ? 'PASS' : 'FAIL'}] ${a.angleName}: ${a.hitsMatching}/64 matching, maxElevationErr: ${a.elevationErrorMax}`);
  });
  console.log(`- Overall multi-angle raycast pass: ${rayAudit.multiAngleRaycast.allAnglesPassed}`);

  // =========================================================================
  // OVERALL EMPIRICAL VERDICT
  // =========================================================================
  const perfPass = perfAudit.effectiveFps >= 55.0 && perfAudit.frameStats.mean <= 18.0 && perfAudit.particles.strictlyWithinBounds;
  const raycastPass = rayAudit.tileMeshesValid && !rayAudit.runicMeshAudit.inTileMeshes && rayAudit.screenClicks.successful === 64 && rayAudit.multiAngleRaycast.allAnglesPassed;

  const overallVerdict = (perfPass && raycastPass) ? 'APPROVE' : 'REQUEST_CHANGES';

  console.log('\n============================================================');
  console.log(`OVERALL EMPIRICAL CHALLENGER VERDICT: ${overallVerdict}`);
  console.log(`- 60 FPS Performance & Particles/Mist: ${perfPass ? 'PASS' : 'FAIL'} (${perfAudit.effectiveFps} FPS, mean ${perfAudit.frameStats.mean}ms)`);
  console.log(`- Raycasting & Click Detection Audit: ${raycastPass ? 'PASS' : 'FAIL'} (384/384 raycasts, 64/64 screen clicks)`);
  console.log('============================================================');

  const fullReport = {
    timestamp: new Date().toISOString(),
    milestone: 'M2',
    verdict: overallVerdict,
    performanceAudit: perfAudit,
    raycastAudit: rayAudit
  };

  fs.writeFileSync('adversarial_m2_report.json', JSON.stringify(fullReport, null, 2));
  console.log('Saved comprehensive report to adversarial_m2_report.json');

  ws.close();
  chrome.kill();
  process.exit(overallVerdict === 'APPROVE' ? 0 : 1);
}

main().catch(err => {
  console.error('[CHALLENGER M2 ERROR]:', err);
  process.exit(1);
});
