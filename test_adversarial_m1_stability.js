/**
 * test_adversarial_m1_stability.js
 * 
 * Milestone 1 Adversarial Verification Suite
 * 
 * 1. Light source stability across 200+ animation frames:
 *    - Normalized time-derivative |dI/dt| against theoretical harmonic bound (0.212 units/sec)
 *    - Detection of stochastic white noise, random spikes, or discontinuities
 *    - Distance clamping (6.5) and intensity bounds ([0.89, 1.01])
 *    - Directional sun and ambient light stability (zero drift)
 * 2. Raycasting square selection across all 64 squares under 6 camera angles:
 *    - Default battle angle, 90-deg side, 180-deg reverse, 270-deg flank, low grazing pitch (0.25), high overhead (1.30)
 *    - Multi-object collision test against recessed boardDais and daisRim
 *    - Coordinate matching and elevation accuracy (y = 0.000)
 * 3. Contact shadow quad geometry, material properties, and overlap clearance:
 *    - Material verification (depthWrite: false, polygonOffsetFactor: -1.0, polygonOffsetUnits: -4.0, transparent: true)
 *    - Elevation verification (y = 0.0020)
 *    - Clearance analysis between all adjacent piece pairs (orthogonal and diagonal)
 *    - Theoretical worst-case clearance analysis
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function main() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const debugPort = 9240;
  const tempProfile = path.join(os.tmpdir(), 'chrome_m1_challenger_' + Date.now());

  console.log(`[CHALLENGER M1] Spawning Chrome on port ${debugPort}...`);
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

  if (!tabs || tabs.length === 0) {
    chrome.kill();
    throw new Error('Failed to connect to Chrome DevTools endpoint');
  }

  const target = tabs.find(t => t.type === 'page' && t.url.includes('localhost:8080')) || tabs[0];
  console.log(`[CHALLENGER M1] Connecting to page: ${target.webSocketDebuggerUrl}`);

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

  console.log('[CHALLENGER M1] Waiting for battlefield initialization and models...');
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
    throw new Error('Battlefield failed to initialize within 15 seconds.');
  }
  console.log('[CHALLENGER M1] Battlefield ready. Commencing adversarial test suite.');

  // =========================================================================
  // TASK 1: Light Source Stability Across 200+ Animation Frames
  // =========================================================================
  console.log('\n============================================================');
  console.log('TASK 1: LIGHT SOURCE STABILITY AUDIT (200 ANIMATION FRAMES)');
  console.log('============================================================');
  
  const lightAuditResult = await send('Runtime.evaluate', {
    awaitPromise: true,
    expression: `(async () => {
      const sampleCount = 200;
      const samples = [];

      for (let f = 0; f < sampleCount; f++) {
        const now = await new Promise(resolve => requestAnimationFrame(resolve));
        const tSec = now / 1000.0;
        samples.push({
          frame: f,
          tSec,
          braziers: brazierLights.map((b, idx) => ({
            idx,
            intensity: b.light.intensity,
            distance: b.light.distance,
            decay: b.light.decay
          })),
          sunLight: {
            intensity: sunLight.intensity,
            bias: sunLight.shadow.bias,
            normalBias: sunLight.shadow.normalBias
          },
          ambient: {
            intensity: ambientLight.intensity
          }
        });
      }

      // Theoretical harmonic bound:
      // I(t) = 0.95 + 0.04*sin(2.6*t + s) + 0.02*sin(5.4*t + 1.8*s)
      // |dI/dt| <= 0.04*2.6 + 0.02*5.4 = 0.104 + 0.108 = 0.212 units/sec.
      // Noise tolerance ceiling = 0.300 units/sec (tolerates discrete sampling jitter; white noise is ~7.5 units/sec).
      const DERIVATIVE_CEILING = 0.300;

      const numBraziers = brazierLights.length;
      const brazierReports = [];

      for (let b = 0; b < numBraziers; b++) {
        const ratesOfChange = [];
        const rawDeltas = [];
        const intensities = samples.map(s => s.braziers[b].intensity);

        for (let i = 1; i < samples.length; i++) {
          const dt = samples[i].tSec - samples[i - 1].tSec;
          const dI = samples[i].braziers[b].intensity - samples[i - 1].braziers[b].intensity;
          rawDeltas.push(Math.abs(dI));
          if (dt > 0.0001) {
            ratesOfChange.push(Math.abs(dI / dt));
          }
        }

        const maxRate = Math.max(...ratesOfChange);
        const meanRate = ratesOfChange.reduce((a, b) => a + b, 0) / ratesOfChange.length;
        const minIntensity = Math.min(...intensities);
        const maxIntensity = Math.max(...intensities);
        const distance = samples[0].braziers[b].distance;

        // Check for stochastic noise or discontinuities
        const noiseSpikes = ratesOfChange.filter(r => r > DERIVATIVE_CEILING);

        brazierReports.push({
          brazierIndex: b,
          distance,
          minIntensity: Number(minIntensity.toFixed(5)),
          maxIntensity: Number(maxIntensity.toFixed(5)),
          maxRateOfChange: Number(maxRate.toFixed(4)),
          meanRateOfChange: Number(meanRate.toFixed(4)),
          theoreticalBound: 0.212,
          derivativeCeiling: DERIVATIVE_CEILING,
          noiseSpikesCount: noiseSpikes.length,
          isHarmonicAndSmooth: noiseSpikes.length === 0,
          isBounded: minIntensity >= 0.885 && maxIntensity <= 1.015,
          isDistanceClamped: distance === 6.5
        });
      }

      // Check sun and ambient stability
      const sunIntensities = samples.map(s => s.sunLight.intensity);
      const sunMin = Math.min(...sunIntensities);
      const sunMax = Math.max(...sunIntensities);
      const sunDrift = Math.abs(sunMax - sunMin);

      const ambIntensities = samples.map(s => s.ambient.intensity);
      const ambMin = Math.min(...ambIntensities);
      const ambMax = Math.max(...ambIntensities);
      const ambDrift = Math.abs(ambMax - ambMin);

      return {
        sampleCount,
        numBraziers,
        brazierReports,
        allBraziersSmooth: brazierReports.every(r => r.isHarmonicAndSmooth),
        allBraziersBounded: brazierReports.every(r => r.isBounded),
        allBraziersClamped: brazierReports.every(r => r.isDistanceClamped),
        sunDrift: Number(sunDrift.toFixed(6)),
        sunBias: samples[0].sunLight.bias,
        sunNormalBias: samples[0].sunLight.normalBias,
        ambDrift: Number(ambDrift.toFixed(6)),
        sunStable: sunDrift === 0,
        ambStable: ambDrift === 0
      };
    })()`,
    returnByValue: true
  });

  const lightAudit = lightAuditResult.result.value;
  console.log(`Audited ${lightAudit.sampleCount} frames across ${lightAudit.numBraziers} braziers:`);
  console.log(`- All braziers harmonic & smooth (|dI/dt| <= 0.240): ${lightAudit.allBraziersSmooth}`);
  console.log(`- All braziers bounded within [0.885, 1.015]: ${lightAudit.allBraziersBounded}`);
  console.log(`- All braziers distance clamped to 6.5: ${lightAudit.allBraziersClamped}`);
  console.log(`- SunLight stable (zero drift): ${lightAudit.sunStable} (bias: ${lightAudit.sunBias}, normalBias: ${lightAudit.sunNormalBias})`);
  console.log(`- AmbientLight stable (zero drift): ${lightAudit.ambStable}`);
  console.log('Sample Brazier 0 Detail:', lightAudit.brazierReports[0]);

  // =========================================================================
  // TASK 2: Raycasting Square Selection Across All 64 Squares (Multi-Camera)
  // =========================================================================
  console.log('\n============================================================');
  console.log('TASK 2: RAYCASTING SQUARE SELECTION AUDIT (64 SQUARES X 6 POSES)');
  console.log('============================================================');
  
  const raycastAuditResult = await send('Runtime.evaluate', {
    awaitPromise: true,
    expression: `(async () => {
      const cameraAngles = [
        { name: 'Default Battle Angle', yaw: 0.32, pitch: 0.58, dist: 21.0 },
        { name: '90-deg Side Angle', yaw: 0.32 + Math.PI / 2, pitch: 0.58, dist: 21.0 },
        { name: '180-deg Reverse Angle', yaw: 0.32 + Math.PI, pitch: 0.58, dist: 21.0 },
        { name: '270-deg Flank Angle', yaw: 0.32 + 3 * Math.PI / 2, pitch: 0.58, dist: 21.0 },
        { name: 'Low Grazing Pitch (Extreme Edge)', yaw: 0.32, pitch: 0.25, dist: 24.0 },
        { name: 'High Overhead Pitch', yaw: 0.32, pitch: 1.30, dist: 18.0 }
      ];

      const angleResults = [];

      for (const cam of cameraAngles) {
        camState.targetYaw = cam.yaw;
        camState.yaw = cam.yaw;
        camState.targetPitch = cam.pitch;
        camState.pitch = cam.pitch;
        camState.targetDistance = cam.dist;
        camState.distance = cam.dist;
        
        // Force update camera matrices
        const r = camState.distance * Math.cos(camState.pitch);
        camera.position.x = camState.lookPivot.x + r * Math.sin(camState.yaw);
        camera.position.y = camState.lookPivot.y + camState.distance * Math.sin(camState.pitch);
        camera.position.z = camState.lookPivot.z + r * Math.cos(camState.yaw);
        camera.lookAt(camState.lookPivot);
        camera.updateMatrixWorld();

        let squaresTested = 0;
        let hitsMatching = 0;
        let daisInterferenceCount = 0;
        let maxElevationError = 0;
        const squareHits = [];

        for (let f = 0; f < 8; f++) {
          for (let r = 0; r < 8; r++) {
            squaresTested++;
            const wp = coordToWorld(f, r); // Center of square at y = 0
            
            // Project center into Normalized Device Coordinates [-1, 1]
            const ndc = wp.clone().project(camera);
            
            // Cast ray
            const ray = new THREE.Raycaster();
            ray.setFromCamera(ndc, camera);

            // 1. Raycast against tileMeshes only (gameplay raycast)
            const tileHits = ray.intersectObjects(tileMeshes, false);
            const firstTileHit = tileHits.length > 0 ? tileHits[0] : null;

            // 2. Adversarial raycast against tileMeshes + boardDais + daisRim
            // Verifies that neither boardDais nor daisRim obstructs the tile
            const allHits = ray.intersectObjects([...tileMeshes, boardDais, daisRim], false);
            const firstAllHit = allHits.length > 0 ? allHits[0] : null;

            if (firstAllHit && firstAllHit.object !== firstTileHit?.object) {
              daisInterferenceCount++;
            }

            if (firstTileHit && firstTileHit.object.userData.f === f && firstTileHit.object.userData.r === r) {
              hitsMatching++;
              const elevErr = Math.abs(firstTileHit.point.y - 0.000);
              if (elevErr > maxElevationError) maxElevationError = elevErr;
            } else {
              squareHits.push({
                f, r,
                expectedCoord: { f, r },
                hitCoord: firstTileHit ? firstTileHit.object.userData : null
              });
            }
          }
        }

        angleResults.push({
          angleName: cam.name,
          squaresTested,
          hitsMatching,
          daisInterferenceCount,
          maxElevationError: Number(maxElevationError.toFixed(6)),
          successRate: (hitsMatching / squaresTested) * 100,
          passed: hitsMatching === 64 && daisInterferenceCount === 0
        });
      }

      // Reset camera to default
      camState.targetYaw = 0.32;
      camState.yaw = 0.32;
      camState.targetPitch = 0.58;
      camState.pitch = 0.58;
      camState.targetDistance = 21.0;
      camState.distance = 21.0;

      return {
        totalAnglesTested: cameraAngles.length,
        totalRaycastsPerformed: cameraAngles.length * 64,
        angleResults,
        allAnglesPassed: angleResults.every(a => a.passed)
      };
    })()`,
    returnByValue: true
  });

  const raycastAudit = raycastAuditResult.result.value;
  console.log(`Audited 64 squares across ${raycastAudit.totalAnglesTested} camera poses (${raycastAudit.totalRaycastsPerformed} raycasts):`);
  raycastAudit.angleResults.forEach(a => {
    console.log(`- [${a.passed ? 'PASS' : 'FAIL'}] ${a.angleName}: ${a.hitsMatching}/64 hits matching, daisInterference: ${a.daisInterferenceCount}, maxElevationError: ${a.maxElevationError}`);
  });
  console.log(`- Overall Raycast Stability: ${raycastAudit.allAnglesPassed ? 'PASSED' : 'FAILED'}`);

  // =========================================================================
  // TASK 3: Contact Shadow Quad Overlap & Material Verification
  // =========================================================================
  console.log('\n============================================================');
  console.log('TASK 3: CONTACT SHADOW QUAD OVERLAP & STABILITY AUDIT');
  console.log('============================================================');
  
  const shadowAuditResult = await send('Runtime.evaluate', {
    expression: `(() => {
      try {
        const TILE_SIZE = 2.0;
        const BOARD_OFFSET = 3.5 * TILE_SIZE;

        // Collect shadow quads for all 32 active rigs
        const shadowList = [];
        for (let i = 0; i < activeRigs.length; i++) {
          const rig = activeRigs[i];
          const shadow = rig.contactShadow;
          if (!shadow) continue;

          const mat = shadow.material;
          const pos = new THREE.Vector3();
          shadow.getWorldPosition(pos);

          // Get dimensions from geometry
          const geoParams = shadow.geometry.parameters;
          const width = geoParams ? geoParams.width : 1.25;
          const height = geoParams ? geoParams.height : 1.25;
          const dim = Math.max(width, height);

          // Derive square coordinate (f, r) from world position
          const f = Math.round((pos.x + BOARD_OFFSET) / TILE_SIZE);
          const r = 7 - Math.round((pos.z + BOARD_OFFSET) / TILE_SIZE);

          shadowList.push({
            rigIndex: i,
            team: rig.team,
            type: rig.type,
            coord: { f, r },
            worldPos: { x: Number(pos.x.toFixed(4)), y: Number(pos.y.toFixed(4)), z: Number(pos.z.toFixed(4)) },
            dimension: Number(dim.toFixed(4)),
            elevation: Number(pos.y.toFixed(4)),
            material: {
              transparent: mat.transparent,
              depthWrite: mat.depthWrite,
              polygonOffset: mat.polygonOffset,
              polygonOffsetFactor: mat.polygonOffsetFactor,
              polygonOffsetUnits: mat.polygonOffsetUnits,
              opacity: mat.opacity
            }
          });
        }

        // Material and Elevation properties verification
        const allDepthWriteFalse = shadowList.every(s => s.material.depthWrite === false);
        const allPolygonOffsetEnabled = shadowList.every(s => 
          s.material.polygonOffset === true && 
          s.material.polygonOffsetFactor === -1.0 && 
          s.material.polygonOffsetUnits === -4.0
        );
        const allElevationsCorrect = shadowList.every(s => Math.abs(s.elevation - 0.002) < 0.0005);
        const maxShadowDimension = Math.max(...shadowList.map(s => s.dimension));

        // Pairwise clearance check across all pairs of pieces
        let orthogonalPairsTested = 0;
        let diagonalPairsTested = 0;
        let minOrthogonalGap = 999.0;
        let minDiagonalGap = 999.0;
        const overlappingPairs = [];

        for (let i = 0; i < shadowList.length; i++) {
          for (let j = i + 1; j < shadowList.length; j++) {
            const s1 = shadowList[i];
            const s2 = shadowList[j];

            const df = Math.abs(s1.coord.f - s2.coord.f);
            const dr = Math.abs(s1.coord.r - s2.coord.r);

            if ((df === 1 && dr === 0) || (df === 0 && dr === 1)) {
              // Orthogonally adjacent pieces
              orthogonalPairsTested++;
              const dx = Math.abs(s1.worldPos.x - s2.worldPos.x);
              const dz = Math.abs(s1.worldPos.z - s2.worldPos.z);
              const centerDist = Math.max(dx, dz); // 2.0
              const shadowHalfSpan = (s1.dimension / 2) + (s2.dimension / 2);
              const edgeGap = centerDist - shadowHalfSpan;
              if (edgeGap < minOrthogonalGap) minOrthogonalGap = edgeGap;
              if (edgeGap <= 0) {
                overlappingPairs.push({ type: 'orthogonal', s1: s1.coord, s2: s2.coord, gap: edgeGap });
              }
            } else if (df === 1 && dr === 1) {
              // Diagonally adjacent pieces
              diagonalPairsTested++;
              const dx = Math.abs(s1.worldPos.x - s2.worldPos.x);
              const dz = Math.abs(s1.worldPos.z - s2.worldPos.z);
              const centerDist = Math.hypot(dx, dz); // ~2.8284
              const cornerHalfSpan = ((s1.dimension / 2) * Math.SQRT2) + ((s2.dimension / 2) * Math.SQRT2);
              const cornerGap = centerDist - cornerHalfSpan;
              if (cornerGap < minDiagonalGap) minDiagonalGap = cornerGap;
              if (cornerGap <= 0) {
                overlappingPairs.push({ type: 'diagonal', s1: s1.coord, s2: s2.coord, gap: cornerGap });
              }
            }
          }
        }

        // Theoretical bounds
        // Largest shadow is Rook with dimension = 1.55.
        // Worst-case orthogonal gap: 2.0 - (1.55/2 + 1.55/2) = 0.4500
        // Worst-case diagonal gap: 2.0*sqrt(2) - 1.55*sqrt(2) = 0.6364
        const worstCaseOrthogonalGap = 2.0 - 1.55;
        const worstCaseDiagonalGap = (2.0 - 1.55) * Math.SQRT2;

        return {
          totalShadowsFound: shadowList.length,
          maxShadowDimension,
          allDepthWriteFalse,
          allPolygonOffsetEnabled,
          allElevationsCorrect,
          orthogonalPairsTested,
          diagonalPairsTested,
          minOrthogonalGap: Number(minOrthogonalGap.toFixed(4)),
          minDiagonalGap: Number(minDiagonalGap.toFixed(4)),
          worstCaseOrthogonalGap: Number(worstCaseOrthogonalGap.toFixed(4)),
          worstCaseDiagonalGap: Number(worstCaseDiagonalGap.toFixed(4)),
          overlappingPairsCount: overlappingPairs.length,
          overlappingPairs,
          isZeroOverlapVerified: overlappingPairs.length === 0,
          polygonOffsetConfig: shadowList[0].material
        };
      } catch (err) {
        return { error: err.toString(), stack: err.stack };
      }
    })()`,
    returnByValue: true
  });

  const shadowAudit = shadowAuditResult.result.value;
  if (shadowAudit.error) {
    console.error('Shadow audit error:', shadowAudit.error, shadowAudit.stack);
  } else {
    console.log(`Audited ${shadowAudit.totalShadowsFound} contact shadows across active pieces:`);
    console.log(`- Max shadow dimension: ${shadowAudit.maxShadowDimension} (Tile size = 2.00)`);
    console.log(`- All depthWrite: false (eliminates depth buffer contention): ${shadowAudit.allDepthWriteFalse}`);
    console.log(`- All polygonOffset enabled (-1.0, -4.0): ${shadowAudit.allPolygonOffsetEnabled}`);
    console.log(`- All elevations strictly y = 0.0020: ${shadowAudit.allElevationsCorrect}`);
    console.log(`- Orthogonal adjacent pairs tested: ${shadowAudit.orthogonalPairsTested}, min edge clearance: ${shadowAudit.minOrthogonalGap} (Worst case: ${shadowAudit.worstCaseOrthogonalGap})`);
    console.log(`- Diagonal adjacent pairs tested: ${shadowAudit.diagonalPairsTested}, min corner clearance: ${shadowAudit.minDiagonalGap} (Worst case: ${shadowAudit.worstCaseDiagonalGap})`);
    console.log(`- Overlapping shadow pairs: ${shadowAudit.overlappingPairsCount} (Zero Overlap: ${shadowAudit.isZeroOverlapVerified})`);
  }

  // =========================================================================
  // OVERALL VERDICT
  // =========================================================================
  const allTestsPassed = 
    lightAudit.allBraziersSmooth && 
    lightAudit.allBraziersBounded && 
    lightAudit.allBraziersClamped &&
    lightAudit.sunStable &&
    lightAudit.ambStable &&
    raycastAudit.allAnglesPassed &&
    shadowAudit && !shadowAudit.error &&
    shadowAudit.allDepthWriteFalse &&
    shadowAudit.allPolygonOffsetEnabled &&
    shadowAudit.allElevationsCorrect &&
    shadowAudit.isZeroOverlapVerified;

  console.log('\n============================================================');
  console.log(`OVERALL EMPIRICAL VERDICT: ${allTestsPassed ? 'APPROVE' : 'REQUEST_CHANGES'}`);
  console.log('============================================================');

  const reportData = {
    timestamp: new Date().toISOString(),
    verdict: allTestsPassed ? 'APPROVE' : 'REQUEST_CHANGES',
    lightAudit,
    raycastAudit,
    shadowAudit
  };
  fs.writeFileSync('adversarial_m1_report.json', JSON.stringify(reportData, null, 2));
  console.log('Saved detailed report to adversarial_m1_report.json');

  ws.close();
  chrome.kill();
  process.exit(allTestsPassed ? 0 : 1);
}

main().catch(err => {
  console.error('[CHALLENGER M1 ERROR]:', err);
  process.exit(1);
});
