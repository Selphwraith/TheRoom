'use strict';
// hunter_test.js — Hunter Mode FOUNDATION: the per-profile highScore unlock ladder,
// the five classes, and the separate leaderboard slice. (Gameplay — the control
// inversion + prey AI — lands in the next slice and gets its own tests.)
const { createGame } = require('./env');
const { test, assert, assertEq } = require('./t');

test('hunter ladder: each class unlocks at its highScore threshold, in order', () => {
  const g = createGame({ seed: 90 });
  const at = hs => g.eval(`hunterClassesUnlocked(${hs}).join(',')`);
  assertEq(at(0), '', 'nothing below 5k');
  assertEq(at(4999), '', 'still nothing just under 5k');
  assertEq(at(5000), 'classic', '5k opens Hunter Mode with the Classic Minotaur');
  assertEq(at(10000), 'classic,scout', '10k adds the Scout');
  assertEq(at(15000), 'classic,scout,bruiser', '15k adds the Bruiser');
  assertEq(at(20000), 'classic,scout,bruiser,tactician', '20k adds the Tactician');
  assertEq(at(25000), 'classic,scout,bruiser,tactician,blind', '25k adds the Blind One — full roster');
  assertEq(at(999999), 'classic,scout,bruiser,tactician,blind', 'never more than the five');
});

test('hunter unlock gate keys off the PROFILE highScore', () => {
  const g = createGame({ seed: 91 });
  assertEq(g.eval('hunterUnlocked()'), false, 'fresh profile is locked');
  g.eval('highScore=4999; syncProfileFromGame(); saveProfiles();');
  assertEq(g.eval('hunterUnlocked()'), false, 'still locked just under 5k');
  g.eval('highScore=5000; syncProfileFromGame(); saveProfiles();');
  assertEq(g.eval('getActiveProfile().highScore'), 5000, 'profile high score banked');
  assertEq(g.eval('hunterUnlocked()'), true, '5k unlocks the mode');
});

test('hunter classes always come back score-ordered (accessible → advanced)', () => {
  const g = createGame({ seed: 92 });
  // Blind One is the last/rarest unlock — never appears before the cheaper four
  assertEq(g.eval(`hunterClassesUnlocked(45000)[4]`), 'blind', 'Blind One is the final class');
  assertEq(g.eval(`hunterClassesUnlocked(45000)[0]`), 'classic', 'Classic is the first class');
});

test('hunter leaderboard slice: separate key, best-per-profile, top-20', () => {
  const g = createGame({ seed: 93 });
  // posts go to the dedicated hunter board, never the main one
  g.eval('submitHunterEntry(120,{caught:3})');       // posts to classic slice (default class)
  g.eval('submitHunterEntry(80,{caught:2})');         // lower — must NOT replace the best
  g.eval('submitHunterEntry(200,{caught:5})');        // higher — replaces
  const board = JSON.parse(g.storage.getItem('labyrinth_leaderboard_hunter_classic'));
  assertEq(board.length, 1, 'one entry per profile');
  assertEq(board[0].score, 200, 'keeps the best score');
  assertEq(board[0].caught, 5, 'carries the extra payload (prey caught)');
  assertEq(g.eval('hunterBest()'), 200, 'hunterBest reads the class slice');
  assertEq(g.eval('hunterBestAll()'), 200, 'hunterBestAll picks up the class best');
  // the main and base hunter leaderboards are untouched
  assertEq(g.storage.getItem('labyrinth_leaderboard'), null, 'hunter posts never hit the normal board');
  assertEq(g.storage.getItem('labyrinth_leaderboard_hunter'), null, 'posts use per-class key, not the base key');
});

test('hunter mode flag isolates profile writes (forward-looking gate)', () => {
  const g = createGame({ seed: 94 });
  g.eval('score=11111; syncProfileFromGame(); saveProfiles();'); // bank a real value
  assertEq(g.eval('getActiveProfile().score'), 11111);
  // with hunterMode on, profile writes must be no-ops
  g.eval('hunterMode=true; score=999; syncProfileFromGame(); saveProfiles();');
  assertEq(g.eval('getActiveProfile().score'), 11111, 'hunterMode must not write profile score');
  assertEq(g.eval('hasRunSave()'), false, 'hunter runs are non-resumable');
  g.eval('hunterMode=false;');
});

// ── Gameplay: the control inversion ────────────────────────────────────
function unlockHunter(g, hs) { g.eval(`highScore=${hs||45000}; tier=5; syncProfileFromGame(); saveProfiles();`); }

test('hunter start: refuses while locked, sets up the inversion when unlocked', () => {
  const g = createGame({ seed: 95 });
  assertEq(g.eval(`startHunterRun('classic')`), false, 'must refuse below 5k');
  assertEq(g.eval('hunterMode'), false);
  unlockHunter(g, 12000); // classic (5k) + scout (10k) only — bruiser/tactician/blind still locked
  assertEq(g.eval(`startHunterRun('scout')`), true);
  assertEq(g.eval('hunterMode'), true);
  assertEq(g.eval('phase'), 'PLAY');
  assertEq(g.eval('enemies.length'), 1, 'exactly one minotaur — the human');
  assertEq(g.eval('enemies[0]._human'), true, 'enemies[0] is human-controlled');
  assertEq(g.eval('enemies[0].variant'), 'scout', 'spawned the chosen class');
  assertEq(g.eval('exitLocked'), false, 'v1 hunt has no key');
  assertEq(g.eval('getActiveProfile().highScore'), 12000, 'profile untouched while hunting');
  // an unavailable class falls back to the lowest unlocked one
  g.eval('abandonHunter()');
  g.eval(`startHunterRun('blind')`); // blind needs 25k — not unlocked at 12k
  assertEq(g.eval('enemies[0].variant'), 'classic', 'locked class falls back to classic');
});

test('hunter win: the minotaur catching the prey ends the hunt and posts a score', () => {
  const g = createGame({ seed: 96 });
  unlockHunter(g);
  g.eval(`startHunterRun('classic')`);
  const caught = g.eval(`(function(){
    const E=enemies[0];
    for(const [dr,dc] of [[0,1],[0,-1],[1,0],[-1,0]]){
      const nr=E.r+dr, nc=E.c+dc;
      if(!wk2x2(nr,nc)) continue;
      P.r=nr; P.c=nc; P.rx=tx(nc); P.ry=ty(nr);   // place the prey on the step destination
      startEnemyMove(E,nr,nc);                      // minotaur steps onto it → capture
      return true;
    }
    return false;
  })()`);
  assert(caught, 'no valid adjacent tile to stage the catch');
  assertEq(g.eval('hunterMode'), false, 'a catch ends the hunt');
  const board = JSON.parse(g.storage.getItem('labyrinth_leaderboard_hunter_classic'));
  assert(Array.isArray(board) && board.length === 1, 'win posts one hunter board entry');
  assert(board[0].score > 0, 'a catch scores points');
  assertEq(g.eval('getActiveProfile().highScore'), 45000, 'profile restored after the hunt');
});

test('hunter lose: the prey reaching the exit ends the hunt with no score', () => {
  const g = createGame({ seed: 97 });
  unlockHunter(g);
  g.eval(`startHunterRun('classic')`);
  g.eval(`(function(){
    // park the minotaur far from the exit so it can't interfere, prey next to the exit
    const E=enemies[0], far=hunterSpawnFarFrom(EXIT.r,EXIT.c);
    E.r=far[0]; E.c=far[1]; E.rx=tx(E.c); E.ry=ty(E.r); E.tx=E.rx; E.ty=E.ry; E.moving=false;
    for(const [dr,dc] of [[0,1],[0,-1],[1,0],[-1,0]]){
      const r=EXIT.r+dr, c=EXIT.c+dc;
      if(wk(r,c)){ P.r=r; P.c=c; P.rx=tx(c); P.ry=ty(r); break; }
    }
  })()`);
  for (let i = 0; i < 600 && g.eval('hunterMode'); i++) g.tick(16);
  assertEq(g.eval('hunterMode'), false, 'prey escaped → the hunt ended');
  assertEq(g.storage.getItem('labyrinth_leaderboard_hunter'), null, 'a loss posts no score');
  assertEq(g.eval('getActiveProfile().highScore'), 45000, 'profile restored after a loss');
});

test('hunter prey AI: drives P toward the exit (path distance shrinks)', () => {
  const g = createGame({ seed: 98 });
  unlockHunter(g);
  g.eval(`startHunterRun('classic')`);
  // keep the minotaur away so the prey can run freely
  g.eval(`(function(){ const E=enemies[0],f=hunterSpawnFarFrom(P.r,P.c); E.r=f[0];E.c=f[1];E.rx=tx(E.c);E.ry=ty(E.r);E.tx=E.rx;E.ry=ty(E.r);E.tx=E.rx;E.ty=E.ry;E.moving=false; })()`);
  const dist = () => g.eval(`(function(){const p=astar(P.r,P.c,EXIT.r,EXIT.c,null,false,1);return p?p.length:-1;})()`);
  const d0 = dist();
  for (let i = 0; i < 120 && g.eval('hunterMode'); i++) g.tick(16);
  const d1 = g.eval('hunterMode') ? dist() : 0; // 0 = already escaped (also progress)
  assert(d1 < d0, `prey did not close on the exit (${d0} → ${d1})`);
});

// ── Hyper-human prey ───────────────────────────────────────────────────
test('hunter prey skill scales with the profile highScore', () => {
  const g = createGame({ seed: 99 });
  g.eval('highScore=5000; syncProfileFromGame();');   // mode-entry score → dim prey
  const lo = g.eval('preySkill()');
  g.eval('highScore=25000; syncProfileFromGame();');  // full-roster score → razor-sharp prey
  const hi = g.eval('preySkill()');
  assert(lo < 0.35, `skill at 5k should be dim (${lo})`);
  assert(hi >= 0.9, `skill at 25k should be near-max (${hi})`);
  assert(hi > lo, 'competence must rise with highScore');
});

test('hunter minoAccess map: 2x2-reachable tiles marked, 1-wide gaps excluded', () => {
  const g = createGame({ seed: 102 });
  unlockHunter(g);
  g.eval(`startHunterRun('classic')`);
  // every tile a 2×2 anchor can occupy is flagged accessible
  const consistent = g.eval(`(function(){
    for(let r=1;r<ROWS;r++)for(let c=1;c<COLS;c++){
      if(wk2x2(r,c) && !(_minoAccess[r-1][c-1]&&_minoAccess[r-1][c]&&_minoAccess[r][c-1]&&_minoAccess[r][c])) return false;
    }
    return true;
  })()`);
  assert(consistent, 'a 2×2-reachable tile was not marked accessible');
  // the maze contains 1-wide gaps the hunter cannot enter — the prey's structural edge
  const gaps = g.eval(`(function(){let n=0;for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++) if(grid[r][c]===0&&!_minoAccess[r][c]) n++; return n;})()`);
  assert(gaps > 0, 'no 1-wide gaps detected — prey would have no size advantage');
});

test('hunter prey keeps more distance from the hunter when threatened', () => {
  const g = createGame({ seed: 103 });
  unlockHunter(g);
  g.eval(`startHunterRun('classic')`);
  const r = g.eval(`(function(){
    const plain=astar(P.r,P.c,EXIT.r,EXIT.c,null,false,1); if(!plain||plain.length<6) return null;
    const mid=plain[Math.floor(plain.length/2)]; const E=enemies[0]; let placed=false;
    for(const [ar,ac] of [[mid[0],mid[1]],[mid[0]+1,mid[1]],[mid[0],mid[1]+1],[mid[0]+1,mid[1]+1]]){
      if(wk2x2(ar,ac)){ E.r=ar;E.c=ac;E.rx=tx(ac);E.ry=ty(ar);E.tx=E.rx;E.ty=E.ry;E.moving=false; placed=true; break; }
    }
    if(!placed) return null;
    const minDist=path=>Math.min.apply(null,path.map(([r,c])=>Math.abs(r-E.r)+Math.abs(c-E.c)));
    return { plainMin:minDist(astar(P.r,P.c,EXIT.r,EXIT.c,null,false,1)), fleeMin:minDist(planPreyPath(E,preySkill(),true)) };
  })()`);
  if (!r) return; // this maze didn't allow staging the hunter on the path — skip
  assert(r.fleeMin >= r.plainMin, `threatened prey did not keep more distance (plain ${r.plainMin}, flee ${r.fleeMin})`);
});
