const { spawn } = require('child_process');
const fs = require('fs');

async function auditMobileViews() {
  console.log('=== STARTING MOBILE VIEW & LANDSCAPE ADVISORY AUDIT ===');
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9298',
    '--disable-gpu-sandbox',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_mobile',
    'http://localhost:8080/index.html'
  ]);

  let res, tabs;
  for (let i = 0; i < 20; i++) {
    try {
      res = await fetch('http://127.0.0.1:9298/json');
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
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  await new Promise(r => setTimeout(r, 3500));
  await send('Runtime.evaluate', { expression: 'if (typeof skipIntroCinematic === "function") skipIntroCinematic();' });
  await new Promise(r => setTimeout(r, 1000));

  const viewports = [
    { name: 'iPhone 14 Portrait (390x844)', w: 390, h: 844, isPortrait: true },
    { name: 'iPhone 14 Landscape (844x390)', w: 844, h: 390, isPortrait: false },
    { name: 'Android Galaxy Portrait (360x780)', w: 360, h: 780, isPortrait: true },
    { name: 'Android Galaxy Landscape (780x360)', w: 780, h: 360, isPortrait: false },
    { name: 'Pixel 7 Landscape (915x412)', w: 915, h: 412, isPortrait: false }
  ];

  const results = [];

  for (const vp of viewports) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: vp.w,
      height: vp.h,
      deviceScaleFactor: 2,
      mobile: true,
      screenOrientation: {
        type: vp.isPortrait ? 'portraitPrimary' : 'landscapePrimary',
        angle: vp.isPortrait ? 0 : 90
      }
    });
    await new Promise(r => setTimeout(r, 600));

    const check = await send('Runtime.evaluate', {
      expression: `(() => {
        const docW = document.documentElement.clientWidth;
        const scrollW = document.documentElement.scrollWidth;
        const bodyScrollW = document.body.scrollWidth;
        const hasOverflow = scrollW > docW + 1 || bodyScrollW > docW + 1;

        const overlay = document.getElementById('landscapeAdvisoryOverlay');
        const overlayVisible = overlay && window.getComputedStyle(overlay).display !== 'none';

        // Check camera button touch targets
        const orbitBtn = document.getElementById('orbitLeftBtn');
        const btnRect = orbitBtn ? orbitBtn.getBoundingClientRect() : { width: 0, height: 0 };
        const touchTargetSufficient = btnRect.width >= 44 && btnRect.height >= 44;

        return {
          viewport: '${vp.name}',
          docW,
          scrollW,
          hasOverflow,
          overlayVisible,
          btnWidth: Math.round(btnRect.width),
          btnHeight: Math.round(btnRect.height),
          touchTargetSufficient
        };
      })()`,
      returnByValue: true
    });

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const filename = `audit_mobile_${vp.isPortrait ? 'portrait' : 'landscape'}_${vp.w}x${vp.h}.png`;
    fs.writeFileSync(filename, Buffer.from(shot.data, 'base64'));

    results.push({ ...check.result.value, screenshot: filename });
  }

  console.log('Mobile View Audit Results:\n', JSON.stringify(results, null, 2));
  fs.writeFileSync('mobile_view_audit_report.json', JSON.stringify(results, null, 2));

  await send('Browser.close');
  process.exit(0);
}

auditMobileViews();
