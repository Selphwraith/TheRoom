'use strict';
// achievements.test.js — unlock thresholds, composites, persistence,
// popup queue, and the ARSENAL counter bug.
const { createGame, makeStorage } = require('./env');
const { test, assert, assertEq } = require('./t');

test('threshold unlock: 5 classic stuns → BEAST TAMER, persisted', () => {
  const storage = makeStorage();
  const g = createGame({ seed: 80, storage });
  for (let i = 0; i < 4; i++) g.eval(`achProgress('stun_classic')`);
  assertEq(g.eval(`!!achUnlocked['stun_classic_5']`), false, 'unlocked one early');
  g.eval(`achProgress('stun_classic')`);
  assert(g.eval(`!!achUnlocked['stun_classic_5']`), 'not unlocked at 5');
  const saved = JSON.parse(storage.getItem('labyrinth_achievements'));
  assert(saved.unlocked['stun_classic_5'], 'unlock not persisted');
  assertEq(saved.counters['stun_classic'], 5);
});

test('achievements are global: a new profile keeps unlocks', () => {
  const storage = makeStorage();
  const g1 = createGame({ seed: 81, storage });
  for (let i = 0; i < 5; i++) g1.eval(`achProgress('stun_classic')`);
  const g2 = createGame({ seed: 82, storage });
  g2.eval(`(function(){const p=defaultProfile('X','NEW'); profiles.push(p); saveProfiles(); setActiveProfile(p.id);})()`);
  assert(g2.eval(`!!achUnlocked['stun_classic_5']`), 'achievement lost across profiles');
});

test('stunning an enemy in-game feeds the right variant counter', () => {
  const g = createGame({ seed: 83 });
  g.eval('initGame()');
  g.eval(`(function(){
    const tiles=floorTiles2x2(); const [r,c]=tiles[tiles.length-1];
    enemies.push(makeEnemy(r,c,'scout'));
  })()`);
  g.eval(`stunEnemy(enemies[enemies.length-1], 1000, 'TEST')`);
  assertEq(g.eval(`achCounters['stun_scout']`), 1);
});

test('run milestones: 5 wins → FIRST STEPS', () => {
  const g = createGame({ seed: 84 });
  for (let i = 0; i < 5; i++) g.eval(`achProgress('runs',1)`);
  assert(g.eval(`!!achUnlocked['runs_5']`));
  assertEq(g.eval(`!!achUnlocked['runs_10']`), false);
});

test('COLLECTOR composite: all 7 canonical weapon types ever picked', () => {
  const g = createGame({ seed: 85 });
  const types = ['knife', 'club', 'torch', 'bow', 'xbow', 'mine'];
  for (const t of types) g.eval(`achProgress('weapon_${t}')`);
  assertEq(g.eval(`!!achUnlocked['weapon_all_ever']`), false, 'unlocked at 6/7');
  g.eval(`achProgress('weapon_noisemaker')`);
  assert(g.eval(`!!achUnlocked['weapon_all_ever']`), 'not unlocked at 7/7');
});

test('ASCENDED composite: maxing every perm perk', () => {
  const g = createGame({ seed: 86 });
  g.eval(`PERM_PERKS.forEach(p=>{permPerks[p.id]=p.maxStacks;})`);
  g.eval('checkCompositeAchievements()');
  assert(g.eval(`!!achUnlocked['perk_all_max']`));
});

test('popup queue: unlock shows toast popup, auto-hides after ~3.7s', () => {
  const g = createGame({ seed: 87 });
  for (let i = 0; i < 5; i++) g.eval(`achProgress('stun_classic')`);
  const popup = g.document.getElementById('achPopup');
  assert(popup.classList.contains('show'), 'popup not shown on unlock');
  g.clock.advance(4000);
  assert(!popup.classList.contains('show'), 'popup never hid');
});

test('ARSENAL: carrying all 7 weapon types in ONE run should unlock it', () => {
  const g = createGame({ seed: 88 });
  g.eval('initGame()');
  g.clearEnemies();
  // 6 distinct types already held this run; pick up the 7th via real movement
  g.eval(`_runWeaponsHeld=new Set(['knife','club','torch','bow','xbow','mine'])`);
  const placed = g.eval(`(function(){
    for(const[dr,dc] of [[0,1],[0,-1],[1,0],[-1,0]]){
      const r=P.r+dr,c=P.c+dc;
      if(wk(r,c)&&!items.some(i=>i.r===r&&i.c===c)){
        items.push({r,c,type:'noisemaker',def:WEAPONS.noisemaker});
        return [dr,dc];
      }
    }
    return null;
  })()`);
  assert(placed, 'nowhere to drop the 7th weapon');
  const key = placed[0] === 0 ? (placed[1] === 1 ? 'd' : 'a') : (placed[0] === 1 ? 's' : 'w');
  g.setKeys({ [key]: true });
  for (let i = 0; i < 120 && g.eval('_runWeaponsHeld.size') < 7; i++) g.tick(16);
  g.releaseKeys();
  assertEq(g.eval('_runWeaponsHeld.size'), 7, 'pickup did not register');
  // Regression guard for AUDIT B4: the counter is now achSet to the number of
  // canonical ARSENAL_TYPES held this run, so one full set unlocks immediately.
  assert(g.eval(`!!achUnlocked['weapon_all_run']`), 'ARSENAL did not unlock');
});

test('progress UI data: counters/req render math stays in [0,100]%', () => {
  const g = createGame({ seed: 89 });
  g.eval(`achProgress('stun_bruiser', 999)`); // overshoot
  const pct = g.eval(`(function(){
    const a=ACH_DEFS.find(x=>x.id==='stun_bruiser_20');
    return Math.round(Math.min((achCounters[a.type]||0)/a.req,1)*100);
  })()`);
  assertEq(pct, 100);
});
