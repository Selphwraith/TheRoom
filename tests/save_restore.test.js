'use strict';
// save_restore.test.js — mid-run suspend/resume integrity across simulated
// device states: same localStorage, brand-new script context (= app restart).
const { createGame, makeStorage } = require('./env');
const { test, assert, assertEq, assertDeepEq } = require('./t');

function buildDirtyRun(storage, seed) {
  const g = createGame({ seed, storage });
  g.eval('initGame()');
  // dirty the run: extra HP, stun-bow with partial shots, hidden mine, live powerup
  g.eval(`(function(){
    P.hp=3;P.hpFrac=0.5;
    const sb={r:-1,c:-1,type:'stunbow',def:WEAPONS.stunbow,_shotsLeft:2,_reloadTimer:700};
    P.weapons.push(sb); hotbarAssign(sb);
    const bow={r:-1,c:-1,type:'bow',def:WEAPONS.bow};
    P.weapons.push(bow); hotbarAssign(bow);
    P.activeWeapon=sb;
    for(const[dr,dc] of [[0,1],[1,0],[0,-1],[-1,0]]){
      const r=P.r+dr,c=P.c+dc;
      if(wk(r,c)){ traps.push({r,c,owner:'player',hidden:true,def:WEAPONS.mine}); break; }
    }
    activePowerups.push({type:'speed',timeLeft:2500,totalTime:5000});
    if(enemies[0]){ enemies[0].stunned=true; enemies[0].stunTimer=1234; }
  })()`);
  g.eval('saveRunState(true)');
  return g;
}

test('mid-run save → app restart → restoreRun: full state integrity', () => {
  const storage = makeStorage();
  const g1 = buildDirtyRun(storage, 60);
  const before = {
    pos: g1.eval('[P.r,P.c]'),
    hp: g1.eval('P.hp'),
    exit: g1.eval('[EXIT.r,EXIT.c]'),
    weapons: g1.eval('JSON.parse(JSON.stringify(P.weapons.map(w=>[w.type,w._shotsLeft??null])))'),
    active: g1.eval('P.activeWeapon.type'),
    mines: g1.eval(`JSON.parse(JSON.stringify(traps.filter(t=>t.owner==='player').map(t=>[t.r,t.c,!!t.hidden])))`),
    enemies: g1.eval('JSON.parse(JSON.stringify(enemies.map(e=>[e.variant,e.r,e.c,e.alive!==false,!!e.stunned])))'),
    powerups: g1.eval('JSON.parse(JSON.stringify(activePowerups.map(a=>[a.type,a.timeLeft])))'),
    vault: g1.eval('JSON.parse(JSON.stringify(vaultRect))'),
  };
  const saveKey = 'labyrinth_runsave_' + g1.eval('activeProfileId');
  assert(storage.getItem(saveKey), 'run save not written');

  // ── simulate app kill + relaunch: brand-new context, same storage ──
  const g2 = createGame({ seed: 999, storage });
  assertEq(g2.eval('hasRunSave()'), true, 'fresh boot must see the suspended run');
  g2.eval('restoreRun()');

  assertEq(g2.eval('phase'), 'PLAY');
  assertDeepEq(g2.eval('[P.r,P.c]'), before.pos, 'player position');
  assertEq(g2.eval('P.hp'), before.hp, 'hp');
  assertEq(g2.eval('P.hpFrac||0'), 0.5, 'fractional hp (scout glancing damage)');
  assertDeepEq(g2.eval('[EXIT.r,EXIT.c]'), before.exit, 'exit');
  assertDeepEq(
    g2.eval('JSON.parse(JSON.stringify(P.weapons.map(w=>[w.type,w._shotsLeft??null])))'),
    before.weapons, 'weapons + shot pools');
  assertEq(g2.eval('P.activeWeapon.type'), before.active, 'active weapon');
  assertDeepEq(
    g2.eval(`JSON.parse(JSON.stringify(traps.filter(t=>t.owner==='player').map(t=>[t.r,t.c,!!t.hidden])))`),
    before.mines, 'player mines incl. hidden flag');
  assertDeepEq(
    g2.eval('JSON.parse(JSON.stringify(enemies.map(e=>[e.variant,e.r,e.c,e.alive!==false,!!e.stunned])))'),
    before.enemies, 'enemy roster');
  assertDeepEq(
    g2.eval('JSON.parse(JSON.stringify(activePowerups.map(a=>[a.type,a.timeLeft])))'),
    before.powerups, 'active powerups with remaining time');
  assertDeepEq(g2.eval('JSON.parse(JSON.stringify(vaultRect))'), before.vault, 'vault rect');

  // grid round-trips exactly, modulo secret doors being re-sealed on restore
  const gridMatches = g2.eval(`(function(){
    const data=JSON.parse(localStorage.getItem(runSaveKey()));
    const saved=data.grid.split('|').map(s=>s.split('').map(Number));
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
      const sealed=_secretDoorCells.has(r*COLS+c);
      const expect=sealed?WALL:saved[r][c];
      if(grid[r][c]!==expect) return 'mismatch at '+r+','+c;
    }
    return null;
  })()`);
  assertEq(gridMatches, null, 'grid integrity');

  // and the restored run keeps simulating
  for (let i = 0; i < 60; i++) g2.tick(16);
  assert(['PLAY', 'DEAD'].includes(g2.eval('phase')), 'restored sim wedged');
});

test('corrupted run save: restoreRun falls back to a fresh run, no throw', () => {
  const storage = makeStorage();
  const g1 = createGame({ seed: 61, storage });
  g1.eval('initGame()');
  const key = 'labyrinth_runsave_' + g1.eval('activeProfileId');
  storage.setItem(key, '{"v":1,"grid":"00|01'); // truncated JSON
  const g2 = createGame({ seed: 62, storage });
  g2.eval('restoreRun()');
  assertEq(g2.eval('phase'), 'PLAY', 'must recover into a fresh playable run');
});

test('meta progress: saveProgress → app restart → loadProgress round-trip', () => {
  const storage = makeStorage();
  const g1 = createGame({ seed: 63, storage });
  g1.eval(`score=425; totalRuns=7; tier=2; highScore=600; gold=180;
           permPerks.swiftness=2; permPerks.vitality=1;
           saveProgress();`);
  const g2 = createGame({ seed: 64, storage });
  assertEq(g2.eval('score'), 425);
  assertEq(g2.eval('totalRuns'), 7);
  assertEq(g2.eval('tier'), 2);
  assertEq(g2.eval('highScore'), 600);
  assertEq(g2.eval('gold'), 180);
  assertEq(g2.eval(`permPerks.swiftness`), 2);
  assertEq(g2.eval(`permPerks.vitality`), 1);
});

test('clearProgress: wipes run, meta, perks AND the profile bank', () => {
  const storage = makeStorage();
  const g = createGame({ seed: 65, storage });
  g.eval(`score=425; totalRuns=7; tier=2; highScore=600; gold=180;
          permPerks.swiftness=2;
          getActiveProfile().stash=['bow','mine'];
          saveProgress();`);
  g.eval('clearProgress()');
  assertEq(g.eval('score'), 0);
  assertEq(g.eval('totalRuns'), 0);
  assertEq(g.eval('tier'), 1);
  assertEq(g.eval('gold'), 0);
  assertEq(g.eval('permPerks.swiftness'), 0);
  assertDeepEq(g.eval('JSON.parse(JSON.stringify(getActiveProfile().stash))'), []);
  // and a restart stays clean
  const g2 = createGame({ seed: 66, storage });
  assertEq(g2.eval('totalRuns'), 0);
  assertEq(g2.eval('gold'), 0);
});

test('autosave: crossing a grid cell writes the run save (AUDIT A6)', () => {
  const storage = makeStorage();
  const g = createGame({ seed: 70, storage });
  g.eval('initGame()');
  g.clearEnemies();
  const key = 'labyrinth_runsave_' + g.eval('activeProfileId');
  assertEq(storage.getItem(key), null, 'initGame must clear any stale run save');
  // walk until one cell change registers
  let moved = false;
  for (const k of ['d', 's', 'a', 'w']) {
    const before = g.eval('[P.r,P.c].join()');
    g.setKeys({ [k]: true });
    for (let i = 0; i < 90 && g.eval('[P.r,P.c].join()') === before; i++) g.tick(16);
    g.releaseKeys();
    if (g.eval('[P.r,P.c].join()') !== before) { moved = true; break; }
  }
  assert(moved, 'player never moved');
  const snap = storage.getItem(key);
  assert(snap, 'no autosave written after a cell change (without pause/pagehide)');
  assertEq(JSON.parse(snap).p.r, g.eval('P.r'), 'autosave captured the current cell');
});

test('profile isolation: run saves are keyed per profile', () => {
  const storage = makeStorage();
  const g = createGame({ seed: 67, storage });
  const k1 = g.eval('runSaveKey()');
  g.eval(`(function(){
    const p=defaultProfile('B','SECOND'); profiles.push(p); saveProfiles(); setActiveProfile(p.id);
  })()`);
  const k2 = g.eval('runSaveKey()');
  assert(k1 !== k2, 'two profiles share one run-save slot');
});

test('dynamite + noisemaker traps survive a mid-run save, fuses intact', () => {
  // Regression guard for AUDIT B7: saveRunState used to keep only plain
  // mines — noisemakers and burning dynamite silently vanished on resume.
  const storage = makeStorage();
  const g1 = createGame({ seed: 68, storage });
  g1.eval('initGame()');
  g1.eval(`(function(){
    traps.push({r:P.r,c:P.c,owner:'player',def:WEAPONS.dynamite,hidden:false,blastDir:'up'});
    dynamiteFuses.push({trap:traps[traps.length-1],fuseTimer:500,fuseNeeded:2000});
    const nd=WEAPONS.noisemaker;
    traps.push({r:P.r,c:P.c,owner:'player',def:nd,hidden:false,noiseTimeLeft:3200,active:true});
  })()`);
  g1.eval('saveRunState(true)');
  const g2 = createGame({ seed: 69, storage });
  g2.eval('restoreRun()');
  assertEq(g2.eval(`traps.filter(t=>t.owner==='player').length`), 2, 'player traps after restore');
  const noise = g2.eval(`JSON.parse(JSON.stringify(traps.find(t=>t.def&&t.def.isNoisemaker)||null))`);
  assert(noise && noise.active === true, 'noisemaker not active after restore');
  assertEq(noise.noiseTimeLeft, 3200, 'noisemaker ring time lost');
  assertEq(g2.eval('dynamiteFuses.length'), 1, 'dynamite fuse not restored');
  assertEq(g2.eval('dynamiteFuses[0].fuseTimer'), 500, 'fuse progress lost');
  assertEq(g2.eval('dynamiteFuses[0].trap.blastDir'), 'up', 'blast direction lost');
});
