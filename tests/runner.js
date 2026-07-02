'use strict';
// Runs every test file in order and prints a unified report.
//   node tests/runner.js            — run everything
//   node tests/runner.js smoke      — run files whose name contains "smoke"
const path = require('path');
const t = require('./t');

const FILES = [
  'smoke.js',
  'assets.test.js',
  'core_unit.test.js',
  'variants_test.js',
  'roadmap.test.js',
  'run_to_win.test.js',
  'save_restore.test.js',
  'achievements.test.js',
  'contracts_test.js',
  'ironman_test.js',
  'hunter_test.js',
  'endless_test.js',
  'audit_fixes.test.js',
];

const filter = process.argv[2] || '';
const chosen = FILES.filter(f => f.includes(filter));

for (const f of chosen) {
  t.setFile(f);
  const t0 = Date.now();
  process.stdout.write(`\n── ${f} ──\n`);
  try {
    require(path.join(__dirname, f));
  } catch (e) {
    t.test(`${f} (file-level)`, () => { throw e; });
  }
  process.stdout.write(`   (${Date.now() - t0} ms)\n`);
}

const { results, counts } = t.summary();
console.log('\n════════════ RESULTS ════════════');
for (const r of results) {
  const icon = { PASS: '  ✓', FAIL: '  ✗', 'KNOWN-BUG': '  ⚠', 'FIXED?': '  ?' }[r.status];
  console.log(`${icon} [${r.status}] ${r.file} :: ${r.name}${r.message ? '\n        ' + r.message : ''}`);
}
console.log('─────────────────────────────────');
console.log(`PASS ${counts.PASS} · FAIL ${counts.FAIL} · KNOWN-BUG ${counts['KNOWN-BUG']} · FIXED? ${counts['FIXED?']}`);
process.exitCode = counts.FAIL > 0 ? 1 : 0;
