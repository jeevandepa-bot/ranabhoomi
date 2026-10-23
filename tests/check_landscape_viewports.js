const { CDPClient } = require('./cdp_client');

const viewports = [
  { name: 'iPhone SE (landscape)', width: 667, height: 375 },
  { name: 'iPhone 13/14 (landscape)', width: 844, height: 390 },
  { name: 'iPhone Pro Max (landscape)', width: 932, height: 430 },
  { name: 'Android Small (landscape)', width: 640, height: 360 },
  { name: 'Android Mid (landscape)', width: 800, height: 360 },
  { name: 'Android Pixel (landscape)', width: 915, height: 412 }
];

async function checkViewports() {
  const cdp = new CDPClient({ port: 9288 });
  await cdp.launch();
  await cdp.waitForEngineReady(15000);

  for (const vp of viewports) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 2,
      mobile: true
    });
    await new Promise(r => setTimeout(r, 400));

    const check = await cdp.evaluate(`(() => {
      const getRect = id => {
        const el = document.getElementById(id);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { id, top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
      };
      const header = getRect('mainAppHeader');
      const turn = getRect('turnStatusPanel');
      const match = getRect('matchControlsPanel');
      const telem = getRect('unitTelemetryCard');
      const kinetic = getRect('kineticBanner');
      const turnText = document.getElementById('turnStatusText') ? document.getElementById('turnStatusText').textContent.trim() : '';

      // Check vertical overlaps
      const headerOverlapsTurn = header && turn && (turn.top < header.bottom);
      const headerOverlapsMatch = header && match && (match.top < header.bottom);

      // Check horizontal overlaps between turn and match controls
      const turnOverlapsMatch = turn && match && !(
        turn.right <= match.left ||
        turn.left >= match.right ||
        turn.bottom <= match.top ||
        turn.top >= match.bottom
      );

      // Test with BLACK (AI) THINKING and check badge
      document.getElementById('turnStatusText').textContent = 'BLACK (AI) THINKING...';
      const checkBadge = document.getElementById('checkAlertBadge');
      if (checkBadge) checkBadge.classList.remove('hidden');
      const turnExpanded = getRect('turnStatusPanel');
      const matchExpanded = getRect('matchControlsPanel');
      const expandedOverlap = turnExpanded && matchExpanded && !(
        turnExpanded.right <= matchExpanded.left ||
        turnExpanded.left >= matchExpanded.right ||
        turnExpanded.bottom <= matchExpanded.top ||
        turnExpanded.top >= matchExpanded.bottom
      );
      if (checkBadge) checkBadge.classList.add('hidden');
      document.getElementById('turnStatusText').textContent = 'WHITE TO MOVE';

      const maxTopY = Math.max(turn ? turn.bottom : 0, match ? match.bottom : 0);
      const remainingHeight = window.innerHeight - maxTopY;

      return {
        header,
        turn,
        match,
        turnText,
        headerOverlapsTurn,
        headerOverlapsMatch,
        turnOverlapsMatch,
        maxTopY,
        remainingHeight,
        expandedOverlap,
        windowHeight: window.innerHeight,
        windowWidth: window.innerWidth
      };
    })()`);

    console.log(`=== Viewport: ${vp.name} (${vp.width}x${vp.height}) ===`);
    console.log(`Turn text: "${check.turnText}"`);
    console.log(`Header overlaps turn: ${check.headerOverlapsTurn}`);
    console.log(`Header overlaps match controls: ${check.headerOverlapsMatch}`);
    console.log(`Turn overlaps match controls: ${check.turnOverlapsMatch}`);
    console.log(`EXPANDED OVERLAP (during Black Thinking or Check): ${check.expandedOverlap}`);
    console.log(`Top UI Height consumed: ${check.maxTopY}px / ${vp.height}px (Remaining for 3D board: ${check.remainingHeight}px)`);
    console.log(`Turn rect:`, check.turn);
    console.log(`Match rect:`, check.match);
  }

  await cdp.close();
}

checkViewports().catch(console.error);
