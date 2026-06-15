'use strict';
// variants_test.js — behavioural contracts for the five enemy variants
// plus trap interactions. Drives the real minotaurAI/update code.
const { createGame } = require('./env');
const { test, assert, assertEq } = require('./t');

function freshWorld(seed) {
  const g = createGame({ seed });
  g.eval('initGame()');
  g.clearEnemies();
  return g;
}

test('classic: acquires scent on sight and closes PATH distance', () => {
  // NOTE: manhattan distance may legitimately GROW while the enemy follows
  // its optimal 2x2 route — the enemy nav graph is nearly loop-free (see
  // AUDIT P1), so detours of 200+ tiles between manhattan-adjacent regions
  // are normal. The honest contract is: remaining path length decreases.
  const g = freshWorld(30);
  const idx = g.spawnVariant('classic', { minDist: 8 });
  assert(idx >= 0, 'spawn failed');
  // Teleport it just inside vision radius (12) of the player
  g.eval(`(function(){
    const E=enemies[${idx}];
    const tiles=floorTiles2x2().filter(([r,c])=>{const d=md(r,c,P.r,P.c); return d>=6&&d<=10;});
    if(tiles.length){const[r,c]=tiles[0];E.r=r;E.c=c;E.rx=tx(c);E.ry=ty(r);E.tx=E.rx;E.ty=E.ry;}
  })()`);
  const pathLen = () => g.eval(`(function(){
    const E=enemies[${idx}];
    const t=nearestValid2x2(P.r,P.c,E.r,E.c);
    const p=astar(E.r,E.c,t[0],t[1],null,false,2);
    return p?p.length:-1;
  })()`);
  const p0 = pathLen();
  for (let i = 0; i < 300; i++) {
    g.tick(16);
    if (g.eval('phase') !== 'PLAY') break;
  }
  const scent = g.eval(`[enemies[${idx}].scentR,enemies[${idx}].scentC]`);
  assert(scent[0] >= 0, 'classic never locked scent despite line-of-sight range');
  if (g.eval('phase') === 'PLAY' && p0 > 0) {
    const p1 = pathLen();
    assert(p1 >= 0 && p1 < p0, `remaining path did not shrink (${p0} → ${p1})`);
  }
});

test('bruiser: charge carves walls along the line to the player', () => {
  const g = freshWorld(31);
  const idx = g.spawnVariant('bruiser', { minDist: 14 });
  assert(idx >= 0, 'spawn failed');
  const wallsBefore = g.eval('grid.flat().filter(v=>v===1).length');
  g.eval(`beginCharge(enemies[${idx}])`);
  assertEq(g.eval(`enemies[${idx}].state`), 'CHARGING');
  // Step the charge: each AI tick consumes one chargePath node and carves 2x2
  for (let i = 0; i < 18; i++) {
    g.eval(`(function(){const E=enemies[${idx}]; E.moving=false; if(E.alive&&P.alive) minotaurAI(E,16);})()`);
    if (g.eval(`enemies[${idx}].state`) !== 'CHARGING') break;
  }
  const wallsAfter = g.eval('grid.flat().filter(v=>v===1).length');
  assert(wallsAfter < wallsBefore, `charge broke no walls (${wallsBefore} → ${wallsAfter})`);
});

test('blind one: never acquires a silent, motionless player', () => {
  const g = freshWorld(32);
  const idx = g.spawnVariant('blind', { minDist: 15 });
  assert(idx >= 0, 'spawn failed');
  for (let i = 0; i < 120; i++) g.tick(16);
  assertEq(g.eval(`enemies[${idx}].soundR`), -1, 'Blind One heard a player who never moved');
});

test('blind one: hears the first tile crossing and locks the sound', () => {
  const g = freshWorld(33);
  const idx = g.spawnVariant('blind', { minDist: 15 });
  assert(idx >= 0, 'spawn failed');
  // Move the player one grid cell in any walkable direction
  for (const k of ['d', 's', 'a', 'w']) {
    const before = g.eval('[P.r,P.c].join()');
    g.setKeys({ [k]: true });
    for (let i = 0; i < 90 && g.eval('[P.r,P.c].join()') === before; i++) g.tick(16);
    g.releaseKeys();
    if (g.eval('[P.r,P.c].join()') !== before) break;
  }
  // Hearing is evaluated on the Blind One's next AI tick — those fire when its
  // ~750ms move step completes, so poll up to ~3.5s of sim time.
  let heard = false;
  for (let i = 0; i < 220 && !heard; i++) {
    g.tick(16);
    heard = g.eval(`enemies[${idx}].soundR`) >= 0;
  }
  assert(heard, 'Blind One did not hear the tile crossing within 3.5s');
});

test('blind one: active noisemaker overrides player sounds as lure', () => {
  const g = freshWorld(34);
  const idx = g.spawnVariant('blind', { minDist: 15 });
  assert(idx >= 0, 'spawn failed');
  g.eval(`(function(){
    const def=WEAPONS.noisemaker;
    traps.push({r:P.r,c:P.c,owner:'player',def:def,hidden:false,noiseTimeLeft:def.noiseDuration,active:true});
  })()`);
  g.tick(16);
  const lockedTo = g.eval(`[enemies[${idx}].soundR,enemies[${idx}].soundC]`);
  const trapAt = g.eval('[traps[traps.length-1].r,traps[traps.length-1].c]');
  assertEq(lockedTo.join(), trapAt.join(), 'Blind One not locked onto noisemaker');
  // after 5s the noisemaker expires and is removed
  for (let i = 0; i < 320; i++) g.tick(16);
  assertEq(g.eval('traps.filter(t=>t.def&&t.def.isNoisemaker).length'), 0, 'noisemaker did not expire');
});

test('tactician: lays seal mines near the exit on its 10s cadence', () => {
  // The tactician's commute to the exit can take minutes on a loop-poor 2x2
  // graph (AUDIT P1), so the test fast-forwards the mine timer once the
  // tactician is parked near the exit, then verifies the placement logic.
  const g = freshWorld(35);
  const exit = g.eval('[EXIT.r,EXIT.c]');
  const idx = g.spawnVariant('tactician', { minDist: 0, near: exit, nearDist: 9 });
  assert(idx >= 0, 'no 2x2 tile near exit for tactician spawn');
  g.tick(16); // first AI tick runs the _tacState INIT
  // Park it near the exit and make the 10s timer due
  g.eval(`(function(){
    const E=enemies[${idx}];
    const tiles=floorTiles2x2().filter(([r,c])=>md(r,c,EXIT.r,EXIT.c)<=8);
    if(tiles.length){
      const[r,c]=tiles[0];
      E.r=r;E.c=c;E.rx=tx(c);E.ry=ty(r);E.tx=E.rx;E.ty=E.ry;E.moving=false;
    }
    E._tacLastMine=performance.now()-10001;
  })()`);
  for (let i = 0; i < 120 && !g.eval(`traps.some(t=>t.owner==='enemy')`); i++) g.tick(16);
  assert(g.eval(`traps.some(t=>t.owner==='enemy'&&t.def===WEAPONS.mine)`), 'tactician laid no mine once timer was due');
  const mineDist = g.eval(`(function(){
    const m=traps.find(t=>t.owner==='enemy');
    return md(m.r,m.c,EXIT.r,EXIT.c);
  })()`);
  assert(mineDist <= 12, `mine laid ${mineDist} tiles from exit — outside seal radius`);
});

test('scout: fires its innate crossbow on line-of-sight, 2s fixed reload', () => {
  const g = freshWorld(36);
  const idx = g.spawnVariant('scout', { minDist: 4 });
  assert(idx >= 0, 'spawn failed');
  // Place the scout at a 2x2 tile with true LOS within range but outside catch range
  const placed = g.eval(`(function(){
    const E=enemies[${idx}];
    const tiles=floorTiles2x2().filter(([r,c])=>{
      const d=md(r,c,P.r,P.c);
      return d>=4&&d<=12&&hasLOS(r,c,P.r,P.c);
    });
    if(!tiles.length) return false;
    const[r,c]=tiles[0];
    E.r=r;E.c=c;E.rx=tx(c);E.ry=ty(r);E.tx=E.rx;E.ty=E.ry;E.shootCooldown=0;
    return true;
  })()`);
  assert(placed, 'no LOS tile found for scout placement');
  g.tick(16);
  assertEq(g.eval(`projectiles.filter(p=>p.owner==='enemy').length`), 1, 'scout did not fire');
  assertEq(g.eval(`projectiles.find(p=>p.owner==='enemy').dmg`), 0.5, 'scout arrow must carry its half damage (B5)');
  assertEq(g.eval(`enemies[${idx}].shootCooldown`), 2000, 'scout reload is not the fixed 2000ms');
  assertEq(g.eval(`enemies[${idx}].weapon.type`), 'xbow', 'scout must keep its innate crossbow');
});

test('player mine: enemy stepping on any footprint cell triggers stun + removal', () => {
  const g = freshWorld(37);
  const idx = g.spawnVariant('classic', { minDist: 10 });
  assert(idx >= 0, 'spawn failed');
  const ok = g.eval(`(function(){
    const E=enemies[${idx}];
    // find an adjacent 2x2-valid destination
    for(const[dr,dc] of [[0,1],[0,-1],[1,0],[-1,0]]){
      const nr=E.r+dr,nc=E.c+dc;
      if(!wk2x2(nr,nc)) continue;
      traps.push({r:nr,c:nc,owner:'player',hidden:true,def:WEAPONS.mine});
      startEnemyMove(E,nr,nc);
      return {stunned:E.stunned, trapGone:!traps.some(t=>t.r===nr&&t.c===nc), stunTimer:E.stunTimer};
    }
    return null;
  })()`);
  assert(ok, 'no adjacent 2x2 destination');
  assert(ok.stunned, 'enemy not stunned by mine');
  assert(ok.trapGone, 'mine not consumed');
  assert(ok.stunTimer >= 5999, `stun shorter than mine base 6000ms: ${ok.stunTimer}`);
});

test('visible player mine: a sighted enemy STOPS to defuse instead of detonating', () => {
  const g = freshWorld(40);
  const idx = g.spawnVariant('classic', { minDist: 12 });
  assert(idx >= 0, 'spawn failed');
  const s = g.eval(`(function(){
    const E=enemies[${idx}];
    for(const[dr,dc] of [[0,1],[0,-1],[1,0],[-1,0]]){
      const nr=E.r+dr,nc=E.c+dc;
      if(!wk2x2(nr,nc)) continue;
      traps.push({r:nr,c:nc,owner:'player',hidden:false,def:WEAPONS.mine}); // VISIBLE
      const r0=E.r,c0=E.c,saved=E.moveDur;
      startEnemyMove(E,nr,nc);
      return {
        defusing:!!E._defuseTarget,
        inPlace:(E.r===r0&&E.c===c0&&E.tx===E.rx&&E.ty===E.ry),
        dur:E.moveDur, savedBefore:saved,
        minePresent:traps.some(t=>t.r===nr&&t.c===nc),
        stunned:E.stunned, mineRC:[nr,nc]
      };
    }
    return null;
  })()`);
  assert(s, 'no adjacent 2x2 destination');
  assert(s.defusing, 'enemy did not begin defusing a visible mine');
  assert(s.inPlace, 'enemy stepped onto the mine instead of holding to defuse');
  assert(!s.stunned, 'enemy was stunned — it detonated a visible mine (the bug)');
  assert(s.minePresent, 'mine cleared instantly instead of after the defuse timer');
  assertEq(s.dur, 2400, 'classic defuse duration not applied to moveDur');
  // The in-place defuse completes in update()'s enemy loop, which then clears the mine.
  const [mr,mc] = s.mineRC;
  let gone = false;
  for (let i = 0; i < 240 && !gone; i++) {
    g.tick(16);
    gone = !g.eval(`traps.some(t=>t.r===${mr}&&t.c===${mc})`);
    if (g.eval('phase') !== 'PLAY') break;
  }
  assert(gone, 'visible mine was never defused within the timer window');
  assert(!g.eval(`enemies[${idx}].stunned`), 'defuse should be harmless — enemy must not be stunned');
  // Critical: the normal move cadence is restored (moveDur is per-enemy & permanent :3036).
  assertEq(g.eval(`enemies[${idx}]._savedMoveDur`), null, 'saved moveDur not cleared after defuse');
  assert(g.eval(`enemies[${idx}].moveDur`) !== 2400, 'enemy stuck at the slow defuse cadence after defusing');
});

test('mine defuse speed is per-variant: scout/tactician fast, classic/bruiser mid, blind slow', () => {
  const g = freshWorld(41);
  const ms = v => {
    const i = g.spawnVariant(v, { minDist: 8 });
    assert(i >= 0, 'spawn failed for ' + v);
    return g.eval(`enemyDefuseMs(enemies[${i}])`);
  };
  const scout = ms('scout'), tact = ms('tactician'), classic = ms('classic'),
        bruiser = ms('bruiser'), blind = ms('blind');
  assertEq(scout, tact, 'scout and tactician should defuse at the same fast rate');
  assertEq(classic, bruiser, 'classic and bruiser should defuse at the same middle rate');
  assert(scout < classic, `scout (${scout}) must be faster than classic (${classic})`);
  assert(classic < blind, `classic (${classic}) must be faster than the blind one (${blind})`);
});

test('noisemaker must NOT detonate like a mine under an enemy footprint', () => {
  const g = freshWorld(38);
  const idx = g.spawnVariant('classic', { minDist: 10 });
  assert(idx >= 0, 'spawn failed');
  const r = g.eval(`(function(){
    const E=enemies[${idx}];
    for(const[dr,dc] of [[0,1],[0,-1],[1,0],[-1,0]]){
      const nr=E.r+dr,nc=E.c+dc;
      if(!wk2x2(nr,nc)) continue;
      const def=WEAPONS.noisemaker;
      const trap={r:nr,c:nc,owner:'player',def:def,hidden:false,noiseTimeLeft:def.noiseDuration,active:true};
      traps.push(trap);
      startEnemyMove(E,nr,nc);
      return {survived:traps.includes(trap)};
    }
    return null;
  })()`);
  assert(r, 'no adjacent 2x2 destination');
  // Regression guard for AUDIT B6: startEnemyMove's footprint check must only
  // consume owner:'player' traps that are actual mines — noisemakers are lures.
  assert(r.survived, 'noisemaker was consumed as if it were a mine');
});

test('scout half damage: two glancing hits cost exactly 1 HP total', () => {
  // Regression guard for AUDIT B5: the old dmg<1 branch deducted a FULL hp
  // per hit AND accrued hpFrac — two glancing hits took 3 HP to 0.
  const g = freshWorld(39);
  g.eval('P.hp=3; P.hpFrac=0;');
  g.eval(`killPlayer('test scout hit',0.5)`);
  assertEq(g.eval('P.hp'), 3, 'first glancing hit must not take a full HP');
  assertEq(g.eval('P.hpFrac'), 0.5, 'fraction not accrued');
  g.eval(`killPlayer('test scout hit',0.5)`);
  assertEq(g.eval('P.hp'), 2, 'half-damage accounting');
  assertEq(g.eval('P.hpFrac'), 0, 'fraction not consumed');
});
