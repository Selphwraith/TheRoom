'use strict';
// core_unit.test.js — pathfinding, geometry, economy math, perk math.
const { createGame, makeStorage } = require('./env');
const { test, assert, assertEq } = require('./t');

test('astar: path INCLUDES the start node (documented gotcha)', () => {
  const g = createGame({ seed: 10 });
  g.eval('initGame()');
  const r = g.eval(`(function(){
    const p=astar(P.r,P.c,EXIT.r,EXIT.c);
    return {first:p[0], last:p[p.length-1], start:[P.r,P.c], goal:[EXIT.r,EXIT.c], len:p.length};
  })()`);
  assertEq(r.first[0], r.start[0], 'path[0].r === start.r');
  assertEq(r.first[1], r.start[1], 'path[0].c === start.c');
  assertEq(r.last[0], r.goal[0], 'path末.r === goal.r');
  assertEq(r.last[1], r.goal[1], 'path末.c === goal.c');
  assert(r.len >= 2, 'non-trivial path');
});

test('astar: every step is 4-adjacent and walkable', () => {
  const g = createGame({ seed: 11 });
  g.eval('initGame()');
  const bad = g.eval(`(function(){
    const p=astar(P.r,P.c,EXIT.r,EXIT.c);
    for(let i=1;i<p.length;i++){
      const dr=Math.abs(p[i][0]-p[i-1][0]), dc=Math.abs(p[i][1]-p[i-1][1]);
      if(dr+dc!==1) return 'non-adjacent step at '+i;
      if(grid[p[i][0]][p[i][1]]!==FLOOR) return 'wall step at '+i;
    }
    return null;
  })()`);
  assertEq(bad, null);
});

test('astar size=2: result tiles satisfy wk2x2 (enemy footprint)', () => {
  // NOTE: a target near the PLAYER may be 2x2-unreachable (squeeze pockets and
  // the vault are wk2x2 yet disconnected from the corridor graph — AUDIT P2),
  // so this test picks targets from the enemy's own reachable component.
  const g = createGame({ seed: 12 });
  g.eval('initGame()');
  const res = g.eval(`(function(){
    const E=enemies[0];
    const tiles=floorTiles2x2().filter(([r,c])=>md(r,c,E.r,E.c)>=8);
    let found=0, bad=null;
    for(const[r,c] of tiles){
      const p=astar(E.r,E.c,r,c,null,false,2);
      if(!p||p.length<2) continue;
      found++;
      for(let i=1;i<p.length;i++) if(!wk2x2(p[i][0],p[i][1])) bad='bad 2x2 tile at '+i;
      if(found>=5||bad) break;
    }
    return {found,bad};
  })()`);
  assert(res.found >= 1, 'no 2x2-reachable target found anywhere — nav graph broken');
  assertEq(res.bad, null);
});

test('astar trapPenalty: visible player mines repel size-2 paths', () => {
  const g = createGame({ seed: 13 });
  g.eval('initGame()');
  const detoured = g.eval(`(function(){
    const E=enemies[0];
    // pick a target the enemy can actually reach with a non-trivial path
    let target=null,p1=null;
    for(const[r,c] of floorTiles2x2()){
      if(md(r,c,E.r,E.c)<8) continue;
      const p=astar(E.r,E.c,r,c,null,true,2);
      if(p&&p.length>=8){target=[r,c];p1=p;break;}
    }
    if(!target) return 'no reachable target';
    const mid=p1[Math.floor(p1.length/2)];
    traps.push({r:mid[0],c:mid[1],owner:'player',hidden:false,def:WEAPONS.mine});
    const p2=astar(E.r,E.c,target[0],target[1],null,true,2)||[];
    // Does a worthwhile detour even exist? Block every anchor whose footprint
    // covers the mine and re-path. The 2x2 graph is nearly loop-free (AUDIT
    // P1), so often the answer is no — then crossing the mine IS optimal.
    const blocked=new Set();
    for(const[ar,ac] of [[mid[0],mid[1]],[mid[0],mid[1]+1],[mid[0]+1,mid[1]],[mid[0]+1,mid[1]+1]])
      blocked.add(ar*COLS+ac);
    const pAvoid=astar(E.r,E.c,target[0],target[1],blocked,false,2);
    traps.pop();
    const stepsOnMine=p2.filter(([r,c])=>{
      const fp=[[r-1,c-1],[r-1,c],[r,c-1],[r,c]];
      return fp.some(([fr,fc])=>fr===mid[0]&&fc===mid[1]);
    }).length;
    const detourWorthIt=pAvoid&&pAvoid.length<=p1.length+49;
    return {ok: detourWorthIt ? stepsOnMine===0 : true,
            detourExists:!!pAvoid, p1:p1.length, p2:p2.length, onMine:stepsOnMine};
  })()`);
  assert(detoured !== 'no reachable target', 'setup failed: no reachable target');
  assert(detoured.ok, `cheap detour exists (p1=${detoured.p1}) but penalized path still crossed the mine ${detoured.onMine}x (p2=${detoured.p2})`);
});

test('wk2x2 footprint is (r-1..r, c-1..c)', () => {
  const g = createGame({ seed: 14 });
  g.eval('initGame()');
  const ok = g.eval(`(function(){
    const tiles=floorTiles2x2();
    if(!tiles.length) return 'no 2x2 tiles';
    const [r,c]=tiles[0];
    return wk(r-1,c-1)&&wk(r-1,c)&&wk(r,c-1)&&wk(r,c);
  })()`);
  assertEq(ok, true);
});

test('goldAmount: always one of the 20 fixed steps, 10..500', () => {
  const g = createGame({ seed: 15 });
  const bad = g.eval(`(function(){
    const steps=new Set([10,15,20,25,30,40,50,60,70,80,90,100,125,150,175,200,250,300,400,500]);
    for(let i=0;i<500;i++){
      const a=goldAmount(i%2===0);
      if(!steps.has(a)) return a;
    }
    return null;
  })()`);
  assertEq(bad, null);
});

test('perm perk math: speed/stun/steady multipliers and HP halves', () => {
  const g = createGame({ seed: 16 });
  g.eval(`permPerks.swiftness=3; permPerks.breaker=3; permPerks.nimble=3; permPerks.vitality=3;`);
  assertEq(g.eval('permSpeedMult()'), 1.24);
  assert(Math.abs(g.eval('permStunMult()') - 1.30) < 1e-9, 'breaker x3 = 1.30');
  assert(Math.abs(g.eval('permSteadyMult()') - 0.55) < 1e-9, 'nimble x3 = 0.55');
  assertEq(g.eval('permMaxHP()'), 2, 'vitality 3 stacks = +1 full HP');
  assertEq(g.eval('permHalfHP()'), true, 'vitality 3 stacks leaves a pending half');
  g.eval('permPerks.nimble=10'); // hypothetical overstack
  assert(g.eval('permSteadyMult()') >= 0.3, 'steady mult floors at 0.3');
});

test('TIERS: difficulty strictly tightens, enemy count never decreases', () => {
  const g = createGame({ seed: 17 });
  const rows = g.eval('[1,2,3,4,5].map(t=>[TIERS[t].moveDur,TIERS[t].shootCd,TIERS[t].minos])');
  for (let i = 1; i < rows.length; i++) {
    assert(rows[i][0] < rows[i - 1][0], `moveDur not decreasing at tier ${i + 1}`);
    assert(rows[i][1] < rows[i - 1][1], `shootCd not decreasing at tier ${i + 1}`);
    assert(rows[i][2] >= rows[i - 1][2], `minos decreased at tier ${i + 1}`);
  }
});

test('maze size brackets: 55x43 base, 63x49 after 5 wins, capped 87x67', () => {
  const g = createGame({ seed: 18 });
  g.eval('totalRuns=0; updateMazeSize()');
  assertEq(g.eval('[COLS,ROWS].join("x")'), '55x43');
  g.eval('totalRuns=5; updateMazeSize()');
  assertEq(g.eval('[COLS,ROWS].join("x")'), '63x49');
  g.eval('totalRuns=999; updateMazeSize()');
  assertEq(g.eval('[COLS,ROWS].join("x")'), '87x67');
  g.eval('totalRuns=0; updateMazeSize()');
});

test('stash entry helpers: legacy strings and {t,sl} objects both parse', () => {
  const g = createGame({ seed: 19 });
  assertEq(g.eval(`stashType('bow')`), 'bow');
  assertEq(g.eval(`stashType({t:'stunbow',sl:2})`), 'stunbow');
  assertEq(g.eval(`stashShots('bow')`), null);
  assertEq(g.eval(`stashShots({t:'stunbow',sl:2})`), 2);
});

test('profile migration: old profile without gold/stash is normalized', () => {
  const storage = makeStorage();
  storage.setItem('labyrinth_profiles', JSON.stringify([
    { id: 'legacy1', playerName: 'OLD', profileName: 'TIMER', score: 900, totalRuns: 7, tier: 2, highScore: 900 },
  ]));
  storage.setItem('labyrinth_active_profile', 'legacy1');
  const g = createGame({ seed: 20, storage });
  assertEq(g.eval('profiles.length'), 1);
  assertEq(g.eval('profiles[0].gold'), 500, 'gold seeded as min(score,500)');
  assert(g.eval('Array.isArray(profiles[0].stash)'), 'stash array created');
  assertEq(g.eval('totalRuns'), 7, 'applyProfileToGame ran with migrated data');
});

test('hotbar: 5 slots, overflow derives to backpack, removal refills', () => {
  const g = createGame({ seed: 21 });
  g.eval('initGame()');
  g.clearEnemies();
  g.eval(`(function(){
    for(const t of ['knife','torch','bow','xbow','mine','noisemaker']){
      const w={r:-1,c:-1,type:t,def:WEAPONS[t]};
      P.weapons.push(w); hotbarAssign(w);
    }
  })()`);
  assertEq(g.eval('P.hotbar.filter(Boolean).length'), 5, 'hotbar capped at 5');
  assertEq(g.eval('getBackpack().length'), 2, 'club + 6 picked = 7, 2 overflow');
  // fire the active club (melee, no enemy in range → no consumption); instead drop via removePlayerWeapon
  g.eval('P.activeWeapon=P.hotbar[0]; removePlayerWeapon()');
  assertEq(g.eval('P.hotbar.filter(Boolean).length'), 5, 'freed slot auto-refilled from backpack');
  assertEq(g.eval('getBackpack().length'), 1);
});

test('stun xbow: shop copy matches the 10-shot pool (AUDIT B12)', () => {
  const g = createGame({ seed: 23 });
  const item = g.eval(`JSON.parse(JSON.stringify(SHOP_ITEMS.find(i=>i.id==='stunxbow')))`);
  assertEq(g.eval('WEAPONS.stunxbow.maxShots'), 10);
  assert(!/infinite/i.test(item.desc), 'shop copy still claims infinite shots');
  assert(item.desc.includes('10'), 'shop copy should state the 10-shot count');
});

test('sell value pro-rata: stunxbow with 5/10 shots sells for 125', () => {
  const g = createGame({ seed: 22 });
  const v = g.eval(`(function(){
    const t='stunxbow', shots=5;
    const sv=SELL_VALUES[t];
    return Math.max(5,Math.round(sv*shots/WEAPONS[t].maxShots));
  })()`);
  assertEq(v, 125);
});
