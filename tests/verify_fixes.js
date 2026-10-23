const { CDPClient } = require('./cdp_client');

async function verifyFixes() {
  console.log('--- RUNNING TARGETED VERIFICATION FOR RECENT FIXES ---');
  const cdp = new CDPClient({ port: 9299 });
  await cdp.launch();
  await cdp.waitForEngineReady(20000);

  // 1. Mobile Landscape UI & Turn Indicator Check
  console.log('Testing Mobile Landscape Layout (844x390)...');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 844,
    height: 390,
    deviceScaleFactor: 1,
    mobile: true
  });
  await new Promise(r => setTimeout(r, 500));

  const uiData = await cdp.evaluate(`(() => {
    const toObj = r => r ? { top: r.top, bottom: r.bottom, height: r.height, left: r.left, right: r.right, width: r.width } : null;
    const header = document.getElementById('mainAppHeader');
    const headerRect = toObj(header ? header.getBoundingClientRect() : null);
    const brandRect = toObj(document.getElementById('headerBrandPanel') ? document.getElementById('headerBrandPanel').getBoundingClientRect() : null);
    const tabsRect = toObj(document.getElementById('headerTabsPanel') ? document.getElementById('headerTabsPanel').getBoundingClientRect() : null);
    const utilRect = toObj(document.getElementById('headerUtilityPanel') ? document.getElementById('headerUtilityPanel').getBoundingClientRect() : null);
    const turnPanel = document.getElementById('turnStatusPanel');
    const turnRect = toObj(turnPanel ? turnPanel.getBoundingClientRect() : null);
    const turnText = document.getElementById('turnStatusText').textContent.trim();
    const matchPanel = document.getElementById('matchControlsPanel');
    const matchRect = toObj(matchPanel ? matchPanel.getBoundingClientRect() : null);
    const orbitBtns = Array.from(document.querySelectorAll('.mobile-touch-btn')).map(b => toObj(b.getBoundingClientRect()));
    const telemCard = document.getElementById('unitTelemetryCard');
    const telemRect = toObj(telemCard ? telemCard.getBoundingClientRect() : null);

    // Check overlap between header and turnPanel
    const headerOverlapsTurn = turnRect && headerRect && (turnRect.top < headerRect.bottom);
    // Check overlap between turnPanel and matchPanel
    const turnOverlapsMatch = turnRect && matchRect && !(
      turnRect.right <= matchRect.left ||
      turnRect.left >= matchRect.right ||
      turnRect.bottom <= matchRect.top ||
      turnRect.top >= matchRect.bottom
    );

    return {
      headerRect,
      brandRect,
      tabsRect,
      utilRect,
      turnRect,
      matchRect,
      turnText,
      headerOverlapsTurn,
      turnOverlapsMatch,
      orbitBtnHeight: orbitBtns[0] ? orbitBtns[0].height : 0
    };
  })()`);

  console.log('UI Verification Result:', JSON.stringify(uiData, null, 2));
  if (uiData.turnText === "WHITE TO MOVE" && !uiData.headerOverlapsTurn) {
    console.log('[PASS] Mobile Landscape UI: Clean non-overlapping single-row header with simplified turn text "WHITE TO MOVE"');
  } else {
    console.error('[FAIL] Mobile Landscape UI issue:', uiData);
    process.exit(1);
  }

  // 2. Elephant 4-Legs and Trunk Verification
  console.log('Testing Elephant 4-Legs & Trunk Rigging...');
  const elephantRigData = await cdp.evaluate(`(() => {
    const rookRig = (window.activeRigs || []).find(r => r.type === 4);
    if (!rookRig) return { error: 'No rook found' };
    return {
      quadLegsCount: (rookRig.quadLegs || []).length,
      trunkSegsCount: (rookRig.trunkSegs || []).length
    };
  })()`);
  console.log('Elephant Rig Data:', elephantRigData);
  if (elephantRigData.quadLegsCount === 4 && elephantRigData.trunkSegsCount === 4) {
    console.log('[PASS] Elephant Rig: Exactly 4 articulated legs and 4 trunk segments verified!');
  } else {
    console.error('[FAIL] Elephant rig missing legs or trunk:', elephantRigData);
    process.exit(1);
  }

  // 3. Knight Fast Strike Verification (No initial lag)
  console.log('Testing Knight Strike Fast Launch...');
  const knightKillTime = await cdp.evaluate(`(async () => {
    const atkKnight = window.buildSculptedUnit(2, 0); // White Knight
    const defPawn = window.buildSculptedUnit(1, 1);   // Black Pawn
    const startWp = window.coordToWorld(1, 0);
    const targetWp = window.coordToWorld(2, 2);
    atkKnight.root.position.copy(startWp);
    defPawn.root.position.copy(targetWp);
    window.battlefieldGroup.add(atkKnight.root, defPawn.root);

    const startTime = performance.now();
    let arrowShotTime = null;

    const killPromise = window.executeSynchronizedKillSequence(atkKnight, defPawn, targetWp, false);
    
    // Check when arrowShot flag flips
    const checkInterval = setInterval(() => {
      if (atkKnight.arrowShot && arrowShotTime === null) {
        arrowShotTime = performance.now() - startTime;
      }
    }, 16);

    await killPromise;
    clearInterval(checkInterval);
    window.battlefieldGroup.remove(atkKnight.root, defPawn.root);

    return {
      arrowShotMs: arrowShotTime,
      totalKillMs: performance.now() - startTime
    };
  })()`, true);

  console.log('Knight Timing Data:', knightKillTime);
  if (knightKillTime.arrowShotMs && knightKillTime.arrowShotMs < 600) {
    console.log(`[PASS] Knight Kill: Arrow shot released in ${knightKillTime.arrowShotMs.toFixed(0)}ms (initial lag eliminated)!`);
  } else {
    console.error('[FAIL] Knight initial attack lag too high:', knightKillTime);
    process.exit(1);
  }

  // Close CDP
  await cdp.close();
  console.log('--- ALL TARGETED VERIFICATIONS PASSED ---');
}

verifyFixes().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
