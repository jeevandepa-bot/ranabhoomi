const fs = require('fs');
const path = require('path');

const models = ['padati', 'gajadhvaja', 'ashvarohi', 'ratha', 'maharani', 'samrat'];
const assetsDir = path.resolve('assets');

console.log('='.repeat(80));
console.log('INDEPENDENT RAW GLB BINARY INSPECTION (NODE.JS)');
console.log('='.repeat(80));

let allPass = true;

for (const model of models) {
  const filePath = path.join(assetsDir, `${model}.glb`);
  if (!fs.existsSync(filePath)) {
    console.error(`[FAIL] ${model}.glb does not exist!`);
    allPass = false;
    continue;
  }

  const buf = fs.readFileSync(filePath);
  const magic = buf.readUInt32LE(0);
  const version = buf.readUInt32LE(4);
  const length = buf.readUInt32LE(8);

  if (magic !== 0x46546c67) {
    console.error(`[FAIL] ${model}.glb invalid magic: 0x${magic.toString(16)}`);
    allPass = false;
    continue;
  }

  // Chunk 0 (JSON)
  const jsonChunkLength = buf.readUInt32LE(12);
  const jsonChunkType = buf.readUInt32LE(16);
  if (jsonChunkType !== 0x4e4f534a) {
    console.error(`[FAIL] ${model}.glb invalid json chunk type: 0x${jsonChunkType.toString(16)}`);
    allPass = false;
    continue;
  }

  const jsonBytes = buf.subarray(20, 20 + jsonChunkLength);
  const gltf = JSON.parse(jsonBytes.toString('utf8'));

  console.log(`\n--- Inspecting ${model}.glb (Binary size: ${buf.length.toLocaleString()} bytes) ---`);
  console.log(`glTF Generator: ${gltf.asset && gltf.asset.generator}`);
  console.log(`Nodes count: ${gltf.nodes ? gltf.nodes.length : 0} | Meshes count: ${gltf.meshes ? gltf.meshes.length : 0} | Accessors: ${gltf.accessors ? gltf.accessors.length : 0}`);

  // Inspect node transforms (scale, rotation, translation)
  let unfrozenNodes = [];
  if (gltf.nodes) {
    for (let i = 0; i < gltf.nodes.length; i++) {
      const node = gltf.nodes[i];
      if (node.scale && (Math.abs(node.scale[0] - 1) > 1e-4 || Math.abs(node.scale[1] - 1) > 1e-4 || Math.abs(node.scale[2] - 1) > 1e-4)) {
        unfrozenNodes.push({ name: node.name || `node_${i}`, scale: node.scale });
      }
    }
  }
  if (unfrozenNodes.length > 0) {
    console.error(`  [FAIL] Unfrozen node scales:`, unfrozenNodes);
    allPass = false;
  } else {
    console.log(`  [PASS] All ${gltf.nodes ? gltf.nodes.length : 0} nodes have frozen scale (1.0, 1.0, 1.0)`);
  }

  // Inspect POSITION accessors for global bounding box in glTF coordinates (Y-up)
  let globalMin = [Infinity, Infinity, Infinity];
  let globalMax = [-Infinity, -Infinity, -Infinity];
  let positionAccessorCount = 0;
  let runawayAccessors = [];

  if (gltf.accessors && gltf.meshes) {
    for (const mesh of gltf.meshes) {
      for (const prim of mesh.primitives) {
        if (prim.attributes && prim.attributes.POSITION !== undefined) {
          const acc = gltf.accessors[prim.attributes.POSITION];
          positionAccessorCount++;
          if (acc.min && acc.max) {
            for (let c = 0; c < 3; c++) {
              globalMin[c] = Math.min(globalMin[c], acc.min[c]);
              globalMax[c] = Math.max(globalMax[c], acc.max[c]);
              if (Math.abs(acc.min[c]) > 10.0 || Math.abs(acc.max[c]) > 10.0) {
                runawayAccessors.push({ mesh: mesh.name, coord: c, min: acc.min, max: acc.max });
              }
            }
          }
        }
      }
    }
  }

  console.log(`  POSITION Accessors: ${positionAccessorCount}`);
  console.log(`  Raw glTF BBox (Y-up): Min=[${globalMin.map(v => v.toFixed(4)).join(', ')}] Max=[${globalMax.map(v => v.toFixed(4)).join(', ')}]`);
  // In glTF Y-up: Y is elevation above ground.
  // Verify Y_min == 0.000m within tolerance [-0.001, +0.001]
  const yMin = globalMin[1];
  console.log(`  glTF Y_min (Ground elevation): ${yMin.toFixed(6)}m`);

  if (Math.abs(yMin) > 0.001) {
    console.error(`  [FAIL] Grounding defect: glTF Y_min is ${yMin.toFixed(6)}m (expected 0.000m +/- 0.001m)`);
    allPass = false;
  } else {
    console.log(`  [PASS] Exact floor grounding confirmed: glTF Y_min = ${yMin.toFixed(6)}m`);
  }

  if (runawayAccessors.length > 0) {
    console.error(`  [FAIL] Runaway accessors found:`, runawayAccessors);
    allPass = false;
  } else {
    console.log(`  [PASS] Zero runaway vertices (all coordinates within [-10m, +10m])`);
  }
}

console.log('\n' + '='.repeat(80));
console.log(`RAW BINARY GLB VERDICT: ${allPass ? 'APPROVE' : 'REQUEST_CHANGES'}`);
console.log('='.repeat(80));

process.exit(allPass ? 0 : 1);
