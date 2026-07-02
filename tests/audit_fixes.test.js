'use strict';
// audit_fixes.test.js — regression guards for the last four open AUDIT bugs,
// fixed 2026-07-02: B2 (defuse ring desync), B8 (stun achievement pre-guard),
// B9 (restore entombment), B13 (unsanitized names in innerHTML).
const { createGame, makeStorage, extractScript } = require('./env');
const { test, assert, assertEq } = require('./t');

test('B2: defuse completion time is perk-adjusted and shared with the render ring', () => {
  const g = createGame({ seed: 7 });
  g.eval('initGame()');
  const base = g.eval('defuseNeededMs()');
  assertEq(base, g.eval('DEFUSE_TIME*permSteadyMult()'), 'base needed time');
  g.eval('P.perks.quickDefuse=true');
  const quick = g.eval('defuseNeededMs()');
  assert(Math.abs(quick - base / 2) < 1e-9, 'quickDefuse must halve the needed time');
  // The canvas ring must divide by the SAME function, not the raw constant —
  // source-level guard on the drawTraps defuse arc:
  const src = extractScript();
  assert(src.includes('defuseTimer/defuseNeededMs()'),
    'defuse ring must be drawn from defuseNeededMs()');
  assert(!src.includes('defuseTimer/DEFUSE_TIME'),
    'no render path may divide defuseTimer by the raw DEFUSE_TIME constant');
});

test('B8: stunning a dead enemy counts no achievement (and null target is safe)', () => {
  const g = createGame({ seed: 8 });
  g.eval('initGame()');
  const before = g.eval('achCounters.stun_classic||0');
  g.eval(`(function(){
    const E=makeEnemy(3,3,'classic'); E.alive=false;
    stunEnemy(E,3000,'test');       // dead target — must be a full no-op
    stunEnemy(null,3000,'test');    // null target — must not throw
  })()`);
  assertEq(g.eval('achCounters.stun_classic||0'), before,
    'dead/null stuns must not move the counter');
  // A real stun still counts:
  g.eval(`(function(){ const E=makeEnemy(5,5,'classic'); enemies.push(E); stunEnemy(E,3000,'test'); })()`);
  assertEq(g.eval('achCounters.stun_classic||0'), before + 1, 'live stun counts once');
});

test('B9: restore relocates a player entombed in a re-sealed secret door', () => {
  const storage = makeStorage();
  const g1 = createGame({ seed: 31, storage });
  g1.eval('initGame()');
  g1.eval('saveRunState(true)');
  const key = 'labyrinth_runsave_' + g1.eval('activeProfileId');
  const data = JSON.parse(storage.getItem(key));
  // Simulate "saved while standing inside an open secret door": park the saved
  // player on a door cell (re-sealed to WALL on restore); if this maze rolled
  // no doors, any wall cell exercises the same relocation path.
  let cell = data.sd && data.sd[0] && data.sd[0].cells[0];
  if (!cell) {
    const grid = data.grid.split('|').map(s => s.split('').map(Number));
    outer:
    for (let r = 1; r < grid.length - 1; r++)
      for (let c = 1; c < grid[0].length - 1; c++)
        if (grid[r][c] === 1) { cell = [r, c]; break outer; }
  }
  assert(cell, 'test setup: found no wall/door cell');
  data.p.r = cell[0]; data.p.c = cell[1];
  storage.setItem(key, JSON.stringify(data));

  const g2 = createGame({ seed: 999, storage });
  g2.eval('restoreRun()');
  assertEq(g2.eval('phase'), 'PLAY', 'restore completes');
  assert(g2.eval('wk(P.r,P.c)'), 'restored player must stand on a walkable tile');
  assert(g2.eval('P.rx===tx(P.c)&&P.ry===ty(P.r)'), 'pixel position follows the relocation');
});

test('QUIT LEAK: quitting an Ironman life must not leave a resumable normal-run save', () => {
  const g = createGame({ seed: 41 });
  g.eval('highScore=12000; tier=5; totalRuns=25; score=11250; gold=300; syncProfileFromGame(); saveProfiles();');
  assertEq(g.eval('startIronmanRun()'), true);
  assertEq(g.eval('phase'), 'PLAY');
  // Quit from the pause menu — the real button handler
  g.document.getElementById('pbQuit').dispatch('click');
  assertEq(g.eval('ironmanMode'), false, 'life abandoned');
  assertEq(g.eval('score'), 11250, 'profile progression restored');
  assertEq(g.eval('hasRunSave()'), false,
    'the abandoned Ironman world must NOT be saved as a resumable normal run');
});

test('QUIT LEAK: quitting a Daily resets dailyMode for subsequent normal runs', () => {
  const g = createGame({ seed: 42 });
  assertEq(g.eval('startDailyRun()'), true);
  assertEq(g.eval('dailyMode'), true);
  g.document.getElementById('pbQuit').dispatch('click');
  assertEq(g.eval('dailyMode'), false, 'quit must clear dailyMode');
  assertEq(g.eval('_dailyDate'), null, 'quit must clear the daily date');
  assertEq(g.eval('hasRunSave()'), false, 'a daily is never resumable');
  // A fresh normal run after the quit earns gold again (not "GOLD STAYS IN THE GAUNTLET")
  g.eval('initGame()');
  const goldBefore = g.eval('gold');
  g.eval('addGold(50)');
  assertEq(g.eval('gold'), goldBefore + 50, 'normal-run gold flows again after a daily quit');
});

test('B13: user names are HTML-escaped when rendered', () => {
  const g = createGame({ seed: 13 });
  assertEq(g.eval(`esc('<img src=x onerror=alert(1)>')`),
    '&lt;img src=x onerror=alert(1)&gt;', 'esc() neutralizes tags');
  assertEq(g.eval(`esc('A&B "quo" \\'apo\\'')`),
    'A&amp;B &quot;quo&quot; &#39;apo&#39;', 'esc() covers &, quotes');
  // Hostile names through the real leaderboard render:
  g.eval(`(function(){
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify([
      {profileId:'x',profileName:'<b>EVIL</b>',playerName:'<i>hax</i>',score:10,runs:1,ts:Date.now()}
    ]));
    renderLeaderboard();
  })()`);
  const html = g.document.getElementById('lbList').innerHTML;
  assert(!html.includes('<b>EVIL</b>') && !html.includes('<i>hax</i>'),
    'raw name markup must not reach innerHTML');
  assert(html.includes('&lt;b&gt;EVIL&lt;/b&gt;'), 'escaped name is still displayed');
});
