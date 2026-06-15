'use strict';
// Minimal test framework. No dependencies.
// test(name, fn)                — must not throw
// test(name, fn, {knownBug:'AUDIT #n'}) — asserts INTENDED behaviour; a failure
//                                  is reported as KNOWN-BUG (doc'd in AUDIT.md),
//                                  an unexpected pass is flagged as FIXED?.
const results = [];
let currentFile = '';

function setFile(f) { currentFile = f; }

function test(name, fn, opts = {}) {
  const t0 = Date.now();
  try {
    fn();
    results.push({
      file: currentFile, name, ms: Date.now() - t0,
      status: opts.knownBug ? 'FIXED?' : 'PASS',
      message: opts.knownBug ? `expected to fail (${opts.knownBug}) but passed — bug may be fixed` : '',
    });
  } catch (e) {
    results.push({
      file: currentFile, name, ms: Date.now() - t0,
      status: opts.knownBug ? 'KNOWN-BUG' : 'FAIL',
      message: (opts.knownBug ? `[${opts.knownBug}] ` : '') + (e && e.message ? e.message : String(e)),
    });
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || 'assertEq'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function assertDeepEq(a, b, msg) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error(`${msg || 'assertDeepEq'}: expected ${jb}, got ${ja}`);
}

function summary() {
  const counts = { PASS: 0, FAIL: 0, 'KNOWN-BUG': 0, 'FIXED?': 0 };
  for (const r of results) counts[r.status]++;
  return { results, counts };
}

module.exports = { test, assert, assertEq, assertDeepEq, summary, setFile };
