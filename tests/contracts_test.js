'use strict';
// contracts_test.js — Merchant Contracts: opt-in run modifiers that pay GOLD
// (never score) on escape. Verifies activation lifecycle, multiplier vs flat
// payouts, the success/fail gate, the Darkness fog modifier, and suspend/resume.
const { createGame, makeStorage } = require('./env');
const { test, assert, assertEq } = require('./t');

// Win a run with a single contract live and known run-gold, no enemies/items.
function winWithContract(seed, id, setup) {
  const g = createGame({ seed });
  g.eval(`pendingContracts=['${id}']`);
  g.eval('initGame()');
  g.clearEnemies();
  g.eval('items.length=0; gold=0;'); // no pickups → gold only moves via payout
  if (setup) g.eval(setup);
  g.walkToExit();
  assertEq(g.eval('phase'), 'WIN', `${id} run did not reach the exit`);
  return g;
}

test('contract lifecycle: initGame moves pendingContracts → runContracts (consumed)', () => {
  const g = createGame({ seed: 70 });
  g.eval(`pendingContracts=['pacifist','sprinter']`);
  g.eval('initGame()');
  assertEq(g.eval('runContracts.map(c=>c.id).sort().join()'), 'pacifist,sprinter');
  assertEq(g.eval('pendingContracts.length'), 0, 'pending list must be consumed by initGame');
});

test('contract lifecycle: dailies ignore contracts (G15)', () => {
  const g = createGame({ seed: 78 }); // enter the daily from the title, like a real player
  g.eval(`pendingContracts=['pacifist']`);
  assertEq(g.eval('startDailyRun()'), true, 'daily should start on a fresh profile');
  assertEq(g.eval('dailyMode'), true, 'startDailyRun should enter daily mode');
  assertEq(g.eval('runContracts.length'), 0, 'dailies must ignore contracts');
});

test('contract PACIFIST: stun-free win pays the ×1.6 gold multiplier', () => {
  const g = winWithContract(71, 'pacifist', '_runGoldEarned=100;');
  const rep = g.eval('JSON.parse(JSON.stringify(_contractReport))');
  assertEq(rep.length, 1);
  assert(rep[0].ok, 'zero stuns must satisfy pacifist');
  assertEq(rep[0].pay, 60, '×1.6 of 100 run-gold = +60');
  assertEq(g.eval('gold'), 60, 'payout banked to the purse');
});

test('contract PACIFIST: a single stun voids the payout', () => {
  const g = createGame({ seed: 72 });
  g.eval(`pendingContracts=['pacifist']`);
  g.eval('initGame()');
  g.eval('if(enemies[0]) stunEnemy(enemies[0],1000,"test");'); // one stun → contract fails
  g.clearEnemies();
  g.eval('items.length=0; gold=0; _runGoldEarned=100;');
  g.walkToExit();
  const rep = g.eval('JSON.parse(JSON.stringify(_contractReport))');
  assert(!rep[0].ok, 'a stun must fail pacifist');
  assertEq(rep[0].pay, 0);
  assertEq(g.eval('gold'), 0, 'no payout on a failed contract');
});

test('contract BOMB DISPOSAL: flat +120, independent of run gold', () => {
  // big _runGoldEarned proves the flat payout does NOT scale with it
  const g = winWithContract(73, 'bombsquad', '_runGoldEarned=500; _runWarden.defuses=2;');
  const rep = g.eval('JSON.parse(JSON.stringify(_contractReport))');
  assert(rep[0].ok, 'two defuses satisfies bomb disposal');
  assertEq(rep[0].pay, 120, 'flat payout ignores run gold');
  assertEq(g.eval('gold'), 120);
});

test('contract BOMB DISPOSAL: one defuse is not enough', () => {
  const g = winWithContract(74, 'bombsquad', '_runWarden.defuses=1;');
  const rep = g.eval('JSON.parse(JSON.stringify(_contractReport))');
  assert(!rep[0].ok, 'one defuse must fail the 2-mine contract');
  assertEq(g.eval('gold'), 0);
});

test('contract TOMB RAIDER: +150 when the vault was entered', () => {
  const g = winWithContract(75, 'tombraider', '_runEnteredVault=true;');
  const rep = g.eval('JSON.parse(JSON.stringify(_contractReport))');
  assert(rep[0].ok); assertEq(rep[0].pay, 150); assertEq(g.eval('gold'), 150);
});

test('contract DARKNESS: cuts fog by 2 while active, pays ×1.5 on win', () => {
  const g = createGame({ seed: 76 });
  g.eval('initGame()');
  const base = g.eval('fogBonus()');           // no contract
  g.eval(`pendingContracts=['darkness']`);
  g.eval('initGame()');
  assertEq(g.eval('fogBonus()'), base - 2, 'DARKNESS must subtract 2 fog tiles');
  g.clearEnemies();
  g.eval('items.length=0; gold=0; _runGoldEarned=200;');
  g.walkToExit();
  const rep = g.eval('JSON.parse(JSON.stringify(_contractReport))');
  assert(rep[0].ok, 'surviving the run satisfies the modifier contract');
  assertEq(rep[0].pay, 100, '×1.5 of 200 = +100');
});

test('contracts survive a mid-run suspend/resume', () => {
  const storage = makeStorage();
  const g1 = createGame({ seed: 77, storage });
  g1.eval(`pendingContracts=['tombraider','pacifist']`);
  g1.eval('initGame()');
  g1.eval('_runEnteredVault=true; _runGoldEarned=42; _runMaxStillMs=1500; _runCarriedNoisemaker=true;');
  g1.eval('saveRunState(true)');
  // simulate app kill + relaunch: brand-new context, same storage
  const g2 = createGame({ seed: 999, storage });
  assertEq(g2.eval('hasRunSave()'), true, 'fresh boot must see the suspended run');
  g2.eval('restoreRun()');
  assertEq(g2.eval('runContracts.map(c=>c.id).sort().join()'), 'pacifist,tombraider', 'contracts not restored');
  assertEq(g2.eval('_runEnteredVault'), true, 'vault flag not restored');
  assertEq(g2.eval('_runGoldEarned'), 42, 'run gold not restored');
  assertEq(g2.eval('_runMaxStillMs'), 1500, 'still-streak not restored');
  assertEq(g2.eval('_runCarriedNoisemaker'), true, 'noisemaker flag not restored');
});
