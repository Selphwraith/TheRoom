'use strict';
// roadmap.test.js — feature tests for the post-audit roadmap:
// Phase 1 relentless AI · Phase 2 Warden Remembers · Phase 3 keyed exits ·
// Phase 4 run stats/share · Phase 5 Daily Gauntlet + pace ghost · Phase 6 Ascension.
const { createGame, makeStorage } = require('./env');
const { test, assert, assertEq } = require('./t');

// ═══ Phase 1 — relentless AI ═══

test('P1: component-aware anchors give live paths and sane detours', () => {
  let misses = 0; const ratios = [];
  for (let seed = 200; seed < 212; seed++) {
    const g = createGame({ seed });
    g.eval('initGame()');
    const r = g.eval(`(function(){
      const E=enemies[0];
      const a=nearestValid2x2(P.r,P.c,E.r,E.c);
      _enemyPathing=true;
      let p; try{ p=astar(E.r,E.c,a[0],a[1],null,false,2); } finally { _enemyPathing=false; }
      if(!p||p.length<1) return null;
      return {len:p.length, man:Math.max(1,md(E.r,E.c,a[0],a[1]))};
    })()`);
    if (!r) { misses++; continue; }
    ratios.push(r.len / r.man);
  }
  assert(misses <= 1, misses + ' of 12 seeds had no enemy→player-anchor path');
  ratios.sort((a, b) => a - b);
  const median = ratios[Math.floor(ratios.length / 2)];
  // pre-fix this ratio was measured at 26× (234-node path at 9 manhattan)
  assert(median <= 6, 'median detour ratio too high: ' + median.toFixed(1));
});

test('P1: comp2x2 agrees with astar size-2 reachability', () => {
  const g = createGame({ seed: 213 });
  g.eval('initGame()');
  const res = g.eval(`(function(){
    const tiles=floorTiles2x2();
    const E=enemies[0];
    let same=0,sameOk=0,diff=0,diffOk=0;
    _enemyPathing=true;
    try{
      for(let i=0;i<tiles.length;i+=Math.max(1,Math.floor(tiles.length/40))){
        const[r,c]=tiles[i];
        if(r===E.r&&c===E.c) continue;
        const sameComp=comp2x2(r,c)===comp2x2(E.r,E.c);
        const p=astar(E.r,E.c,r,c,null,false,2);
        if(sameComp){same++; if(p&&p.length) sameOk++;}
        else {diff++; if(!p) diffOk++;}
      }
    } finally { _enemyPathing=false; }
    return {same,sameOk,diff,diffOk};
  })()`);
  assert(res.same > 0, 'no same-component samples — degenerate maze');
  assertEq(res.sameOk, res.same, 'a same-component anchor lacked a path');
  assertEq(res.diffOk, res.diff, 'a cross-component anchor unexpectedly had a path');
});

test('P1: one dominant component covers most of the enemy graph', () => {
  for (const seed of [214, 215, 216]) {
    const g = createGame({ seed });
    g.eval('initGame()');
    const frac = g.eval(`(function(){
      const counts=new Map();
      for(const[r,c] of floorTiles2x2()){
        const id=comp2x2(r,c);
        counts.set(id,(counts.get(id)||0)+1);
      }
      let total=0,max=0;
      for(const n of counts.values()){total+=n;if(n>max)max=n;}
      return max/Math.max(1,total);
    })()`);
    assert(frac >= 0.8, `seed ${seed}: dominant component only ${(frac * 100).toFixed(0)}% of anchors`);
  }
});

test('P1: invalidateFloorCache clears the component map (dug walls merge pockets)', () => {
  const g = createGame({ seed: 217 });
  g.eval('initGame()');
  g.eval('comp2x2(2,2)'); // force build
  assert(g.eval('_comp2x2Cache!==null'), 'cache not built');
  g.eval('invalidateFloorCache()');
  assert(g.eval('_comp2x2Cache===null'), 'component cache survived invalidation');
});

// ═══ Phase 2 — The Warden Remembers ═══

test('P2: foldWardenStats is an EMA — recent runs dominate, history fades', () => {
  const g = createGame({ seed: 220 });
  g.eval(`_runWarden={mines:4,stuns:2,defuses:1}; _runStillTime=10; _runMoveTime=60;`);
  g.eval('foldWardenStats(true)');
  let w = g.eval('JSON.parse(JSON.stringify(getActiveProfile().warden))');
  assertEq(w.mines, 4); assertEq(w.stuns, 2); assertEq(w.n, 1);
  assertEq(w.fast, 1, 'a sub-90s win counts as fast');
  g.eval(`_runWarden={mines:0,stuns:0,defuses:0}; _runStillTime=0; _runMoveTime=120;`);
  g.eval('foldWardenStats(true)');
  w = g.eval('JSON.parse(JSON.stringify(getActiveProfile().warden))');
  assert(Math.abs(w.mines - 4 * 0.85) < 1e-9, 'EMA decay 0.85 on mines');
  assert(Math.abs(w.n - 1.85) < 1e-9, 'EMA run counter');
  assertEq(g.eval('JSON.parse(localStorage.getItem("labyrinth_profiles"))[0].warden.n') > 1, true, 'fold persisted');
});

test('P2: warden stays neutral without history (n < 2)', () => {
  const g = createGame({ seed: 221 });
  const w = g.eval('JSON.parse(JSON.stringify(wardenWeights()))');
  assertEq(JSON.stringify(w), JSON.stringify({ classic: 3, bruiser: 1, scout: 1, blind: 1, tactician: 1 }));
  assertEq(g.eval('wardenMessage()'), null);
});

test('P2: trapper fingerprint boosts Tacticians; statue fingerprint culls Blind Ones', () => {
  const g = createGame({ seed: 222 });
  // trapper: ~2 mines per run over 5 effective runs
  g.eval(`getActiveProfile().warden={mines:10,stuns:0,defuses:0,still:10,move:300,fast:0,n:5}`);
  let w = g.eval('JSON.parse(JSON.stringify(wardenWeights()))');
  assert(w.tactician >= 3, `tactician not boosted: ${w.tactician}`);
  assertEq(g.eval('wardenMessage()'), '🧠 THE LABYRINTH REMEMBERS YOUR TRAPS');
  // statue: 40% stillness
  g.eval(`getActiveProfile().warden={mines:0,stuns:0,defuses:0,still:200,move:300,fast:0,n:5}`);
  w = g.eval('JSON.parse(JSON.stringify(wardenWeights()))');
  assert(w.blind < 1, `blind not culled: ${w.blind}`);
  assert(w.classic > 3, `classic not boosted: ${w.classic}`);
  assertEq(g.eval('wardenMessage()'), '🧠 THE LABYRINTH REMEMBERS YOUR PATIENCE');
});

test('P2: adaptive picks measurably shift variant composition', () => {
  const g = createGame({ seed: 223 });
  const sample = profile => {
    g.eval(`getActiveProfile().warden=${profile}`);
    g.eval('_rand=mulberry32(777)'); // deterministic sampling
    const counts = g.eval(`(function(){
      const c={classic:0,bruiser:0,scout:0,blind:0,tactician:0};
      for(let i=0;i<300;i++) c[pickWardenVariants(1)[0]]++;
      return JSON.parse(JSON.stringify(c));
    })()`);
    g.eval('_rand=Math.random');
    return counts;
  };
  const neutral = sample('{mines:0,stuns:0,defuses:0,still:0,move:0,fast:0,n:0}');
  const trapper = sample('{mines:12,stuns:0,defuses:0,still:10,move:300,fast:0,n:5}');
  assert(trapper.tactician > neutral.tactician * 1.6,
    `tactician share did not rise: ${neutral.tactician} → ${trapper.tactician}`);
});

test('P2: adapted profile gets the run-start message toast', () => {
  const g = createGame({ seed: 224 });
  g.eval(`getActiveProfile().warden={mines:10,stuns:0,defuses:0,still:10,move:300,fast:0,n:5}`);
  g.eval('initGame()');
  const toast = g.document.getElementById('toast').textContent;
  assert(toast.includes('REMEMBERS'), `no warden toast, got: "${toast}"`);
});

// ═══ Phase 3 — keyed exits ═══

function stepOnto(g, key, frames = 120, stopWhen = null) {
  g.setKeys({ [key]: true });
  for (let i = 0; i < frames; i++) {
    g.tick(16);
    if (stopWhen && g.eval(stopWhen)) break;
  }
  g.releaseKeys();
}

test('P3: sealed exit refuses entry with THE message, opens with the key', () => {
  const g = createGame({ seed: 230 });
  g.eval('initGame()');
  g.clearEnemies();
  g.eval('exitLocked=true; P.hasExitKey=false;');
  // park the player adjacent to the exit
  const adj = g.eval(`(function(){
    for(const[dr,dc] of [[0,-1],[0,1],[-1,0],[1,0]]){
      const r=EXIT.r+dr,c=EXIT.c+dc;
      if(wk(r,c)){ P.r=r;P.c=c;P.rx=tx(c);P.ry=ty(r); return [dr,dc]; }
    }
    return null;
  })()`);
  assert(adj, 'no adjacent floor at exit');
  const inKey = adj[0] === 0 ? (adj[1] === -1 ? 'd' : 'a') : (adj[0] === -1 ? 's' : 'w');
  const outKey = { d: 'a', a: 'd', s: 'w', w: 's' }[inKey];
  stepOnto(g, inKey, 120, 'P.r===EXIT.r&&P.c===EXIT.c');
  assertEq(g.eval('phase'), 'PLAY', 'sealed door let the player win');
  const toast = g.document.getElementById('toast').textContent;
  assert(toast.includes('THIS DOOR IS SEALED AND REQUIRES A KEY'), `wrong message: "${toast}"`);
  // grab the key, step off, walk back in
  g.eval('P.hasExitKey=true;');
  stepOnto(g, outKey, 120, '!(P.r===EXIT.r&&P.c===EXIT.c)');
  stepOnto(g, inKey, 120, 'phase!=="PLAY"');
  assertEq(g.eval('phase'), 'WIN', 'keyed door did not open');
});

test('P3: locked runs generate a reachable key, never before run 3', () => {
  // totalRuns 0/1 must never lock
  for (let seed = 231; seed < 236; seed++) {
    const g = createGame({ seed });
    g.eval('initGame()');
    assertEq(g.eval('exitLocked'), false, `locked at totalRuns=0 (seed ${seed})`);
  }
  // with history, ~30% lock; find one and validate the key
  let found = false;
  for (let seed = 240; seed < 270 && !found; seed++) {
    const g = createGame({ seed });
    g.eval('totalRuns=5');
    g.eval('initGame()');
    if (!g.eval('exitLocked')) continue;
    found = true;
    const key = g.eval(`(function(){
      const k=items.find(i=>i.type==='exitkey');
      if(!k) return null;
      return {reachable:flood(P.r,P.c).has(k.r*COLS+k.c),
              dSpawn:md(k.r,k.c,P.spawnR,P.spawnC), dExit:md(k.r,k.c,EXIT.r,EXIT.c),
              inVault:!!(vaultRect&&k.r>=vaultRect.r0&&k.r<=vaultRect.r1&&k.c>=vaultRect.c0&&k.c<=vaultRect.c1)};
    })()`);
    assert(key, 'locked run has no key item');
    assert(key.reachable, 'key not reachable from spawn');
    assert(key.inVault || (key.dSpawn >= 10 && key.dExit >= 10),
      `key too convenient: dSpawn=${key.dSpawn} dExit=${key.dExit} inVault=${key.inVault}`);
  }
  assert(found, 'no locked run in 30 seeds at 30% rate — generation broken');
});

test('P3: walking over the key collects it via the real pickup path', () => {
  const g = createGame({ seed: 236 });
  g.eval('initGame()');
  g.clearEnemies();
  g.eval('exitLocked=true; P.hasExitKey=false;');
  const placed = g.eval(`(function(){
    for(const[dr,dc] of [[0,1],[0,-1],[1,0],[-1,0]]){
      const r=P.r+dr,c=P.c+dc;
      if(wk(r,c)&&!items.some(i=>i.r===r&&i.c===c)){
        items.push({r,c,type:'exitkey',def:EXIT_KEY_DEF});
        return [dr,dc];
      }
    }
    return null;
  })()`);
  assert(placed, 'nowhere to drop the key');
  const key = placed[0] === 0 ? (placed[1] === 1 ? 'd' : 'a') : (placed[0] === 1 ? 's' : 'w');
  stepOnto(g, key, 120, 'P.hasExitKey');
  assertEq(g.eval('P.hasExitKey'), true, 'key not collected');
  assertEq(g.eval(`items.some(i=>i.type==='exitkey')`), false, 'key item not consumed');
  assert(g.document.getElementById('toast').textContent.includes('EXIT KEY'), 'no pickup toast');
});

test('P3: lock state and key possession survive suspend/restore', () => {
  const storage = makeStorage();
  const g1 = createGame({ seed: 237, storage });
  g1.eval('initGame()');
  g1.eval('exitLocked=true; P.hasExitKey=true; saveRunState(true);');
  const g2 = createGame({ seed: 999, storage });
  g2.eval('restoreRun()');
  assertEq(g2.eval('exitLocked'), true, 'lock lost on restore');
  assertEq(g2.eval('P.hasExitKey'), true, 'key lost on restore');
});

test('P3: status bar steers the player to the key', () => {
  const g = createGame({ seed: 238 });
  g.eval('initGame()');
  g.clearEnemies();
  g.eval('exitLocked=true; P.hasExitKey=false;');
  g.tick(16);
  assertEq(g.document.getElementById('sStatus').textContent, 'FIND THE KEY 🗝️');
  g.eval('P.hasExitKey=true;');
  g.tick(16);
  assertEq(g.document.getElementById('sStatus').textContent, 'FIND THE EXIT');
});

// ═══ Phase 4 — run stats + share strings ═══

test('P4: death screen shows the stats that sting and builds a share string', () => {
  const g = createGame({ seed: 250 });
  g.eval('initGame()');
  g.eval(`P.hp=1; killPlayer('CAUGHT BY THE SCOUT')`);
  g.clock.advance(600); // death overlay is on a 500ms timer
  const html = g.document.getElementById('ov').innerHTML;
  assert(html.includes('TILES FROM THE EXIT'), 'death overlay missing distance stat');
  assert(html.includes('btnShare'), 'death overlay missing share button');
  const share = g.eval('_shareText');
  assert(share.includes('THE LABYRINTH'), 'share missing title');
  assert(share.includes('💀 CAUGHT BY THE SCOUT'), 'share missing cause');
  assert(/🗺 \d+ tiles from the exit/.test(share), 'share missing distance: ' + share);
});

test('P4: win screen shows time + stuns and builds a share string', () => {
  const g = createGame({ seed: 251 });
  g.eval('initGame()');
  g.clearEnemies();
  g.walkToExit();
  assertEq(g.eval('phase'), 'WIN');
  const html = g.document.getElementById('ov').innerHTML;
  assert(html.includes('⏱'), 'win overlay missing time stat');
  assert(html.includes('btnShare'), 'win overlay missing share button');
  const share = g.eval('_shareText');
  assert(share.includes('RUN 1 ESCAPED'), 'share missing escape line: ' + share);
  assert(/⏱ \d+s/.test(share), 'share missing time');
});

test('P4: copyShareText degrades gracefully without a clipboard', () => {
  const g = createGame({ seed: 252 });
  g.eval(`_shareText='test'`);
  g.eval('copyShareText()'); // must not throw in a clipboard-less environment
  const toast = g.document.getElementById('toast').textContent;
  assert(toast.includes('COPY'), 'no feedback toast: ' + toast);
});

// ═══ Phase 5 — Daily Gauntlet + pace ghost ═══

test('P5: two players, two machines, one identical daily maze', () => {
  const g1 = createGame({ seed: 260 });
  const g2 = createGame({ seed: 999 }); // different RNG, different storage
  g1.eval('startDailyRun()');
  g2.eval('startDailyRun()');
  const world = g => g.eval(`JSON.stringify({
    grid:grid.map(r=>r.join('')).join('|'),
    exit:[EXIT.r,EXIT.c], locked:exitLocked,
    roster:enemies.map(e=>e.variant).sort(),
    dims:[ROWS,COLS],
  })`);
  assertEq(world(g1), world(g2), 'daily worlds diverged');
  assertEq(g1.eval('getTier().label'), 'TIER III', 'daily tier not locked');
});

test('P5: one attempt per day — the attempt burns at start', () => {
  const g = createGame({ seed: 261 });
  assertEq(g.eval('startDailyRun()'), true, 'first attempt refused');
  // simulate quitting without finishing: dailyMode off, record stays "started"
  g.eval('dailyMode=false;_dailyDate=null;phase="MENU";');
  assertEq(g.eval('startDailyRun()'), false, 'second attempt allowed');
  const toast = g.document.getElementById('toast').textContent;
  assert(toast.includes('ALREADY USED'), 'no burn message: ' + toast);
});

test('P5: dailies leave normal progression completely untouched', () => {
  const g = createGame({ seed: 262 });
  g.eval('score=400; totalRuns=7; tier=2; gold=150; syncProfileFromGame(); saveProfiles();');
  g.eval('permPerks.swiftness=3;');
  g.eval('startDailyRun()');
  assertEq(g.eval('permSpeedMult()'), 1, 'perm perks active inside daily');
  assertEq(g.eval('P.weapons.map(w=>w.type).join()'), 'club,bow', 'loaner loadout wrong');
  assertEq(g.eval('enemies.length'), 2, 'daily should use TIER III enemy count');
  // saveRunState must refuse daily suspends
  g.eval('saveRunState(true)');
  assertEq(g.storage.getItem('labyrinth_runsave_' + g.eval('activeProfileId')), null, 'daily run was suspended');
  // die in the daily
  g.eval(`P.hp=1; killPlayer('TEST')`);
  g.clock.advance(600);
  assertEq(g.eval('dailyMode'), false, 'dailyMode not cleared');
  assertEq(g.eval('score'), 400, 'daily death cost score');
  assertEq(g.eval('totalRuns'), 7, 'daily changed run count');
  assertEq(g.eval('gold'), 150, 'daily changed gold');
  assertEq(g.eval('permSpeedMult()'), 1.24, 'perm perks broken after daily');
  assert(!g.eval('getActiveProfile().atMerchant'), 'daily parked player at merchant');
  const rec = g.eval(`JSON.parse(JSON.stringify(getDailyRecord(dailyDateStr())))`);
  assertEq(rec.done, true); assertEq(rec.won, false);
  assert(g.document.getElementById('ov').innerHTML.includes('DAILY'), 'no daily result overlay');
  assert(g.eval('_shareText').includes('DAILY'), 'no daily share string');
});

test('P5: pace ghost — first win records, better win improves, split renders', () => {
  const g = createGame({ seed: 263 });
  g.eval('initGame()');
  g.clearEnemies();
  g.walkToExit();
  assertEq(g.eval('phase'), 'WIN');
  const t1 = g.eval('getActiveProfile().ghosts.b0.time');
  assert(t1 > 0, 'first win did not record a ghost time');
  // next run in the same bracket races that ghost
  g.eval('initGame()');
  g.clearEnemies();
  assertEq(g.eval('_paceBest'), t1, 'pace best not loaded');
  g.tick(16);
  const pace = g.document.getElementById('paceDisplay').textContent;
  assert(pace.includes('👻'), 'pace split not rendered: "' + pace + '"');
  // an artificially slow best gets beaten and replaced
  g.eval('getActiveProfile().ghosts.b0={time:9999}; saveProfiles();');
  g.eval('initGame()');
  g.clearEnemies();
  g.walkToExit();
  const t2 = g.eval('getActiveProfile().ghosts.b0.time');
  assert(t2 < 9999, 'better time did not replace ghost');
});

test('P5: title screen carries the daily button with state-aware label', () => {
  const g = createGame({ seed: 264 });
  g.eval('buildTitleScreen()');
  assert(g.document.getElementById('ov').innerHTML.includes('DAILY GAUNTLET'), 'no daily button');
  g.eval(`setDailyRecord(dailyDateStr(),{done:true,won:true,time:88})`);
  g.eval('buildTitleScreen()');
  assert(g.document.getElementById('ov').innerHTML.includes('DAILY ✓ 88s'), 'label not state-aware');
});

// ═══ Phase 6 — Ascension modifiers ═══

test('P6: ascension activates at 25 wins on tier V, rotates deterministically', () => {
  const g = createGame({ seed: 270 });
  g.eval('tier=5; totalRuns=24; initGame()');
  assertEq(g.eval('activeMod'), null, 'active before 25 wins');
  g.eval('totalRuns=25; initGame()');
  assertEq(g.eval('activeMod.id'), 'fading', '25 % 5 = 0 → fading');
  g.eval('totalRuns=26; initGame()');
  assertEq(g.eval('activeMod.id'), 'veiled');
  // fading: fog penalty grows with run time
  g.eval('totalRuns=25; initGame()');
  g.clearEnemies();
  for (let i = 0; i < 10; i++) g.tick(16);
  const early = g.eval('fogBonus()');
  g.clock.advance(90000); // 90s into the run
  const late = g.eval('fogBonus()');
  assert(late < early, `fog did not fade: ${early} → ${late}`);
  assert(late >= -2.5, 'fade exceeded its cap');
});

test('P6: TWIN WARDENS adds a hunter, SWIFT DEATH quickens them', () => {
  const g = createGame({ seed: 271 });
  g.eval('tier=5; totalRuns=27; initGame()'); // 27 % 5 = 2 → twin
  assertEq(g.eval('activeMod.id'), 'twin');
  assertEq(g.eval('enemies.length'), g.eval('TIERS[5].minos') + 1, 'no extra hunter');
  g.eval('totalRuns=28; initGame()'); // 28 % 5 = 3 → swift
  assertEq(g.eval('activeMod.id'), 'swift');
  const expected = g.eval(`Math.round(TIERS[5].moveDur*VARIANTS.classic.moveDurMult*0.85)`);
  const actual = g.eval(`makeEnemy(10,10,'classic').moveDur`);
  assertEq(actual, expected, 'swift moveDur wrong');
});

test('P6: SEALED EXIT forces a keyed run with a key on the floor', () => {
  const g = createGame({ seed: 272 });
  g.eval('tier=5; totalRuns=29; initGame()'); // 29 % 5 = 4 → sealed
  assertEq(g.eval('activeMod.id'), 'sealed');
  assertEq(g.eval('exitLocked'), true, 'sealed run not locked');
  assert(g.eval(`items.some(i=>i.type==='exitkey')`), 'no key in a sealed run');
});

test('P6: dailies never carry ascension modifiers', () => {
  const g = createGame({ seed: 273 });
  g.eval('tier=5; totalRuns=27;');
  g.eval('startDailyRun()');
  assertEq(g.eval('activeMod'), null, 'ascension leaked into the daily');
});

// ═══ Field fixes (2026-06-11 playtest report) ═══

test('FIX: viewport grows toward a square on tall/narrow screens', () => {
  const g = createGame({ seed: 280 });
  // baseline desktop window (1280×800) keeps the classic 21×15
  g.eval('resizeCanvas()');
  assertEq(g.eval('VIEW_TILES_H'), 15, 'baseline rows changed');
  // tall desktop: spare height becomes rows, capped at square
  g.eval('window.innerHeight=1200; resizeCanvas()');
  assertEq(g.eval('VIEW_TILES_H'), 21, 'tall screen did not reach square');
  assertEq(g.eval('cv.width===cv.height'), true, 'canvas not square at 21 rows');
  // portrait phone: square viewport instead of a letterboxed strip
  g.eval('window.innerWidth=390; window.innerHeight=844; resizeCanvas()');
  assertEq(g.eval('VIEW_TILES_H'), 21, 'phone portrait not square');
  assertEq(g.eval('[cv.width,cv.height].join("x")'), '378x378');
  g.eval('window.innerWidth=1280; window.innerHeight=800; resizeCanvas()');
});

test('FIX: quit-to-title then daily — controls live, sim running', () => {
  const g = createGame({ seed: 281 });
  g.eval('initGame()');
  // simulate the pause-menu QUIT TO TITLE path (pbQuit handler internals)
  g.eval(`saveRunState(true);togglePause(false);setGameControlsActive(false);
          phase='MENU';buildTitleScreen();document.getElementById('ov').style.display='flex';`);
  assertEq(g.document.getElementById('joystickWrap').style.pointerEvents, 'none', 'precondition: controls disabled by quit');
  assertEq(g.eval('startDailyRun()'), true, 'daily refused to start');
  assertEq(g.eval('phase'), 'PLAY');
  assertEq(g.document.getElementById('joystickWrap').style.pointerEvents, '', 'controls still dead after run start');
  // and the player can actually move
  g.clearEnemies();
  let moved = false;
  for (const k of ['d', 's', 'a', 'w']) {
    const before = g.eval('[P.rx,P.ry].join()');
    g.setKeys({ [k]: true });
    for (let i = 0; i < 60; i++) g.tick(16);
    g.releaseKeys();
    if (g.eval('[P.rx,P.ry].join()') !== before) { moved = true; break; }
  }
  assert(moved, 'player frozen inside the daily');
  g.eval('dailyMode=false;_dailyDate=null;'); // clean up for following tests
});

test('FIX: one thrown frame no longer kills the render loop', () => {
  const g = createGame({ seed: 282 });
  g.eval('initGame()');
  g.eval(`var _realUpdate=update; update=function(){throw new Error('boom')};`);
  g.eval('loop(performance.now()+16)'); // must not propagate
  g.eval('update=_realUpdate;');
  g.tick(16); // sim still alive afterwards
  assertEq(g.eval('phase'), 'PLAY');
});

test('FIX: Blind One stalks, attunes and PHASES into the vault', () => {
  let setup = null, g = null;
  for (let seed = 283; seed < 299 && !setup; seed++) {
    g = createGame({ seed });
    g.eval('initGame()');
    if (!g.eval('!!vaultRect')) continue;
    g.clearEnemies();
    setup = g.eval(`(function(){
      // player hides in the vault interior
      const pr=vaultRect.r0+2, pc=vaultRect.c0+2;
      P.r=pr;P.c=pc;P.rx=tx(pc);P.ry=ty(pr);
      // blind one outside, on the dominant component, near the vault
      const dom=dominantComp2x2();
      let spot=null,best=Infinity;
      for(const[r,c] of floorTiles2x2()){
        if(comp2x2(r,c)!==dom) continue;
        const d=md(r,c,pr,pc);
        if(d>=4&&d<best){best=d;spot=[r,c];}
      }
      if(!spot) return null;
      enemies.push(makeEnemy(spot[0],spot[1],'blind'));
      return {d:best};
    })()`);
  }
  assert(setup, 'no testable vault seed found');
  let entered = false;
  for (let i = 0; i < 1400 && !entered; i++) {
    g.tick(16);
    if (g.eval('phase') !== 'PLAY') { entered = true; break; } // caught the player INSIDE
    if (i % 10 === 0) {
      entered = g.eval(`(function(){
        const E=enemies[enemies.length-1];
        return E.r>=vaultRect.r0&&E.r<=vaultRect.r1+1&&E.c>=vaultRect.c0&&E.c<=vaultRect.c1+1;
      })()`);
    }
  }
  assert(entered, 'Blind One never phased into the vault (~22s sim)');
});

test('FIX: minotaurs never spawn inside the treasure vault', () => {
  let checked = 0;
  for (let seed = 300; seed < 316; seed++) {
    const g = createGame({ seed });
    g.eval('tier=3; totalRuns=12; initGame()'); // multiple enemies for coverage
    if (!g.eval('!!vaultRect')) continue;
    checked++;
    const bad = g.eval(`(function(){
      for(const E of enemies){
        const fp=[[E.r-1,E.c-1],[E.r-1,E.c],[E.r,E.c-1],[E.r,E.c]];
        for(const[fr,fc] of fp){
          if(fr>=vaultRect.r0&&fr<=vaultRect.r1&&fc>=vaultRect.c0&&fc<=vaultRect.c1)
            return E.variant+' at '+E.r+','+E.c;
        }
      }
      return null;
    })()`);
    assertEq(bad, null, `seed ${seed}: enemy in the vault — ${bad}`);
  }
  assert(checked >= 5, 'too few vault seeds sampled: ' + checked);
});

// ═══ Post-launch fixes (2026-06-12 player reports) ═══

test('LAUNCH FIX: dread decays after the last hunter dies (Slayer clear)', () => {
  const g = createGame({ seed: 320 });
  g.eval('initGame()');
  // point-blank final kill: effects at full intensity, then everything dies
  g.eval('rumble=4.5; glitchIntensity=0.9;');
  g.clearEnemies();
  for (let i = 0; i < 400; i++) g.tick(16); // ~6.4s of sim
  assert(g.eval('rumble') < 0.1, 'rumble stuck at ' + g.eval('rumble'));
  assert(g.eval('glitchIntensity') < 0.05, 'glitch stuck at ' + g.eval('glitchIntensity'));
});

test('LAUNCH FIX: profile form is a single editable name field', () => {
  const g = createGame({ seed: 321 });
  g.eval('showNewProfileForm()');
  const html = g.eval(`document.getElementById('profileOv').innerHTML`);
  // exactly one name input, no leftover username stub copy
  assert(html.includes('id="pcHeroInput"'), 'hero name input missing');
  assert(!html.includes('id="pcUserInput"'), 'username field still present');
  assert(!/LEAVE BLANK FOR NOW|platform login|PLAYER NAME/i.test(html), 'stale username copy survives');
  assert(html.includes('LEADERBOARD'), 'name field should explain where the name shows');
});

test('LAUNCH FIX: one name becomes both profile and leaderboard identity', () => {
  const g = createGame({ seed: 322 });
  g.eval('showNewProfileForm()');
  g.document.getElementById('pcHeroInput').value = 'Selph';
  g.document.getElementById('pcFormSubmit').dispatch('click');
  const p = g.eval('JSON.parse(JSON.stringify(getActiveProfile()))');
  assertEq(p.profileName, 'SELPH', 'profile name not set from the single field');
  assertEq(p.playerName, 'SELPH', 'player name not mirrored from the single field');
});

test('LAUNCH FIX: leaderboard hides the redundant name line for single-name profiles', () => {
  const g = createGame({ seed: 323 });
  g.eval(`(function(){
    localStorage.setItem('labyrinth_leaderboard', JSON.stringify([
      {profileId:'a', playerName:'SELPH', profileName:'SELPH', score:500, runs:3},
      {profileId:'b', playerName:'ALEX',  profileName:'HERO',  score:400, runs:2}
    ]));
  })()`);
  g.eval('renderLeaderboard()');
  const html = g.eval(`document.getElementById('lbList').innerHTML`);
  // single-name row: name appears once (profile line only)
  assertEq((html.match(/SELPH/g) || []).length, 1, 'single-name profile shown twice');
  // legacy two-name row: both still shown
  assert(html.includes('ALEX') && html.includes('HERO'), 'legacy two-name profile lost a line');
});

test('P2: multi-enemy packs still anchor on at least one classic', () => {
  const g = createGame({ seed: 225 });
  g.eval(`getActiveProfile().warden={mines:12,stuns:12,defuses:5,still:0,move:100,fast:5,n:5}`);
  const ok = g.eval(`(function(){
    for(let i=0;i<50;i++){
      if(!pickWardenVariants(3).includes('classic')) return false;
    }
    return true;
  })()`);
  assert(ok, 'a 3-pack spawned without a classic anchor');
});
