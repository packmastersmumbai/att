#!/usr/bin/env node
'use strict';
/**
 * e2e-all.js — QR Attendance E2E master runner
 * Inspired by the DWM e2e-all harness pattern.
 *
 * Usage:
 *   node e2e-all.js              # run all 7 suites
 *   node e2e-all.js 1 3 6        # run specific suites by number
 *
 * Exit code: 0 = all pass, 1 = any failure
 */

const SUITES = [
  { n: 1, label: 'Render smoke',   mod: './e2e-sweep-1-render'    },
  { n: 2, label: 'Kiosk deep',     mod: './e2e-sweep-2-kiosk'     },
  { n: 3, label: 'Admin',          mod: './e2e-sweep-3-admin'      },
  { n: 4, label: 'Visitors',       mod: './e2e-sweep-4-visitors'   },
  { n: 5, label: 'Reports',        mod: './e2e-sweep-5-reports'    },
  { n: 6, label: 'Dashboard',      mod: './e2e-sweep-6-dashboard'  },
  { n: 7, label: 'Login',          mod: './e2e-sweep-7-login'      },
];

async function main() {
  // Parse CLI args: optional suite numbers
  const args = process.argv.slice(2).map(Number).filter(n => !isNaN(n) && n > 0);
  const selected = args.length > 0
    ? SUITES.filter(s => args.includes(s.n))
    : SUITES;

  if (selected.length === 0) {
    console.error('No matching suites for args:', process.argv.slice(2));
    process.exit(1);
  }

  console.log('\n' + '═'.repeat(62));
  console.log('  QR ATTENDANCE — E2E TEST HARNESS');
  console.log('  Running suites: ' + selected.map(s => s.n).join(', '));
  console.log('═'.repeat(62));

  const allResults = [];
  const startTime  = Date.now();

  for (const suite of selected) {
    const t0 = Date.now();
    console.log(`\n▶ Suite ${suite.n}: ${suite.label}`);
    try {
      const { run } = require(suite.mod);
      const results = await run();
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1) + 's';
      for (const r of results) {
        allResults.push({ ...r, suite: suite.n, elapsed });
      }
    } catch (err) {
      console.error(`  ✗ Suite ${suite.n} crashed:`, err.message);
      allResults.push({ label: suite.label, suite: suite.n, pass: 0, fail: 1, total: 1, elapsed: '0s', crashed: true });
    }
  }

  // ── Final summary table ─────────────────────────────────────────────────
  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
  const grandTotal   = allResults.reduce((a, r) => a + r.total, 0);
  const grandPass    = allResults.reduce((a, r) => a + r.pass,  0);
  const grandFail    = allResults.reduce((a, r) => a + r.fail,  0);

  console.log('\n' + '═'.repeat(62));
  console.log('  FINAL RESULTS');
  console.log('═'.repeat(62));
  console.log('  Suite  Label'.padEnd(38) + 'Pass    Fail');
  console.log('  ' + '─'.repeat(58));
  for (const r of allResults) {
    const status = r.fail === 0 ? '✓' : '✗';
    const label  = `${r.suite}  ${r.label}`.slice(0, 32).padEnd(32);
    const pass   = String(r.pass).padStart(4);
    const fail   = String(r.fail).padStart(6);
    console.log(`  ${status}  ${label}  ${pass}  ${fail}`);
  }
  console.log('  ' + '─'.repeat(58));
  console.log(`  Total: ${grandPass}/${grandTotal} passed  (${grandFail} failed)  ${totalElapsed}`);
  console.log('═'.repeat(62) + '\n');

  if (grandFail === 0) {
    console.log('  ✅ ALL TESTS PASSED\n');
  } else {
    console.log(`  ❌ ${grandFail} TEST(S) FAILED\n`);
  }

  process.exit(grandFail > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
