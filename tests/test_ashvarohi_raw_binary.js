/**
 * Adversarial Binary GLB Verification Script for Ashvarohi (Knight) M1
 * Directly unpacks glTF JSON chunk and IEEE-754 binary buffers.
 */

const fs = require('fs');
const path = require('path');

const glbPath = path.resolve('assets/ashvarohi.glb');
console.log('='.repeat(80));
console.log('ADVERSARIAL RAW BINARY VERTEX & TRANSFORM HARNESS');
console.log(`Target: ${glbPath}`);
console.log('='.repeat(80));

if (!fs.existsSync(glbPath)) {
  console.error(`[FAIL] File does not exist: ${glbPath}`);
  process.exit(1);
}

const fileBuffer = fs.readFileSync(glbPath);
const fileSize = fileBuffer.length;
console.log(`GLB Binary File Size: ${fileSize.toLocaleString()} bytes`);

// 1. Header Verification
const magic = fileBuffer.readUInt32LE(0);
const version = fileBuffer.readUInt32LE(4);
const length = fileBuffer.readUInt32LE(8);

console.log(`Header Magic: 0x${magic.toString(16)} (expected 0x46546c67 'glTF')`);
console.log(`Header Version: ${version} (expected 2)`);
console.log(`Header Total Length: ${length.toLocaleString()} bytes`);

if (magic !== 0x46546c67 || version !== 2 || length !== fileSize) {
  console.error(`[FAIL] Header integrity check failed!`);
  process.exit(1);
}

// 2. Chunk 0: JSON Chunk
const jsonChunkLength = fileBuffer.readUInt32LE(12);
const jsonChunkType = fileBuffer.readUInt32LE(16);
if (jsonChunkType !== 0x4e4f534a) {
  console.error(`[FAIL] Chunk 0 is not JSON (0x${jsonChunkType.toString(16)})`);
  process.exit(1);
}
const jsonBuffer = fileBuffer.subarray(20, 20 + jsonChunkLength);
const gltf = JSON.parse(jsonBuffer.toString('utf8'));

// 3. Chunk 1: Binary Chunk
const binChunkOffset = 20 + jsonChunkLength;
const binChunkLength = fileBuffer.readUInt32LE(binChunkOffset);
const binChunkType = fileBuffer.readUInt32LE(binChunkOffset + 4);
if (binChunkType !== 0x004e4942) {
  console.error(`[FAIL] Chunk 1 is not BIN (0x${binChunkType.toString(16)})`);
  process.exit(1);
}
const binBuffer = fileBuffer.subarray(binChunkOffset + 8, binChunkOffset + 8 + binChunkLength);
console.log(`Binary Chunk Offset: ${binChunkOffset + 8}, Length: ${binChunkLength.toLocaleString()} bytes`);

let failures = [];
let warnings = [];

// 4. Node Hierarchy & Transform Freezing Check
console.log('\n--- 1. Node Hierarchy & Transform Freezing Check ---');
const nodes = gltf.nodes || [];
console.log(`Total Nodes in glTF: ${nodes.length}`);

if (nodes.length !== 36) {
  failures.push(`Expected exactly 36 nodes, found ${nodes.length}`);
}

const unfrozenScales = [];
const nonZeroRotations = [];
const nonZeroTranslations = [];

nodes.forEach((node, idx) => {
  const name = node.name || `Node_${idx}`;
  
  // Scale
  if (node.scale) {
    const s = node.scale;
    if (Math.abs(s[0] - 1.0) > 1e-5 || Math.abs(s[1] - 1.0) > 1e-5 || Math.abs(s[2] - 1.0) > 1e-5) {
      unfrozenScales.push({ name, scale: s });
    }
  }

  // Matrix check if present
  if (node.matrix) {
    const m = node.matrix;
    // Column vectors
    const sx = Math.hypot(m[0], m[1], m[2]);
    const sy = Math.hypot(m[4], m[5], m[6]);
    const sz = Math.hypot(m[8], m[9], m[10]);
    if (Math.abs(sx - 1.0) > 1e-4 || Math.abs(sy - 1.0) > 1e-4 || Math.abs(sz - 1.0) > 1e-4) {
      unfrozenScales.push({ name, matrixScale: [sx, sy, sz] });
    }
  }

  // Translation & Rotation check
  if (node.translation && (Math.abs(node.translation[0]) > 1e-5 || Math.abs(node.translation[1]) > 1e-5 || Math.abs(node.translation[2]) > 1e-5)) {
    nonZeroTranslations.push({ name, translation: node.translation });
  }
  if (node.rotation && (Math.abs(node.rotation[0]) > 1e-5 || Math.abs(node.rotation[1]) > 1e-5 || Math.abs(node.rotation[2]) > 1e-5 || Math.abs(node.rotation[3] - 1.0) > 1e-5)) {
    nonZeroRotations.push({ name, rotation: node.rotation });
  }
});

if (unfrozenScales.length > 0) {
  failures.push(`Found ${unfrozenScales.length} nodes with unfrozen scale: ${JSON.stringify(unfrozenScales)}`);
} else {
  console.log(`[PASS] All ${nodes.length} nodes have strictly frozen identity scale (1.0, 1.0, 1.0)`);
}

console.log(`  Non-zero translations count: ${nonZeroTranslations.length}`);
console.log(`  Non-zero rotations count: ${nonZeroRotations.length}`);

// 5. Raw Binary Vertex Extraction
console.log('\n--- 2. Raw Binary Vertex Decoding & Grounding Check ---');

const accessors = gltf.accessors || [];
const bufferViews = gltf.bufferViews || [];
const meshes = gltf.meshes || [];

console.log(`Total Meshes: ${meshes.length}, Total Accessors: ${accessors.length}`);

function readAccessorBuffer(accIdx) {
  const acc = accessors[accIdx];
  const bv = bufferViews[acc.bufferView];
  const byteOffset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const count = acc.count;
  const componentType = acc.componentType;
  const type = acc.type;

  if (componentType !== 5126) { // 5126 = FLOAT
    throw new Error(`Unsupported componentType: ${componentType}`);
  }

  let numComponents = 1;
  if (type === 'VEC2') numComponents = 2;
  else if (type === 'VEC3') numComponents = 3;
  else if (type === 'VEC4') numComponents = 4;
  else if (type === 'MAT4') numComponents = 16;

  const byteStride = bv.byteStride || (numComponents * 4);
  const data = [];

  for (let i = 0; i < count; i++) {
    const offset = byteOffset + i * byteStride;
    const vertex = [];
    for (let c = 0; c < numComponents; c++) {
      vertex.push(binBuffer.readFloatLE(offset + c * 4));
    }
    data.push(vertex);
  }
  return data;
}

let globalMin = [Infinity, Infinity, Infinity];
let globalMax = [-Infinity, -Infinity, -Infinity];
let totalVertices = 0;

const meshVertexData = {};

meshes.forEach((mesh, mIdx) => {
  const name = mesh.name || `Mesh_${mIdx}`;
  let mMin = [Infinity, Infinity, Infinity];
  let mMax = [-Infinity, -Infinity, -Infinity];
  let allVerts = [];

  mesh.primitives.forEach((prim) => {
    if (prim.attributes && prim.attributes.POSITION !== undefined) {
      const posAccIdx = prim.attributes.POSITION;
      const verts = readAccessorBuffer(posAccIdx);
      verts.forEach(v => {
        allVerts.push(v);
        totalVertices++;
        for (let c = 0; c < 3; c++) {
          mMin[c] = Math.min(mMin[c], v[c]);
          mMax[c] = Math.max(mMax[c], v[c]);
          globalMin[c] = Math.min(globalMin[c], v[c]);
          globalMax[c] = Math.max(globalMax[c], v[c]);
        }
      });
    }
  });

  meshVertexData[name] = {
    min: mMin,
    max: mMax,
    vertCount: allVerts.length,
    verts: allVerts
  };
});

console.log(`Decoded ${totalVertices.toLocaleString()} raw binary vertices across ${meshes.length} meshes.`);
console.log(`Global Binary BBox (glTF Y-up):`);
console.log(`  X (Lateral):    [${globalMin[0].toFixed(6)}m, ${globalMax[0].toFixed(6)}m] (Span: ${(globalMax[0] - globalMin[0]).toFixed(4)}m)`);
console.log(`  Y (Elevation):  [${globalMin[1].toFixed(6)}m, ${globalMax[1].toFixed(6)}m] (Height: ${(globalMax[1] - globalMin[1]).toFixed(4)}m)`);
console.log(`  Z (Depth):      [${globalMin[2].toFixed(6)}m, ${globalMax[2].toFixed(6)}m] (Span: ${(globalMax[2] - globalMin[2]).toFixed(4)}m)`);

// Check global floor penetration: no vertex < -0.0001m
const FLOOR_TOLERANCE = 0.0001; // 0.1 mm
if (globalMin[1] < -FLOOR_TOLERANCE) {
  failures.push(`Floor penetration detected! Global Y_min = ${globalMin[1].toFixed(8)}m < -${FLOOR_TOLERANCE}m`);
} else {
  console.log(`[PASS] Zero floor penetration: Global Y_min = ${globalMin[1].toFixed(8)}m >= -0.0001m`);
}

// 6. Hoof Ground Contact Verification
console.log('\n--- 3. Four Hooves Independent Grounding Check ---');

const hoofNames = ['Horse_Leg_FL', 'Horse_Leg_FR', 'Horse_Leg_BL', 'Horse_Leg_BR'];
const hoofGroundStats = {};

hoofNames.forEach(hName => {
  const hData = meshVertexData[hName];
  if (!hData) {
    failures.push(`Missing required hoof mesh: ${hName}`);
    return;
  }

  const minY = hData.min[1];
  const maxY = hData.max[1];
  
  // Find all vertices within ground tolerance (|Y| <= FLOOR_TOLERANCE)
  const soleVerts = hData.verts.filter(v => Math.abs(v[1]) <= FLOOR_TOLERANCE);
  // Find any vertices penetrating below ground (Y < -FLOOR_TOLERANCE)
  const penetratingVerts = hData.verts.filter(v => v[1] < -FLOOR_TOLERANCE);

  hoofGroundStats[hName] = {
    minY,
    maxY,
    totalVerts: hData.vertCount,
    soleVertsCount: soleVerts.length,
    penetratingCount: penetratingVerts.length,
    exactZeroVerts: hData.verts.filter(v => Math.abs(v[1]) < 1e-7).length
  };

  console.log(`  ${hName}:`);
  console.log(`    Min Y: ${minY.toFixed(8)}m`);
  console.log(`    Sole vertices (|Y| <= ${FLOOR_TOLERANCE}m): ${soleVerts.length} / ${hData.vertCount}`);
  console.log(`    Exact zero vertices (|Y| < 1e-7m): ${hoofGroundStats[hName].exactZeroVerts}`);
  console.log(`    Penetrating vertices (Y < -${FLOOR_TOLERANCE}m): ${penetratingVerts.length}`);

  // Test 1: No penetration
  if (minY < -FLOOR_TOLERANCE) {
    failures.push(`${hName} penetrates floor: minY = ${minY.toFixed(8)}m < -${FLOOR_TOLERANCE}m`);
  }
  // Test 2: No hovering
  if (minY > FLOOR_TOLERANCE) {
    failures.push(`${hName} hovers above floor: minY = ${minY.toFixed(8)}m > ${FLOOR_TOLERANCE}m`);
  }
  // Test 3: Has solid ground contact vertices
  if (soleVerts.length === 0) {
    failures.push(`${hName} has zero vertices contacting ground plane!`);
  }
});

const allHoovesGrounded = hoofNames.every(h => {
  const stat = hoofGroundStats[h];
  return stat && Math.abs(stat.minY) <= FLOOR_TOLERANCE && stat.soleVertsCount > 0;
});

if (allHoovesGrounded) {
  console.log(`[PASS] ALL 4 hooves independently verified firmly grounded at exact Y = 0.000000m (+/- 0.0001m)`);
} else {
  failures.push(`Not all 4 hooves satisfied grounding criteria!`);
}

// 7. Tile Boundary Check
console.log('\n--- 4. Tile Boundary Bounds Check (|x| <= 0.88 * tile radius) ---');
const TILE_SIZE = 2.0; // from index.html TILE_SIZE = 2.0
const TILE_RADIUS = 1.0; // half-width = 1.0m (inscribed radius)
const MAX_ALLOWED_LATERAL = 0.88 * TILE_RADIUS; // 0.88m

const lateralMin = globalMin[0];
const lateralMax = globalMax[0];
const maxAbsX = Math.max(Math.abs(lateralMin), Math.abs(lateralMax));

console.log(`Tile Size: ${TILE_SIZE}m, Tile Radius: ${TILE_RADIUS}m`);
console.log(`Allowed Lateral Half-Span (|X| <= 0.88 * R): ${MAX_ALLOWED_LATERAL.toFixed(4)}m`);
console.log(`Actual Model Lateral Range: [${lateralMin.toFixed(4)}m, ${lateralMax.toFixed(4)}m]`);
console.log(`Actual Max |X|: ${maxAbsX.toFixed(4)}m`);
console.log(`Total Model Width: ${(lateralMax - lateralMin).toFixed(4)}m`);

if (maxAbsX > MAX_ALLOWED_LATERAL) {
  failures.push(`Model exceeds lateral tile boundary: Max |X| = ${maxAbsX.toFixed(4)}m > ${MAX_ALLOWED_LATERAL.toFixed(4)}m`);
} else {
  console.log(`[PASS] Model fits within lateral tile boundary: ${maxAbsX.toFixed(4)}m <= ${MAX_ALLOWED_LATERAL.toFixed(4)}m`);
}

// Check Horse Body footprint vs Lance
console.log('\n--- 5. Footprint vs Lance Extents ---');
const horseBodyMeshes = Object.keys(meshVertexData).filter(name => !name.startsWith('Lance_'));
let horseMin = [Infinity, Infinity, Infinity];
let horseMax = [-Infinity, -Infinity, -Infinity];

horseBodyMeshes.forEach(name => {
  const d = meshVertexData[name];
  for (let c = 0; c < 3; c++) {
    horseMin[c] = Math.min(horseMin[c], d.min[c]);
    horseMax[c] = Math.max(horseMax[c], d.max[c]);
  }
});

console.log(`Horse + Rider Body BBox (excluding lance):`);
console.log(`  X: [${horseMin[0].toFixed(4)}m, ${horseMax[0].toFixed(4)}m] (Width: ${(horseMax[0] - horseMin[0]).toFixed(4)}m)`);
console.log(`  Y: [${horseMin[1].toFixed(4)}m, ${horseMax[1].toFixed(4)}m] (Height: ${(horseMax[1] - horseMin[1]).toFixed(4)}m)`);
console.log(`  Z: [${horseMin[2].toFixed(4)}m, ${horseMax[2].toFixed(4)}m] (Length: ${(horseMax[2] - horseMin[2]).toFixed(4)}m)`);

const lanceData = meshVertexData['Lance_Shaft'];
if (lanceData) {
  const lanceLength = lanceData.max[2] - lanceData.min[2]; // glTF Z is depth/length
  console.log(`Lance Shaft BBox:`);
  console.log(`  Z: [${lanceData.min[2].toFixed(4)}m, ${lanceData.max[2].toFixed(4)}m] (Length: ${lanceLength.toFixed(4)}m)`);
  console.log(`  Y (Elevation): [${lanceData.min[1].toFixed(4)}m, ${lanceData.max[1].toFixed(4)}m]`);
  if (lanceLength < 3.0) {
    warnings.push(`Lance length is ${lanceLength.toFixed(4)}m (< 3.0m)`);
  }
}

// 8. Final Verdict
console.log('\n' + '='.repeat(80));
console.log('ADVERSARIAL HARNESS SUMMARY');
console.log('='.repeat(80));
console.log(`Failures: ${failures.length}`);
console.log(`Warnings: ${warnings.length}`);

if (warnings.length > 0) {
  warnings.forEach(w => console.log(`  [WARN] ${w}`));
}

if (failures.length > 0) {
  failures.forEach(f => console.log(`  [FAIL] ${f}`));
  console.log('\nVERDICT: REQUEST_CHANGES');
  process.exit(1);
} else {
  console.log('\nVERDICT: APPROVE');
  process.exit(0);
}
