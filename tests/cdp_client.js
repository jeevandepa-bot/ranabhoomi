/**
 * tests/cdp_client.js
 * 
 * Reusable Chrome DevTools Protocol (CDP) WebSocket client harness for
 * Royal Ranbhoomi E2E automated test suites.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class CDPClient {
  constructor(options = {}) {
    this.port = options.port || (9280 + Math.floor(Math.random() * 50));
    this.chromePath = options.chromePath || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    this.url = options.url || 'http://localhost:8080/index.html';
    this.tempProfileDir = path.join(os.tmpdir(), `ranbhoomi_cdp_${Date.now()}_${this.port}`);
    this.chromeProcess = null;
    this.ws = null;
    this.msgId = 1;
    this.pendingRequests = new Map();
    this.consoleLogs = [];
    this.browserExceptions = [];
  }

  async launch() {
    // Ensure clean temporary user data directory
    try {
      fs.mkdirSync(this.tempProfileDir, { recursive: true });
    } catch (e) {}

    const args = [
      '--headless=new',
      `--remote-debugging-port=${this.port}`,
      '--disable-gpu-sandbox',
      '--use-gl=angle',
      '--use-angle=d3d11',
      '--disable-frame-rate-limit',
      '--disable-gpu-vsync',
      '--window-size=1920,1080',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-cache',
      `--user-data-dir=${this.tempProfileDir}`,
      this.url
    ];

    this.chromeProcess = spawn(this.chromePath, args);

    // Wait for Chrome remote debugging endpoint
    let tabs = null;
    for (let attempt = 0; attempt < 25; attempt++) {
      await new Promise(r => setTimeout(r, 400));
      try {
        const res = await fetch(`http://127.0.0.1:${this.port}/json`);
        tabs = await res.json();
        if (tabs && tabs.length > 0) break;
      } catch (err) {
        // Retry
      }
    }

    if (!tabs || tabs.length === 0) {
      throw new Error(`Failed to connect to Chrome debugging port ${this.port} after 10s.`);
    }

    let targetTab = tabs.find(t => t.type === 'page' && !t.url.startsWith('chrome-extension://'));
    if (!targetTab) targetTab = tabs[0];
    if (!targetTab || !targetTab.webSocketDebuggerUrl) {
      throw new Error(`No valid page target found on port ${this.port}`);
    }

    this.ws = new WebSocket(targetTab.webSocketDebuggerUrl);

    this.ws.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (e) {
        return;
      }

      if (data.id && this.pendingRequests.has(data.id)) {
        const { resolve } = this.pendingRequests.get(data.id);
        this.pendingRequests.delete(data.id);
        resolve(data.result);
      } else if (data.method === 'Runtime.consoleAPICalled') {
        const text = (data.params.args || []).map(a => a.value || a.description || JSON.stringify(a)).join(' ');
        this.consoleLogs.push({ type: data.params.type, text, timestamp: Date.now() });
        if (data.params.type === 'error') {
          this.browserExceptions.push({ type: 'console.error', text });
        }
      } else if (data.method === 'Runtime.exceptionThrown') {
        const details = data.params.exceptionDetails;
        const text = details.exception?.description || details.text || 'Uncaught exception';
        this.browserExceptions.push({ type: 'uncaughtException', details, text });
      }
    };

    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    await this.send('Runtime.enable');
    await this.send('Page.enable');
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('WebSocket is not open'));
      }
      const id = this.msgId++;
      this.pendingRequests.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression, awaitPromise = false) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true
    });
    if (res?.exceptionDetails) {
      const err = new Error(res.exceptionDetails.text || 'Evaluation exception');
      err.details = res.exceptionDetails;
      throw err;
    }
    return res?.result?.value;
  }

  async evaluateAsync(expression) {
    return this.evaluate(expression, true);
  }

  async waitForEngineReady(timeoutMs = 20000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      try {
        const ready = await this.evaluate(`
          (typeof ModelManager !== 'undefined' && ModelManager.isLoaded &&
           typeof activeRigs !== 'undefined' && activeRigs.length === 32)
        `);
        if (ready) return true;
      } catch (e) {}
      await new Promise(r => setTimeout(r, 400));
    }
    throw new Error(`Engine failed to reach ready state (ModelManager.isLoaded && activeRigs.length === 32) within ${timeoutMs}ms`);
  }

  async captureScreenshot(outputPath) {
    const snap = await this.send('Page.captureScreenshot', { format: 'png' });
    if (snap?.data && outputPath) {
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(outputPath, Buffer.from(snap.data, 'base64'));
    }
    return snap?.data;
  }

  getErrors() {
    return this.browserExceptions;
  }

  clearErrors() {
    this.browserExceptions = [];
    this.consoleLogs = [];
  }

  async close() {
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }
    if (this.chromeProcess) {
      try {
        this.chromeProcess.kill('SIGINT');
        this.chromeProcess.kill('SIGTERM');
      } catch (e) {}
      this.chromeProcess = null;
    }
    // Clean up temporary user data directory after short pause
    setTimeout(() => {
      try {
        if (fs.existsSync(this.tempProfileDir)) {
          fs.rmSync(this.tempProfileDir, { recursive: true, force: true });
        }
      } catch (e) {}
    }, 1000);
  }
}

module.exports = { CDPClient };
