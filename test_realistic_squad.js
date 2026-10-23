const { spawn } = require('child_process');
const fs = require('fs');

async function testRealisticSquad() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9278',
    '--disable-gpu-sandbox',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9278',
    'http://localhost:8080/index.html'
  ]);
  let res, tabs;
  for (let i = 0; i < 20; i++) {
    try {
      res = await fetch('http://127.0.0.1:9278/json');
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
  const send = (m, a = {}) => new Promise(res => { const i = id++; p.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: a })); });
  await new Promise(r => ws.onopen = r);
  await send('Runtime.enable');
  await send('Page.enable');

  // Hard reload
  await send('Page.reload', { ignoreCache: true });

  for (let i = 0; i < 35; i++) {
    await new Promise(r => setTimeout(r, 400));
    const chk = await send('Runtime.evaluate', {
      expression: 'typeof window.activeRigs !== "undefined" && window.activeRigs.length === 32',
      returnByValue: true
    });
    if (chk && chk.result && chk.result.value) break;
  }

  const evalResult = await send('Runtime.evaluate', {
    expression: `
      (async () => {
        const loader = new THREE.GLTFLoader();
        const soldierGltf = await new Promise(r => loader.load('assets/soldier.glb', r));
        const queenGltf = await new Promise(r => loader.load('assets/queen.glb', r));

        // Create a showcase group in the center
        const showcase = new THREE.Group();
        showcase.name = 'SHOWCASE_SQUAD';

        // 1. Realistic Pawn (Soldier with Dhal Shield & Spear)
        const pawnRig = soldierGltf.scene.clone();
        pawnRig.scale.setScalar(0.95);
        pawnRig.position.set(-3.0, 0, 0);
        // Add Dhal Shield
        const dhalGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.04, 24);
        dhalGeo.rotateX(Math.PI / 2);
        const dhalMesh = new THREE.Mesh(dhalGeo, new THREE.MeshStandardMaterial({ color: 0xe5b842, metalness: 0.8, roughness: 0.2 }));
        const dhalGroup = new THREE.Group();
        dhalGroup.position.set(-0.35, 1.0, 0.25);
        dhalGroup.rotation.y = 0.35;
        dhalGroup.add(dhalMesh);
        pawnRig.add(dhalGroup);
        // Spear
        const spearShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.6, 12), new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7 }));
        spearShaft.position.set(0.38, 1.3, 0.15);
        const spearTip = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.32, 8), new THREE.MeshStandardMaterial({ color: 0xe5b842, metalness: 0.9 }));
        spearTip.position.set(0.38, 2.6, 0.15);
        pawnRig.add(spearShaft, spearTip);
        showcase.add(pawnRig);

        // 2. Realistic Queen (from queen.glb) - Natural scale 1.0
        const queenRig = queenGltf.scene.clone();
        queenRig.scale.setScalar(1.0);
        queenRig.position.set(0, 0, 0);
        // Add Mukuta Crown & Khanda swords
        const crown = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.28, 12), new THREE.MeshStandardMaterial({ color: 0xe5b842, metalness: 0.9, roughness: 0.15 }));
        crown.position.set(0, 1.82, 0);
        queenRig.add(crown);
        // Twin Khandas
        [-0.32, 0.32].forEach((kx, idx) => {
          const khanda = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.85, 0.02), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.1 }));
          khanda.position.set(kx, 1.05, 0.35);
          khanda.rotation.set(0.3, idx === 0 ? 0.3 : -0.3, idx === 0 ? -0.4 : 0.4);
          queenRig.add(khanda);
        });
        showcase.add(queenRig);

        // 3. Realistic King (from soldier.glb, emperor stature + crown + chhatra + gada)
        const kingRig = soldierGltf.scene.clone();
        kingRig.scale.setScalar(1.12);
        kingRig.position.set(3.0, 0, 0);
        // Chakravarti Crown
        const kcrown = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.28, 16), new THREE.MeshStandardMaterial({ color: 0xe5b842, metalness: 0.9 }));
        kcrown.position.set(0, 1.95, 0);
        const kruby = new THREE.Mesh(new THREE.OctahedronGeometry(0.045), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
        kruby.position.set(0, 1.98, 0.15);
        kingRig.add(kcrown, kruby);
        // Gada Mace grounded in front
        const gadaShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 12), new THREE.MeshStandardMaterial({ color: 0xe5b842, metalness: 0.85 }));
        gadaShaft.position.set(0.38, 0.7, 0.28);
        const gadaHead = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), new THREE.MeshStandardMaterial({ color: 0xe5b842, metalness: 0.9, roughness: 0.15 }));
        gadaHead.position.set(0.38, 1.35, 0.28);
        kingRig.add(gadaShaft, gadaHead);
        // 3-Tier Royal Chhatra Parasol
        const chhatraGroup = new THREE.Group();
        const chhatraPole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.8, 8), new THREE.MeshStandardMaterial({ color: 0xe5b842, metalness: 0.85 }));
        chhatraPole.position.set(-0.25, 1.4, -0.35);
        [2.35, 2.55, 2.75].forEach((cy, idx) => {
          const tier = new THREE.Mesh(new THREE.ConeGeometry(0.55 - idx * 0.12, 0.15, 16), new THREE.MeshStandardMaterial({ color: 0xe5b842, metalness: 0.9 }));
          tier.position.set(-0.25, cy, -0.35);
          chhatraGroup.add(tier);
        });
        chhatraGroup.add(chhatraPole);
        kingRig.add(chhatraGroup);
        showcase.add(kingRig);

        // Add to active scene via unit parent
        window.activeRigs[0].root.parent.add(showcase);

        // Move camera to look right at this showcase from front-three-quarter view
        camState.distance = camState.targetDistance = 7.5;
        camState.pitch = camState.targetPitch = 0.25;
        camState.yaw = camState.targetYaw = 3.14; // Face the characters from the front (+Z looking towards -Z)
        camState.lookPivot.set(0, 1.1, 0);
        camState.targetLookPivot.set(0, 1.1, 0);

        return { success: true };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('SHOWCASE RESULT:', evalResult.result.value);
  await new Promise(r => setTimeout(r, 1200));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('test_realistic_squad_showcase_v2.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved test_realistic_squad_showcase_v2.png');

  ws.close();
  chrome.kill();
}
testRealisticSquad().catch(console.error);
