const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

async function runAudit() {
  console.log('=== STARTING EMPIRICAL AUDIT FOR MILESTONE 2 ===');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9226',
    '--disable-gpu-sandbox',
    '--use-gl=angle',
    '--use-angle=d3d11',
    '--window-size=1920,1080',
    'http://localhost:8080/index.html'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  let res, tabs;
  for (let i = 0; i < 15; i++) {
    try {
      res = await fetch('http://127.0.0.1:9226/json');
      tabs = await res.json();
      if (tabs && tabs.length > 0) break;
    } catch (e) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  if (!tabs || tabs.length === 0) {
    throw new Error('Could not connect to Chrome debugging endpoint on port 9226');
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
  await send('Page.enable');

  // Wait until ModelManager is loaded and activeRigs ready
  console.log('Waiting for engine initialization...');
  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 500));
    const evalRes = await send('Runtime.evaluate', {
      expression: 'typeof ModelManager !== "undefined" && ModelManager.isLoaded && typeof activeRigs !== "undefined" && activeRigs.length === 32',
      returnByValue: true
    });
    if (evalRes && evalRes.result && evalRes.result.value) break;
  }

  // 1. Texture Resolution, Mipmaps, and Filtering Audit across all 64 tiles
  console.log('\n--- 1. AUDITING 64 TILES AND TEXTURE PROPERTIES ---');
  const textureAudit = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const results = {
          tileCount: tileMeshes.length,
          maxAnisotropy: renderer.capabilities.getMaxAnisotropy(),
          tiles: [],
          uniqueMaterials: [],
          runicGrid: null,
          skyDome: null,
          groundMat: null
        };

        const matMap = new Map();

        tileMeshes.forEach((mesh, idx) => {
          const mat = mesh.material;
          const isLight = (mesh.userData.f + mesh.userData.r) % 2 === 1;
          const texInfo = (tex) => {
            if (!tex) return null;
            return {
              hasImage: !!tex.image,
              width: tex.image ? tex.image.width : null,
              height: tex.image ? tex.image.height : null,
              generateMipmaps: tex.generateMipmaps,
              minFilter: tex.minFilter,
              magFilter: tex.magFilter,
              anisotropy: tex.anisotropy,
              encoding: tex.encoding
            };
          };

          const info = {
            index: idx,
            file: mesh.userData.f,
            rank: mesh.userData.r,
            isLight,
            position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
            geoSize: [mesh.geometry.parameters.width, mesh.geometry.parameters.height, mesh.geometry.parameters.depth],
            maps: {
              diffuse: texInfo(mat.map),
              normal: texInfo(mat.normalMap),
              roughness: texInfo(mat.roughnessMap),
              emissive: texInfo(mat.emissiveMap)
            },
            normalScale: mat.normalScale ? [mat.normalScale.x, mat.normalScale.y] : null,
            roughness: mat.roughness,
            metalness: mat.metalness,
            emissiveColor: mat.emissive ? mat.emissive.getHexString() : null,
            emissiveIntensity: mat.emissiveIntensity
          };

          if (!matMap.has(mat.uuid)) {
            matMap.set(mat.uuid, {
              uuid: mat.uuid,
              name: isLight ? 'lightTileMat' : 'darkTileMat',
              info
            });
          }

          results.tiles.push({
            f: mesh.userData.f,
            r: mesh.userData.r,
            y: mesh.position.y,
            matUuid: mat.uuid
          });
        });

        results.uniqueMaterials = Array.from(matMap.values());

        // Runic Grid inspection
        const rgMesh = battlefieldGroup.children.find(c => c.geometry && c.geometry.type === 'PlaneGeometry' && c.geometry.parameters.width === 16);
        if (rgMesh) {
          const rgTex = rgMesh.material.map;
          results.runicGrid = {
            position: { x: rgMesh.position.x, y: rgMesh.position.y, z: rgMesh.position.z },
            polygonOffset: rgMesh.material.polygonOffset,
            polygonOffsetFactor: rgMesh.material.polygonOffsetFactor,
            polygonOffsetUnits: rgMesh.material.polygonOffsetUnits,
            depthWrite: rgMesh.material.depthWrite,
            transparent: rgMesh.material.transparent,
            opacity: rgMesh.material.opacity,
            texture: rgTex ? {
              width: rgTex.image ? rgTex.image.width : null,
              height: rgTex.image ? rgTex.image.height : null,
              generateMipmaps: rgTex.generateMipmaps,
              minFilter: rgTex.minFilter,
              magFilter: rgTex.magFilter,
              anisotropy: rgTex.anisotropy
            } : null
          };
        }

        // Sky dome inspection
        if (typeof skyDome !== 'undefined' && skyDome) {
          const sTex = skyDome.material.map;
          results.skyDome = {
            radius: skyDome.geometry.parameters.radius,
            fog: skyDome.material.fog,
            texture: sTex ? {
              width: sTex.image ? sTex.image.width : null,
              height: sTex.image ? sTex.image.height : null,
              generateMipmaps: sTex.generateMipmaps,
              minFilter: sTex.minFilter,
              anisotropy: sTex.anisotropy
            } : null
          };
        }

        // Dais & Rim inspection
        results.boardDaisY = boardDais ? boardDais.position.y : null;
        results.daisRimY = daisRim ? daisRim.position.y : null;

        return results;
      })()
    `,
    returnByValue: true
  });

  const auditData = textureAudit.result.value;
  fs.writeFileSync('audit_m2_texture_metrics.json', JSON.stringify(auditData, null, 2));
  console.log(`Audited ${auditData.tileCount} tiles.`);
  console.log(`Max Hardware Anisotropy: ${auditData.maxAnisotropy}`);
  console.log(`Unique Materials: ${auditData.uniqueMaterials.length}`);
  auditData.uniqueMaterials.forEach(m => {
    console.log(`  Material: ${m.name}`);
    console.log(`    Diffuse: ${m.info.maps.diffuse.width}x${m.info.maps.diffuse.height}, minFilter: ${m.info.maps.diffuse.minFilter}, mipmaps: ${m.info.maps.diffuse.generateMipmaps}, anisotropy: ${m.info.maps.diffuse.anisotropy}`);
    console.log(`    Normal: ${m.info.maps.normal.width}x${m.info.maps.normal.height}, minFilter: ${m.info.maps.normal.minFilter}, anisotropy: ${m.info.maps.normal.anisotropy}`);
    console.log(`    Emissive: ${m.info.maps.emissive.width}x${m.info.maps.emissive.height}, intensity: ${m.info.emissiveIntensity}`);
  });

  if (auditData.runicGrid) {
    console.log('Runic Grid:');
    console.log(`  Plane Position Y: ${auditData.runicGrid.position.y}`);
    console.log(`  PolygonOffset: ${auditData.runicGrid.polygonOffset} (factor: ${auditData.runicGrid.polygonOffsetFactor}, units: ${auditData.runicGrid.polygonOffsetUnits})`);
    console.log(`  Texture: ${auditData.runicGrid.texture.width}x${auditData.runicGrid.texture.height}, anisotropy: ${auditData.runicGrid.texture.anisotropy}`);
  }

  // 2. Camera View Captures for Visual Defect Inspection
  console.log('\n--- 2. CAPTURING MULTI-ANGLE STRESS SCREENSHOTS ---');

  const captureView = async (name, setupCode) => {
    console.log(`Capturing view: ${name}...`);
    await send('Runtime.evaluate', { expression: setupCode });
    await new Promise(r => setTimeout(r, 900));
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const filename = `m2_view_${name}.png`;
    fs.writeFileSync(filename, Buffer.from(shot.data, 'base64'));
    console.log(`Saved ${filename}`);
  };

  // View 1: Extreme Grazing Angle View (Looking across the surface at 0.08 rad pitch)
  await captureView('grazing_angle', `
    camState.distance = camState.targetDistance = 16.0;
    camState.pitch = camState.targetPitch = 0.08;
    camState.yaw = camState.targetYaw = 0.0;
    camState.lookPivot.set(0, 0.1, 0);
    camState.targetLookPivot.set(0, 0.1, 0);
  `);

  // View 2: Orthogonal Top-Down View (Looking straight down at board tiles and runic grid)
  await captureView('top_down_ortho', `
    camState.distance = camState.targetDistance = 22.0;
    camState.pitch = camState.targetPitch = 1.56;
    camState.yaw = camState.targetYaw = 0.0;
    camState.lookPivot.set(0, 0.0, 0);
    camState.targetLookPivot.set(0, 0.0, 0);
  `);

  // View 3: Close-up Corner Tile & Seam Detail (Looking closely at tile seams, bevels, cracks, and runic grid)
  await captureView('tile_seam_detail', `
    camState.distance = camState.targetDistance = 6.5;
    camState.pitch = camState.targetPitch = 0.42;
    camState.yaw = camState.targetYaw = 0.78;
    camState.lookPivot.set(4.0, 0.0, 4.0);
    camState.targetLookPivot.set(4.0, 0.0, 4.0);
  `);

  // View 4: Wide Cinematic Atmosphere Shot (Sky dome, fog, mist, lighting, mountain silhouette)
  await captureView('wide_atmosphere', `
    camState.distance = camState.targetDistance = 34.0;
    camState.pitch = camState.targetPitch = 0.35;
    camState.yaw = camState.targetYaw = 0.55;
    camState.lookPivot.set(0, 2.0, 0);
    camState.targetLookPivot.set(0, 2.0, 0);
  `);

  // View 5: Ground-Level Horizon View (Inspecting ground terrain blending and sky dome horizon)
  await captureView('horizon_skyline', `
    camState.distance = camState.targetDistance = 28.0;
    camState.pitch = camState.targetPitch = 0.12;
    camState.yaw = camState.targetYaw = 1.57;
    camState.lookPivot.set(0, 1.5, 0);
    camState.targetLookPivot.set(0, 1.5, 0);
  `);

  ws.close();
  chrome.kill();
  console.log('=== EMPIRICAL AUDIT COMPLETE ===');
}

runAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
