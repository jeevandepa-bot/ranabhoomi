/**
 * tests/run_e2e_tests.js
 * 
 * Main Unified E2E Test Runner for Royal Ranbhoomi.
 * Runs Tiers 1 through 4:
 *   - Tier 1: Feature Coverage (25 tests across R1-R5)
 *   - Tier 2: Boundary & Corner Cases (25 tests)
 *   - Tier 3: Cross-Feature Combinations (5 tests)
 *   - Tier 4: Real-World Tournament Scenarios & 60 FPS Telemetry (5 tests)
 * Total: 60 Tests
 * 
 * Usage:
 *   node tests/run_e2e_tests.js            # Run all tiers
 *   node tests/run_e2e_tests.js --tier=1   # Run only Tier 1
 *   node tests/run_e2e_tests.js --tier=2   # Run only Tier 2
 *   node tests/run_e2e_tests.js --tier=3   # Run only Tier 3
 *   node tests/run_e2e_tests.js --tier=4   # Run only Tier 4
 */

const { CDPClient } = require('./cdp_client');
const { runTier1Tests } = require('./test_tier1_features');
const { runTier2Tests } = require('./test_tier2_boundaries');
const { runTier3Tests } = require('./test_tier3_combinations');
const { runTier4Tests } = require('./test_tier4_workloads');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    tier: null,
    port: 9285,
    fast: false
  };

  for (const arg of args) {
    if (arg.startsWith('--tier=')) {
      options.tier = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--port=')) {
      options.port = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--fast') {
      options.fast = true;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();
  const startTime = Date.now();

  console.log('╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║               ROYAL RANBHOOMI E2E AUTOMATED TEST SUITE                 ║');
  console.log('║        Opaque-Box Requirement-Driven Verification (Tiers 1 - 4)        ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝');
  console.log(`Execution Mode: ${options.tier ? `Tier ${options.tier} Only` : 'All Tiers (1–4)'}`);
  console.log(`Port: ${options.port} | Timestamp: ${new Date().toISOString()}\n`);

  const cdp = new CDPClient({ port: options.port });
  const summaries = [];

  try {
    console.log('-> Launching isolated headless Chrome instance...');
    await cdp.launch();
    console.log('-> Connecting to game runtime at http://localhost:8080/index.html...');
    await cdp.waitForEngineReady(20000);
    console.log('-> Game engine ready with 32 active rigs. Starting test suites.\n');

    // Tier 1: Feature Coverage (25 tests)
    if (!options.tier || options.tier === 1) {
      const t1Start = Date.now();
      const t1 = await runTier1Tests(cdp, options);
      t1.durationSec = +((Date.now() - t1Start) / 1000).toFixed(1);
      summaries.push(t1);
    }

    // Tier 2: Boundary & Corner Cases (25 tests)
    if (!options.tier || options.tier === 2) {
      const t2Start = Date.now();
      const t2 = await runTier2Tests(cdp, options);
      t2.durationSec = +((Date.now() - t2Start) / 1000).toFixed(1);
      summaries.push(t2);
    }

    // Tier 3: Cross-Feature Combinations (5 tests)
    if (!options.tier || options.tier === 3) {
      const t3Start = Date.now();
      const t3 = await runTier3Tests(cdp, options);
      t3.durationSec = +((Date.now() - t3Start) / 1000).toFixed(1);
      summaries.push(t3);
    }

    // Tier 4: Real-World Scenarios (5 tests)
    if (!options.tier || options.tier === 4) {
      // Ensure clean runtime state and board reset between Tier 3 combinations and Tier 4 tournament workloads
      await cdp.evaluate(`(() => {
        if (typeof window.startNewBattle === 'function') {
          window.startNewBattle();
        } else if (typeof startNewBattle === 'function') {
          startNewBattle();
        }
      })()`);
      await new Promise(r => setTimeout(r, 250));

      const t4Start = Date.now();
      const t4 = await runTier4Tests(cdp, options);
      t4.durationSec = +((Date.now() - t4Start) / 1000).toFixed(1);
      summaries.push(t4);
    }

    const totalDurationSec = +((Date.now() - startTime) / 1000).toFixed(1);
    const errors = cdp.getErrors();

    // Summary Report Table
    console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
    console.log('║                     FINAL E2E EXECUTION SUMMARY                        ║');
    console.log('╠════════════════════════════════════════════════════════════════════════╣');
    console.log('║ Tier | Suite Name                | Tests | Passed | Failed | Time (s) ║');
    console.log('╠══════╪═══════════════════════════╪═══════╪════════╪════════╪══════════╣');

    let totalTests = 0;
    let totalPassed = 0;
    let totalFailed = 0;

    for (const s of summaries) {
      totalTests += s.total;
      totalPassed += s.passed;
      const failed = s.total - s.passed;
      totalFailed += failed;
      const tierStr = `Tier ${s.tier}`.padEnd(5);
      const nameStr = s.name.padEnd(25);
      const totalStr = String(s.total).padStart(5);
      const passedStr = String(s.passed).padStart(6);
      const failedStr = String(failed).padStart(6);
      const timeStr = String(s.durationSec).padStart(8);
      console.log(`║ ${tierStr} | ${nameStr} | ${totalStr} | ${passedStr} | ${failedStr} | ${timeStr} ║`);
    }

    console.log('╠══════╧═══════════════════════════╧═══════╧════════╧════════╧══════════╣');
    const overallRate = totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(1) : 0;
    console.log(`║ OVERALL: ${totalPassed}/${totalTests} Tests Passed (${overallRate}%) | Duration: ${totalDurationSec}s | Errors: ${errors.length} ║`);
    console.log('╚════════════════════════════════════════════════════════════════════════╝');

    if (errors.length > 0) {
      console.log('\n[WARNING] Captured Browser Console Errors:');
      errors.forEach((e, idx) => console.log(`  ${idx + 1}. [${e.type}] ${e.text}`));
    }

    if (totalFailed === 0 && errors.length === 0) {
      console.log('\n>>> SUCCESS: ALL E2E TEST SUITES PASSED WITH ZERO CONSOLE ERRORS! <<<\n');
      process.exit(0);
    } else {
      console.error(`\n>>> FAILURE: ${totalFailed} test(s) failed or ${errors.length} error(s) detected. <<<\n`);
      process.exit(1);
    }
  } finally {
    await cdp.close();
  }
}

main().catch(err => {
  console.error('\nUnified Runner Fatal Exception:', err);
  process.exit(1);
});
