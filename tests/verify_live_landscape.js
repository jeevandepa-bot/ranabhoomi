const { CDPClient } = require('./cdp_client');

async function testLiveDeployment() {
  console.log('--- VERIFYING LIVE VERCEL DEPLOYMENT (https://ranabhoomi.vercel.app) ---');
  const cdp = new CDPClient({
    port: 9295,
    url: 'https://ranabhoomi.vercel.app'
  });
  await cdp.launch();
  for (let i = 0; i < 40; i++) {
    try {
      const ok = await cdp.evaluate('Boolean(document.getElementById("turnStatusText") && document.getElementById("mainAppHeader"))');
      if (ok) break;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 500));
  }

  // 1. Desktop Check
  const desktopData = await cdp.evaluate(`(() => {
    return {
      turnText: document.getElementById('turnStatusText').textContent.trim(),
      headerBrand: document.getElementById('headerBrandTitle').textContent.trim()
    };
  })()`);
  console.log('Live Desktop Data:', desktopData);

  // 2. Mobile Landscape Check (844x390)
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 844,
    height: 390,
    deviceScaleFactor: 2,
    mobile: true
  });
  await new Promise(r => setTimeout(r, 600));

  const landscapeData = await cdp.evaluate(`(() => {
    const toObj = r => r ? { top: r.top, bottom: r.bottom, height: r.height, left: r.left, right: r.right, width: r.width } : null;
    const headerRect = toObj(document.getElementById('mainAppHeader').getBoundingClientRect());
    const turnRect = toObj(document.getElementById('turnStatusPanel').getBoundingClientRect());
    const matchRect = toObj(document.getElementById('matchControlsPanel').getBoundingClientRect());
    const turnText = document.getElementById('turnStatusText').textContent.trim();

    const headerOverlapsTurn = turnRect.top < headerRect.bottom;
    const turnOverlapsMatch = !(turnRect.right <= matchRect.left || turnRect.left >= matchRect.right || turnRect.bottom <= matchRect.top || turnRect.top >= matchRect.bottom);

    return {
      headerRect,
      turnRect,
      matchRect,
      turnText,
      headerOverlapsTurn,
      turnOverlapsMatch
    };
  })()`);

  console.log('Live Mobile Landscape Data:', landscapeData);

  if (landscapeData.turnText === "WHITE TO MOVE" && !landscapeData.headerOverlapsTurn && !landscapeData.turnOverlapsMatch) {
    console.log('[PASS] Live Vercel Deployment verified: simplified turn text and 0px UI overlap on mobile landscape!');
  } else {
    console.error('[FAIL] Live Vercel layout mismatch:', landscapeData);
    process.exit(1);
  }

  await cdp.close();
  console.log('--- LIVE VERIFICATION SUCCESSFUL ---');
}

testLiveDeployment().catch(err => {
  console.error('Live deployment verification failed:', err);
  process.exit(1);
});
