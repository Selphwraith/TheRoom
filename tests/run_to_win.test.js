'use strict';
// run_to_win.test.js — the headline integration test.
// A full run: spawn → real keyboard-driven movement along the game's own
// A* route → exit tile → win flow (score, tier, stash bank, leaderboard,
// achievements, save). Then four more wins to verify the meta-loop
// (tier-up at 5 wins, maze growth bracket).
const { createGame } = require('./env');
const { test, assert, assertEq } = require('./t');

test('single run-to-win: movement → exit → scoring → persistence', () => {
  const g = createGame({ seed: 50 });
  g.eval('initGame()');
  g.clearEnemies(); // deterministic traversal (Slayer-cleared maze is a legal state)

  const frames = g.walkToExit();
  assertEq(g.eval('phase'), 'WIN', `did not win (${frames} frames)`);

  // Scoring: first win = SCORE_WIN + 0×25 = 150
  assertEq(g.eval('totalRuns'), 1);
  assertEq(g.eval('score'), 150, 'first-win score');
  assertEq(g.eval('tier'), 1, 'no tier-up before 5 wins');

  // Meta save written
  const save = JSON.parse(g.storage.getItem('labyrinth_save'));
  assertEq(save.score, 150);
  assertEq(save.totalRuns, 1);

  // Profile bank synced
  const profiles = JSON.parse(g.storage.getItem('labyrinth_profiles'));
  assertEq(profiles[0].totalRuns, 1);
  assertEq(profiles[0].highScore, 150);

  // Leaderboard entry submitted
  const board = JSON.parse(g.storage.getItem('labyrinth_leaderboard'));
  assertEq(board.length, 1);
  assertEq(board[0].score, 150);

  // Achievements: runs counter ticked
  assertEq(g.eval(`achCounters['runs']`), 1);

  // Mid-run save cleared — the run is over
  assertEq(g.storage.getItem('labyrinth_runsave_' + g.eval('activeProfileId')), null);

  // Stash banked anything picked up en route (club excluded, cap 10)
  const stash = g.eval('JSON.parse(JSON.stringify(getActiveProfile().stash))');
  assert(Array.isArray(stash) && stash.length <= 10, 'stash cap respected');
  const types = stash.map(s => (typeof s === 'string' ? s : s.t));
  assert(!types.includes('club'), 'innate club must not be banked');
});

test('ghost replay: a win records the route + maze; the ghost is the previous best', () => {
  const g = createGame({ seed: 50 });
  const key = 'labyrinth_replay_' + g.eval('activeProfileId');

  // ── First clear: replay stored, no ghost yet (first clear in this bracket) ──
  g.eval('initGame()');
  g.clearEnemies();
  g.walkToExit();
  assertEq(g.eval('phase'), 'WIN', 'first run did not win');
  const r1 = JSON.parse(g.storage.getItem(key));
  assert(r1, 'no replay blob stored on win');
  assert(typeof r1.grid === 'string' && r1.grid.includes('|'), 'replay grid not serialized');
  assert(Array.isArray(r1.path) && r1.path.length >= 2, `replay path too short (${r1.path && r1.path.length})`);
  assertEq(r1.cols, g.eval('COLS'), 'replay cols mismatch');
  assertEq(r1.rows, g.eval('ROWS'), 'replay rows mismatch');
  assertEq(r1.exit.join(), g.eval('[EXIT.r,EXIT.c].join()'), 'replay exit mismatch');
  assertEq(r1.bestSec, 0, 'first clear must have no ghost (bestSec 0)');
  // every path entry is [t,r,c] with non-decreasing timestamps
  let mono = true; for (let i = 1; i < r1.path.length; i++) if (r1.path[i][0] < r1.path[i - 1][0]) mono = false;
  assert(mono, 'replay timestamps must be non-decreasing');

  // The bracket best time was banked
  const best1 = g.eval(`getActiveProfile().ghosts['b0'].time`);
  assert(best1 > 0, 'first win did not bank a bracket best time');

  // ── Second clear (same bracket b0): the replay ghost = previous best ──
  g.eval('initGame()');
  g.clearEnemies();
  g.walkToExit();
  assertEq(g.eval('phase'), 'WIN', 'second run did not win');
  const r2 = JSON.parse(g.storage.getItem(key));
  assertEq(r2.bestSec, best1, 'replay ghost must be the previous best clear time');
});

test('five consecutive wins: score curve, tier-up, maze growth', () => {
  const g = createGame({ seed: 51 });
  let expectedScore = 0;
  for (let run = 0; run < 5; run++) {
    g.eval('initGame()');
    g.clearEnemies();
    g.eval('powerupItems.length=0'); // skip blink teleports for speed
    expectedScore += 150 + run * 25; // SCORE_WIN + totalRuns(before win)*25
    g.walkToExit();
    assertEq(g.eval('phase'), 'WIN', `run ${run + 1} did not finish`);
    assertEq(g.eval('totalRuns'), run + 1);
  }
  assertEq(g.eval('score'), expectedScore, 'cumulative score over 5 wins'); // 150+175+200+225+250 = 1000
  assertEq(g.eval('tier'), 2, 'tier-up at 5 wins');
  // Next maze uses the bigger bracket and spawns tier-2 enemy count
  g.eval('initGame()');
  assertEq(g.eval('[COLS,ROWS].join("x")'), '63x49', 'maze bracket after 5 wins');
  assertEq(g.eval('enemies.length'), 2, 'tier 2 spawns 2 enemies');
});

test('death flow: -50 score, no run/tier advance, atMerchant set', () => {
  const g = createGame({ seed: 52 });
  g.eval('score=200; syncProfileFromGame(); saveProfiles();');
  g.eval('initGame()');
  const runsBefore = g.eval('totalRuns');
  g.eval(`P.hp=1; killPlayer('TEST DEATH')`);
  g.clock.advance(600); // showOverlay('dead') is on a 500ms timer
  assertEq(g.eval('phase'), 'DEAD');
  assertEq(g.eval('totalRuns'), runsBefore, 'death must not advance run count');
  assertEq(g.eval('score'), 150, '200 - 50 death penalty');
  assertEq(g.eval('getActiveProfile().atMerchant'), true, 'death parks player at merchant');
});

test('score floor: death penalty cannot push score below 0', () => {
  const g = createGame({ seed: 53 });
  g.eval('initGame()');
  g.eval('score=10');
  g.eval(`P.hp=1; killPlayer('TEST DEATH')`);
  g.clock.advance(600);
  assertEq(g.eval('score'), 0);
});

test('shop economy: buying perks spends gold and applies for ONE run only', () => {
  const g = createGame({ seed: 54 });
  g.eval('gold=500');
  g.eval(`buyPerk(SHOP_ITEMS.find(i=>i.id==='extraHP'))`);
  g.eval(`buyPerk(SHOP_ITEMS.find(i=>i.id==='startSpeed'))`);
  assertEq(g.eval('gold'), 500 - 120 - 100);
  g.eval('initGame()');
  assertEq(g.eval('P.perks.extraHP'), true, 'perk applied to run');
  assertEq(g.eval('P.hp'), 2, 'IRON SKIN grants +1 HP');
  assertEq(g.eval('Object.keys(pendingPerks).length'), 0, 'pendingPerks consumed');
  g.eval('initGame()');
  assertEq(g.eval('P.perks.extraHP'), undefined, 'perk gone on the following run');
});

test('exit detection only fires on grid-cell change onto EXIT', () => {
  const g = createGame({ seed: 55 });
  g.eval('initGame()');
  g.clearEnemies();
  // Teleport adjacent to exit, then walk in with real input
  const ok = g.eval(`(function(){
    for(const[dr,dc] of [[0,-1],[0,1],[-1,0],[1,0]]){
      const r=EXIT.r+dr,c=EXIT.c+dc;
      if(wk(r,c)){ P.r=r;P.c=c;P.rx=tx(c);P.ry=ty(r); return [dr,dc]; }
    }
    return null;
  })()`);
  assert(ok, 'no adjacent floor at exit');
  const key = ok[0] === 0 ? (ok[1] === -1 ? 'd' : 'a') : (ok[0] === -1 ? 's' : 'w');
  g.setKeys({ [key]: true });
  for (let i = 0; i < 120 && g.eval('phase') === 'PLAY'; i++) g.tick(16);
  g.releaseKeys();
  assertEq(g.eval('phase'), 'WIN');
});
