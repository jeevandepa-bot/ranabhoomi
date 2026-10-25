const { CDPClient } = require('./cdp_client');

async function diagnose() {
  const cdp = new CDPClient({ port: 9296 });
  await cdp.launch();
  await cdp.waitForEngineReady(15000);

  const diag = await cdp.evaluate(`(async () => {
    const results = {
      test2_dipping: [],
      combat_stages: []
    };

    // Diagnose Test 2 (4-beat pacing walk)
    {
      const rig = window.buildSculptedUnit(4, 0); // Rook, White
      window.battlefieldGroup.add(rig.root);
      rig.root.position.set(0, 0, 0);

      const totalSteps = 120;
      for (let i = 0; i <= totalSteps; i++) {
        const phi = (i / totalSteps) * (Math.PI * 4);
        const w = 1.0;

        const s = Math.sin(phi);
        const legAmp = 0.44 * w;
        if (rig.quadLegs && rig.quadLegs.length === 4) {
          rig.quadLegs[0].rotation.x = Math.sin(phi + Math.PI * 0.5) * legAmp; // FL
          rig.quadLegs[1].rotation.x = Math.sin(phi + Math.PI * 1.5) * legAmp; // FR
          rig.quadLegs[2].rotation.x = Math.sin(phi) * legAmp;                 // BL
          rig.quadLegs[3].rotation.x = Math.sin(phi + Math.PI) * legAmp;       // BR
        }

        const pitch = Math.cos(phi) * 0.028 * w;
        const roll  = Math.sin(phi * 0.5) * 0.045 * w;
        rig.torso.rotation.x = pitch;
        rig.torso.rotation.z = roll;
        rig.torso.rotation.y = Math.cos(phi * 0.5) * 0.024 * w;

        // Formula from line 3284 of index.html:
        const zFront = 0.48;
        const zRear  = 0.52;
        const xHalf  = 0.44;
        const pitchDropFront = Math.max(0,  zFront * Math.sin(pitch));
        const pitchDropRear  = Math.max(0, -zRear  * Math.sin(pitch));
        const pitchComp      = Math.max(pitchDropFront, pitchDropRear);
        const rollComp       = xHalf * Math.abs(Math.sin(roll));
        const stompBounce    = Math.abs(s) * 0.052;
        const legSwingComp   = Math.max(0, Math.sin(legAmp) * 0.058);
        const groundComp     = (pitchComp + rollComp + stompBounce + legSwingComp) * w;

        rig.torso.position.y = 0;
        rig.bodyRoot.position.y = groundComp;

        rig.root.updateMatrixWorld(true);

        rig.quadLegs.forEach((leg, lIdx) => {
          const lb = new THREE.Box3().setFromObject(leg);
          if (lb.min.y < -0.001) {
            results.test2_dipping.push({
              step: i,
              phi: +phi.toFixed(3),
              leg: leg.name,
              legIdx: lIdx,
              minY: +lb.min.y.toFixed(6),
              groundComp: +groundComp.toFixed(6),
              pitch: +pitch.toFixed(6),
              roll: +roll.toFixed(6),
              legRotX: +leg.rotation.x.toFixed(6)
            });
          }
        });
      }
      window.battlefieldGroup.remove(rig.root);
    }

    // Diagnose Combat Stages
    {
      const atk = window.buildSculptedUnit(4, 0); // White Rook
      const def = window.buildSculptedUnit(1, 1); // Black Pawn
      const startWp = window.coordToWorld(3, 1);
      const targetWp = window.coordToWorld(3, 3);
      atk.root.position.copy(startWp);
      def.root.position.copy(targetWp);
      window.battlefieldGroup.add(atk.root, def.root);

      let active = true;
      let sampleCount = 0;
      const poll = setInterval(() => {
        if (!active) return;
        sampleCount++;
        atk.root.updateMatrixWorld(true);

        atk.quadLegs.forEach((leg, lIdx) => {
          const lb = new THREE.Box3().setFromObject(leg);
          if (lb.min.y < -0.005) {
            results.combat_stages.push({
              sample: sampleCount,
              leg: leg.name,
              minY: +lb.min.y.toFixed(6),
              bodyRootY: +atk.bodyRoot.position.y.toFixed(4),
              bodyRootRotX: +atk.bodyRoot.rotation.x.toFixed(4),
              torsoRotX: +atk.torso.rotation.x.toFixed(4),
              legRotX: +leg.rotation.x.toFixed(4)
            });
          }
        });
      }, 20);

      await window.executeSynchronizedKillSequence(atk, def, targetWp, false);
      active = false;
      clearInterval(poll);
      window.battlefieldGroup.remove(atk.root, def.root);
    }

    return results;
  })()`, true);

  console.log('DIAGNOSIS REPORT:');
  console.log(`Test 2 Dipping Occurrences: ${diag.test2_dipping.length}`);
  if (diag.test2_dipping.length > 0) {
    console.log('Sample Test 2 Dipping:', diag.test2_dipping.slice(0, 5));
  }

  console.log(`Combat Dipping Occurrences: ${diag.combat_stages.length}`);
  if (diag.combat_stages.length > 0) {
    console.log('Sample Combat Dipping:', diag.combat_stages.slice(0, 8));
  }

  await cdp.close();
}

diagnose().catch(err => {
  console.error('Diagnosis error:', err);
  process.exit(1);
});
