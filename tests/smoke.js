'use strict';
// smoke.js — boots the game headlessly, generates mazes, runs the sim idle,
// and exercises the draw path. Catches "page is broken" class regressions.
const { createGame } = require('./env');
const { test, assert, assertEq } = require('./t');

test('boot: script evaluates, profile auto-created, phase=MENU', () => {
  const g = createGame({ seed: 1 });
  assertEq(g.eval('typeof initGame'), 'function', 'initGame defined');
  assertEq(g.eval('phase'), 'MENU');
  assertEq(g.eval('profiles.length'), 1, 'default profile created on first boot');
  assertEq(g.eval('profiles[0].playerName'), 'PLAYER');
  assertEq(g.eval('totalRuns'), 0);
  assertEq(g.eval('tier'), 1);
});

test('initGame: maze, player, exit, enemies all structurally valid', () => {
  const g = createGame({ seed: 2 });
  g.eval('initGame()');
  assertEq(g.eval('phase'), 'PLAY');
  assertEq(g.eval('grid.length'), g.eval('ROWS'));
  assertEq(g.eval('grid[0].length'), g.eval('COLS'));
  assert(g.eval('COLS % 2 === 1 && ROWS % 2 === 1'), 'maze dims must stay odd');
  // player on floor
  assertEq(g.eval('grid[P.r][P.c]'), 0, 'player spawns on floor');
  // exit on floor, reachable from player (uses game flood)
  assertEq(g.eval('grid[EXIT.r][EXIT.c]'), 0, 'exit on floor');
  assert(g.eval('flood(P.r,P.c).has(EXIT.r*COLS+EXIT.c)'), 'exit reachable from spawn');
  // tier 1 ⇒ exactly 1 enemy, standing on a 2x2-valid tile
  assertEq(g.eval('enemies.length'), 1, 'tier 1 spawns 1 enemy');
  assert(g.eval('enemies.every(e=>wk2x2(e.r,e.c))'), 'enemies on 2x2-walkable tiles');
  // starting loadout: innate club equipped
  assertEq(g.eval('P.weapons.length'), 1);
  assertEq(g.eval('P.activeWeapon.type'), 'club');
  assert(g.eval('items.length') >= 8, 'items seeded');
  assert(g.eval('powerupItems.length') >= 2, 'powerups seeded');
});

test('maze generation: 20 seeds all produce solvable mazes', () => {
  for (let seed = 100; seed < 120; seed++) {
    const g = createGame({ seed });
    g.eval('initGame()');
    assert(g.eval('flood(P.r,P.c).has(EXIT.r*COLS+EXIT.c)'), `seed ${seed}: exit unreachable`);
    assert(g.eval('md(P.r,P.c,EXIT.r,EXIT.c)') >= 10, `seed ${seed}: exit too close to spawn`);
  }
});

test('idle simulation: 600 frames with live AI, no exceptions', () => {
  const g = createGame({ seed: 3 });
  g.eval('initGame()');
  for (let i = 0; i < 600; i++) {
    g.tick(16);
    const phase = g.eval('phase');
    if (phase === 'DEAD') break; // standing still and getting caught is legal
    assertEq(phase, 'PLAY');
  }
  const phase = g.eval('phase');
  assert(phase === 'PLAY' || phase === 'DEAD', `unexpected phase ${phase}`);
});

test('draw path: drawAll() executes against stub canvas', () => {
  const g = createGame({ seed: 4 });
  g.eval('initGame()');
  g.tick(16);
  g.eval('drawAll()'); // any throw fails the test
});

test('movement physics: directional input moves the player, walls contain them', () => {
  const g = createGame({ seed: 5 });
  g.eval('initGame()');
  g.clearEnemies();
  let moved = false;
  for (const k of ['d', 's', 'a', 'w']) {
    const before = g.eval('[P.rx,P.ry].join()');
    g.setKeys({ [k]: true });
    for (let i = 0; i < 120; i++) g.tick(16);
    g.releaseKeys();
    if (g.eval('[P.rx,P.ry].join()') !== before) { moved = true; break; }
  }
  assert(moved, 'player never moved in any direction');
  // player must still be on floor (never inside a wall)
  assertEq(g.eval('grid[P.r][P.c]'), 0, 'player ended inside a wall');
});

test('defuse prompt instructs the interact key (E), not fire (AUDIT B1)', () => {
  const g = createGame({ seed: 7 });
  g.eval('initGame()');
  g.clearEnemies();
  const ok = g.eval(`(function(){
    for(const[dr,dc] of [[0,1],[0,-1],[1,0],[-1,0]]){
      const r=P.r+dr,c=P.c+dc;
      if(wk(r,c)){ traps.push({r,c,owner:'enemy',def:WEAPONS.mine}); return true; }
    }
    return false;
  })()`);
  assert(ok, 'no adjacent floor tile for the test mine');
  g.eval('playerInteract()');
  assertEq(g.eval('defusing'), true, 'defuse did not start');
  const toast = g.document.getElementById('toast').textContent;
  assert(toast.includes('HOLD E'), `defuse toast names the wrong control: "${toast}"`);
});

test('pause gate: update() is inert while paused', () => {
  const g = createGame({ seed: 6 });
  g.eval('initGame()');
  g.eval('togglePause(true)');
  const snap = g.eval('JSON.stringify([P.r,P.c,enemies.map(e=>[e.r,e.c])])');
  g.setKeys({ d: true });
  for (let i = 0; i < 60; i++) g.tick(16);
  g.releaseKeys();
  assertEq(g.eval('JSON.stringify([P.r,P.c,enemies.map(e=>[e.r,e.c])])'), snap, 'state changed while paused');
  g.eval('togglePause(false)');
});
