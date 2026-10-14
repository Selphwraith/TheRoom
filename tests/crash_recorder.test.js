'use strict';
// crash_recorder.test.js — the diagnostics layer (crashLog / heartbeat / boot check).
// It is diagnostics-only: these tests also pin that it can never disturb gameplay.
const { createGame } = require('./env');
const { test, assert, assertEq } = require('./t');

const log = g => JSON.parse(g.storage.getItem('labyrinth_crashlog') || '[]');

test('crash recorder: a thrown frame is logged with context, and the loop survives', () => {
  const g = createGame({ seed: 7 });
  g.eval('initGame()');
  g.eval('update=function(){ throw new Error("boom-frame"); }');
  g.eval('loop(20000)'); // must not throw out of loop()
  const e = log(g);
  assertEq(e.length, 1);
  assertEq(e[0].k, 'frame');
  assert(e[0].m.includes('boom-frame'), 'message recorded');
  assert(e[0].c && e[0].c.dim, 'context (maze dimensions) recorded');
});

test('crash recorder: identical errors within 5s are deduped (no storage thrash)', () => {
  const g = createGame({ seed: 7 });
  g.eval('initGame()');
  g.eval('update=function(){ throw new Error("same"); }');
  for (let i = 0; i < 50; i++) g.eval(`loop(${20000 + i * 16})`);
  assertEq(log(g).length, 1);
});

test('crash recorder: ring buffer keeps only the newest 12 entries', () => {
  const g = createGame({ seed: 7 });
  for (let i = 0; i < 20; i++) g.eval(`crashLog('error','err-${i}','')`);
  const e = log(g);
  assertEq(e.length, 12);
  assertEq(e[0].m, 'err-8');
  assertEq(e[11].m, 'err-19');
});

test('crash recorder: dying mid-run (heartbeat p:true) is reported on next boot', () => {
  const g1 = createGame({ seed: 11 });
  g1.eval('initGame()');
  g1.eval('loop(30000)'); // PLAY frame → heartbeat written
  const hb = JSON.parse(g1.storage.getItem('labyrinth_heartbeat'));
  assertEq(hb.p, true);
  // "app killed" → a fresh instance boots on the same storage
  const g2 = createGame({ seed: 12, storage: g1.storage });
  const e = log(g2);
  assertEq(e.length, 1);
  assertEq(e[0].k, 'restart');
  assert(e[0].m.includes('FOREGROUND'), 'foreground death is labelled as such');
  assertEq(JSON.parse(g2.storage.getItem('labyrinth_heartbeat')).p, false, 'flag cleared so it reports once');
});

test('crash recorder: backgrounded-then-restarted is labelled differently', () => {
  const g1 = createGame({ seed: 11 });
  g1.eval('initGame()');
  g1.eval('loop(30000)');
  g1.eval('_hbHidden=true; _hbWrite(true)'); // what pagehide/visibilitychange does
  const g2 = createGame({ seed: 12, storage: g1.storage });
  assert(log(g2)[0].m.includes('BACKGROUNDED'), 'background restart is labelled');
});

test('crash recorder: a clean quit / death / win leaves NO restart entry', () => {
  const g1 = createGame({ seed: 11 });
  g1.eval('initGame()');
  g1.eval('loop(30000)');
  g1.eval("phase='MENU'");   // quit to title
  g1.eval('loop(40000)');    // loop notices the phase change and clears the flag
  assertEq(JSON.parse(g1.storage.getItem('labyrinth_heartbeat')).p, false);
  const g2 = createGame({ seed: 12, storage: g1.storage });
  assertEq(log(g2).length, 0);
});

test('crash recorder: title button only appears once something is recorded', () => {
  const g = createGame({ seed: 3 });
  assertEq(g.eval('diagBtnHTML()'), '');
  g.eval("crashLog('error','x','')");
  assert(g.eval('diagBtnHTML()').includes('btnDiag'), 'button present after an entry');
});

test('crash recorder: report text is readable and survives corrupt storage', () => {
  const g = createGame({ seed: 3 });
  g.eval("crashLog('error','bad thing','at foo (x.js:1:1)')");
  const txt = g.eval('crashReportText()');
  assert(txt.includes('bad thing') && txt.includes('build '), 'report lists entry + build id');
  g.storage.setItem('labyrinth_crashlog', '{not json');
  assertEq(g.eval('crashEntries().length'), 0, 'corrupt log reads as empty, no throw');
  g.eval("crashLog('error','after-corrupt','')"); // must not throw
});

test('crash recorder: failing storage never breaks gameplay frames', () => {
  const g = createGame({ seed: 7 });
  g.eval('initGame()');
  g.eval('localStorage.setItem=function(){ throw new Error("quota"); }');
  g.eval('loop(50000)');
  g.eval("crashLog('error','x','')");
  assertEq(g.eval('phase'), 'PLAY');
});
