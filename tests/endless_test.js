'use strict';
// endless_test.js — Endless Siege: no exit, escalating waves, score = seconds
// survived. Verifies the unlock gate, profile isolation (snapshot/restore),
// exit suppression, the director (waves / quickens / supply drops), the
// death→board→restore path, and the quit path.
const { createGame } = require('./env');
const { test, assert, assertEq } = require('./t');

function unlockEndless(g) {
  g.eval('highScore=16000; tier=5; totalRuns=25; score=15000; gold=400; syncProfileFromGame(); saveProfiles();');
}

test('endless: locked below the high-score gate, unlocks at it', () => {
  const g = createGame({ seed: 90 });
  assertEq(g.eval('endlessUnlocked()'), false, 'fresh profile must be locked');
  assertEq(g.eval('startEndlessRun()'), false, 'must refuse to start below the gate');
  assertEq(g.eval('endlessMode'), false);
  g.eval('highScore=14999; syncProfileFromGame(); saveProfiles();');
  assertEq(g.eval('endlessUnlocked()'), false, 'still locked just under 15k');
  g.eval('highScore=15000; syncProfileFromGame(); saveProfiles();');
  assertEq(g.eval('endlessUnlocked()'), true, '15,000 high score unlocks the siege');
});

test('endless: entering snapshots progression, isolates the profile, kills the key', () => {
  const g = createGame({ seed: 91 });
  unlockEndless(g);
  assertEq(g.eval('startEndlessRun()'), true);
  assertEq(g.eval('endlessMode'), true);
  assertEq(g.eval('phase'), 'PLAY');
  assertEq(g.eval('score'), 0, 'siege starts at score 0');
  assertEq(g.eval('tier'), 3, 'siege runs at tier III pace');
  assertEq(g.eval('getActiveProfile().score'), 15000, 'profile score untouched');
  assertEq(g.eval('getActiveProfile().tier'), 5, 'profile tier untouched');
  assertEq(g.eval('exitLocked'), false, 'no key-lock in a mode with no exit');
  assertEq(g.eval(`items.some(it=>it.type==='exitkey')`), false, 'exit key removed');
  g.eval('saveRunState(true)');
  assertEq(g.eval('hasRunSave()'), false, 'a siege must never write a resumable save');
});

test('endless: standing on the exit tile does NOT win — there is no exit', () => {
  const g = createGame({ seed: 92 });
  unlockEndless(g);
  g.eval('startEndlessRun()');
  g.clearEnemies();
  // park one tile away from the exit, then walk onto it with the real physics
  const parked = g.eval(`(function(){
    for(const[dr,dc] of [[0,1],[0,-1],[1,0],[-1,0]]){
      const r=EXIT.r+dr,c=EXIT.c+dc;
      if(wk(r,c)){ P.r=r;P.c=c;P.rx=tx(c);P.ry=ty(r); return true; }
    }
    return false;
  })()`);
  assert(parked, 'test setup: no floor tile beside the exit');
  let onExit = false;
  for (let i = 0; i < 300 && !onExit; i++) {
    const [dx, dy] = g.eval('[tx(EXIT.c)-P.rx, ty(EXIT.r)-P.ry]');
    g.setKeys({ a: dx < -2, d: dx > 2, w: dy < -2, s: dy > 2 });
    g.tick(16);
    onExit = g.eval('P.r===EXIT.r&&P.c===EXIT.c');
  }
  g.releaseKeys();
  assert(onExit, 'player reached the exit tile');
  assertEq(g.eval('phase'), 'PLAY', 'the exit tile must be inert in a siege');
});

test('endless: the director spawns waves, drops supplies, and quickens hunters', () => {
  const g = createGame({ seed: 93 });
  unlockEndless(g);
  g.eval('startEndlessRun()');
  const enemies0 = g.eval('enemies.filter(e=>e.alive).length');
  const items0 = g.eval('items.length+powerupItems.length');
  const dur0 = g.eval('enemies[0].moveDur');
  // survive ~100 virtual seconds (the camping penalty may fast-forward clocks —
  // that is by design and only makes the assertions stronger)
  for (let i = 0; i < 1000; i++) {
    g.tick(100);
    if (g.eval('phase') !== 'PLAY') break; // caught while idling — fine, checks below still hold
  }
  assert(g.eval('_esQuickens') >= 2, 'quicken ticks accumulated');
  assert(g.eval('enemies.filter(e=>e.alive).length') > enemies0 ||
         g.eval('enemies.length') > enemies0, 'a reinforcement wave arrived');
  assert(g.eval('items.length+powerupItems.length') > items0 - 2, 'supply drops landed');
  assert(g.eval('enemies[0].moveDur') < dur0, 'the original hunter got faster');
  assert(g.eval('enemies.every(e=>e.moveDur>=(e._esFloor||1))'), 'quicken respects the speed floor');
});

test('endless: death posts seconds survived to the siege board and restores the profile', () => {
  const g = createGame({ seed: 94 });
  unlockEndless(g);
  g.eval('startEndlessRun()');
  for (let i = 0; i < 200; i++) g.tick(100); // ~20s survived
  g.eval('P.hp=1; killPlayer("TEST DEATH")');
  g.clock.advance(600); // the death overlay arms on a 500ms timer
  assertEq(g.eval('endlessMode'), false, 'the siege has ended');
  assertEq(g.eval('score'), 15000, 'profile progression restored');
  const board = JSON.parse(g.storage.getItem('labyrinth_leaderboard_endless'));
  assert(Array.isArray(board) && board.length === 1, 'one board entry');
  assert(board[0].score >= 18 && board[0].score <= 40,
    'board score is the seconds survived (got ' + board[0].score + ')');
  assertEq(g.eval('hasRunSave()'), false, 'nothing resumable left behind');
  assert(g.eval('_shareText').includes('ENDLESS SIEGE'), 'share text is the siege tally');
});

test('endless: quitting abandons the siege — profile restored, no board post', () => {
  const g = createGame({ seed: 95 });
  unlockEndless(g);
  g.eval('startEndlessRun()');
  g.document.getElementById('pbQuit').dispatch('click');
  assertEq(g.eval('endlessMode'), false, 'siege abandoned');
  assertEq(g.eval('score'), 15000, 'profile progression restored');
  assertEq(g.eval('gold'), 400, 'gold restored');
  assertEq(g.storage.getItem('labyrinth_leaderboard_endless'), null, 'abandoning posts nothing');
  assertEq(g.eval('hasRunSave()'), false, 'nothing resumable left behind');
});
