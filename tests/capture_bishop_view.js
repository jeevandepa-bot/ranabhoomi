const { CDPClient } = require('./cdp_client');
const fs = require('fs');

async function main() {
  const cdp = new CDPClient({ port: 9286 });
  try {
    await cdp.launch();
    await cdp.waitForEngineReady(20000);

    // Skip cinematic if playing, then aim camera at White Bishop at c1 (x=-2, z=7)
    await cdp.evaluate(`(() => {
      if (window.skipCinematic) window.skipCinematic();
      if (window.controls && window.camera) {
        window.camera.position.set(-2.0, 2.8, 10.2);
        window.controls.target.set(-2.0, 1.1, 7.0);
        window.controls.update();
      }
    })()`);

    await new Promise(r => setTimeout(r, 1500));

    const shotWhiteRes = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const outWhite = 'C:/Users/Jeevan/.gemini/antigravity/brain/9f6b62c5-1dfe-4bdd-81f7-211bfc1427e1/bishop_white_verified.png';
    fs.writeFileSync(outWhite, Buffer.from(shotWhiteRes.data, 'base64'));
    console.log('Saved White Bishop screenshot:', outWhite);

    // Aim camera at Black Bishop at c8 (x=-2, z=-7)
    await cdp.evaluate(`(() => {
      if (window.controls && window.camera) {
        window.camera.position.set(-2.0, 2.8, -10.2);
        window.controls.target.set(-2.0, 1.1, -7.0);
        window.controls.update();
      }
    })()`);

    await new Promise(r => setTimeout(r, 1500));

    const shotBlackRes = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const outBlack = 'C:/Users/Jeevan/.gemini/antigravity/brain/9f6b62c5-1dfe-4bdd-81f7-211bfc1427e1/bishop_black_verified.png';
    fs.writeFileSync(outBlack, Buffer.from(shotBlackRes.data, 'base64'));
    console.log('Saved Black Bishop screenshot:', outBlack);

  } finally {
    await cdp.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
