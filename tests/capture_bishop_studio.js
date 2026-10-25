const { CDPClient } = require('./cdp_client');
const fs = require('fs');

async function main() {
  const cdp = new CDPClient({ port: 9288 });
  try {
    await cdp.launch();
    await cdp.waitForEngineReady(20000);

    // Switch to Sculpt Studio and select Bishop (piece 3)
    await cdp.evaluate(`(() => {
      if (window.skipCinematic) window.skipCinematic();
      const studioTab = document.getElementById('tabStudioBtn');
      if (studioTab) studioTab.click();
      setTimeout(() => {
        const bishopBtn = document.querySelector('button[data-piece="3"]');
        if (bishopBtn) bishopBtn.click();
      }, 300);
    })()`);

    await new Promise(r => setTimeout(r, 2000));

    const shotStudio = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const outStudio = 'C:/Users/Jeevan/.gemini/antigravity/brain/9f6b62c5-1dfe-4bdd-81f7-211bfc1427e1/bishop_studio_closeup.png';
    fs.writeFileSync(outStudio, Buffer.from(shotStudio.data, 'base64'));
    console.log('Saved Bishop Studio Closeup:', outStudio);

  } finally {
    await cdp.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
