'use strict';
const { createGame } = require('./env');

for (const seed of [215, 200, 205]) {
  const g = createGame({ seed });
  g.eval('initGame()');
  const info = g.eval(`(function(){
    const counts=new Map();
    for(const[r,c] of floorTiles2x2()){
      const id=comp2x2(r,c);
      counts.set(id,(counts.get(id)||0)+1);
    }
    const sizes=[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8);
    // sample an anchor from the 2nd-largest component
    let sample=null;
    if(sizes.length>1){
      for(const[r,c] of floorTiles2x2()){
        if(comp2x2(r,c)===sizes[1][0]){sample=[r,c];break;}
      }
    }
    // where is the enemy? which comp?
    const E=enemies[0];
    return JSON.stringify({
      dims:[ROWS,COLS], anchors:floorTiles2x2().length,
      topSizes:sizes.map(s=>s[1]),
      comp2Sample:sample,
      enemyComp:comp2x2(E.r,E.c), enemyCompSize:counts.get(comp2x2(E.r,E.c))||0,
      doorCells:_secretDoorCells.size,
    });
  })()`);
  console.log('seed', seed, info);
}

// look at the local neighborhood of a 2nd-component anchor on 215
{
  const g = createGame({ seed: 215 });
  g.eval('initGame()');
  console.log(g.eval(`(function(){
    const counts=new Map();
    for(const[r,c] of floorTiles2x2()){
      const id=comp2x2(r,c);
      counts.set(id,(counts.get(id)||0)+1);
    }
    const sizes=[...counts.entries()].sort((a,b)=>b[1]-a[1]);
    const id2=sizes[1][0];
    let s=null;
    for(const[r,c] of floorTiles2x2()){ if(comp2x2(r,c)===id2){s=[r,c];break;} }
    // print an 12x12 ascii window around it: # wall, . floor, D door cell, A anchor-of-comp2
    const[sr,sc]=s; let out='sample '+s+' compSize '+sizes[1][1]+'\\n';
    for(let r=sr-5;r<=sr+6;r++){
      let line='';
      for(let c=sc-5;c<=sc+6;c++){
        if(!inB(r,c)){line+=' ';continue;}
        const isDoor=_secretDoorCells.has(r*COLS+c);
        line+= isDoor?'D':(grid[r][c]===1?'#':(wk2x2(r,c)&&comp2x2(r,c)===id2?'A':'.'));
      }
      out+=line+'\\n';
    }
    return out;
  })()`));
}
