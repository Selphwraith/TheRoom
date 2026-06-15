'use strict';
// ironman_test.js — Ironman: ONE continuous life, unlocked at Tier V. Verifies the
// unlock gate, isolation from normal progression (snapshot/restore), the continuous
// climb, death→board→restore, abandon, no-resume, and the showOverlay short-circuit.
const { createGame } = require('./env');
const { test, assert, assertEq } = require('./t');

// Give the active profile enough highScore to unlock Ironman (gate is 10,000).
function unlockIronman(g) {
  g.eval('highScore=12000; tier=5; totalRuns=25; score=11250; gold=300; syncProfileFromGame(); saveProfiles();');
}

test('ironman: locked below the high-score gate, unlocks at it', () => {
  const g = createGame({ seed: 80 });
  assertEq(g.eval('ironmanUnlocked()'), false, 'fresh profile must be locked');
  assertEq(g.eval('startIronmanRun()'), false, 'must refuse to start below the gate');
  assertEq(g.eval('ironmanMode'), false, 'no life should have started');
  g.eval('highScore=9999; syncProfileFromGame(); saveProfiles();');
  assertEq(g.eval('ironmanUnlocked()'), false, 'still locked just under 10k');
  g.eval('highScore=10000; syncProfileFromGame(); saveProfiles();');
  assertEq(g.eval('ironmanUnlocked()'), true, '10,000 high score unlocks Ironman');
});

test('ironman: entering snapshots normal progression and starts a fresh life', () => {
  const g = createGame({ seed: 81 });
  unlockIronman(g);
  assertEq(g.eval('startIronmanRun()'), true);
  assertEq(g.eval('ironmanMode'), true);
  assertEq(g.eval('score'), 0, 'life starts at score 0');
  assertEq(g.eval('tier'), 1, 'life starts at Tier I');
  assertEq(g.eval('totalRuns'), 0, 'life depth starts at 0');
  // the profile keeps its real numbers — the life is isolated
  assertEq(g.eval('getActiveProfile().score'), 11250, 'profile score must be untouched');
  assertEq(g.eval('getActiveProfile().tier'), 5, 'profile tier must be untouched');
  // no resume — saveRunState is gated off in Ironman
  g.eval('saveRunState(true)');
  assertEq(g.eval('hasRunSave()'), false, 'Ironman must never write a resumable save');
});

test('ironman: escaping deepens the life without touching the profile', () => {
  const g = createGame({ seed: 82 });
  unlockIronman(g);
  g.eval('startIronmanRun()');
  for (let i = 0; i < 5; i++) g.eval('ironmanAdvance()'); // 5 escapes
  assertEq(g.eval('totalRuns'), 5, 'life depth = 5 escapes');
  assertEq(g.eval('tier'), 2, 'tier climbs at depth 5');
  assert(g.eval('score') > 0, 'life score accrues');
  assertEq(g.eval('getActiveProfile().score'), 11250, 'profile score still untouched mid-life');
  assertEq(g.eval('getActiveProfile().totalRuns'), 25, 'profile runs still untouched mid-life');
});

test('ironman: first death ends the life, posts to the ironman board, restores profile', () => {
  const g = createGame({ seed: 83 });
  unlockIronman(g);
  g.eval('startIronmanRun()');
  for (let i = 0; i < 3; i++) g.eval('ironmanAdvance()');
  const lifeScore = g.eval('score');
  g.eval('endIronman("test death")');
  assertEq(g.eval('ironmanMode'), false, 'the life has ended');
  const board = JSON.parse(g.storage.getItem('labyrinth_leaderboard_ironman'));
  assert(Array.isArray(board) && board.length === 1, 'exactly one ironman board entry');
  assertEq(board[0].score, lifeScore, 'posted the life score');
  assertEq(board[0].depth, 3, 'posted the depth reached');
  // normal progression restored exactly
  assertEq(g.eval('score'), 11250, 'profile score restored');
  assertEq(g.eval('tier'), 5, 'tier restored');
  assertEq(g.eval('totalRuns'), 25, 'runs restored');
  assertEq(g.eval('gold'), 300, 'gold restored');
});

test('ironman: abandoning a life restores progression and posts nothing', () => {
  const g = createGame({ seed: 84 });
  unlockIronman(g);
  g.eval('startIronmanRun()');
  g.eval('ironmanAdvance()');
  g.eval('abandonIronman()');
  assertEq(g.eval('ironmanMode'), false);
  assertEq(g.eval('score'), 11250, 'progression restored on abandon');
  assertEq(g.eval('tier'), 5);
  assertEq(g.storage.getItem('labyrinth_leaderboard_ironman'), null, 'abandon must not post a score');
});

test('ironman: showOverlay routes win→advance and death→end (short-circuit)', () => {
  const g = createGame({ seed: 85 });
  unlockIronman(g);
  g.eval('startIronmanRun()');
  g.eval(`showOverlay('win')`);
  assertEq(g.eval('totalRuns'), 1, 'win advanced the life depth');
  assertEq(g.eval('getActiveProfile().totalRuns'), 25, 'the normal win path must NOT run (profile untouched)');
  g.eval(`showOverlay('dead','t')`);
  assertEq(g.eval('ironmanMode'), false, 'death ended the life via the short-circuit');
});
