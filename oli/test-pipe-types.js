const Oli = require('./core.js');
const { Game } = Oli;
function ok(x,m){ if(!x) throw new Error(m); }
const g = new Game(12345);
let spots = g.validSpots('well'); ok(spots.length,'no well');
const w=spots[0]; ok(g.place('well',w[0],w[1],'small').ok,'well');
let t=null, route=null;
for(const p of g.validSpots('tank')){
  if(!g.place('tank',p[0],p[1]).ok) continue;
  const r=g.routePipe(w[0],w[1],p[0],p[1],false,1);
  if(r.ok && r.fresh.length){t=p;route=r;break;}
  g.removeAt(p[0],p[1]);
}
ok(route,'no routable pair');
ok(g.buildRoute(route,1).ok,'main build');
const mk=route.fresh[0];
ok(g.pipeType[mk]===1,'main type stored');
const mainCap=g.pipeCapacity(mk), mainD=g.pipeDiameter(mk);
// Simulate an older/sub tile on the same saved game to verify backward-compatible storage and hydraulic distinction.
let subK=-1;
for(let k=0;k<g.pipe.length;k++) if(!g.pipe[k] && !g.occ[k] && !g.map.water[k] && !g.map.block[k]) { subK=k; break; }
ok(subK>=0,'no free tile');
g.pipe[subK]=1; g.pipeType[subK]=0; g.pipeLvl[subK]=1; g.pipeCond[subK]=1;
const save=g.serialize(); const g2=new Game(99); g2.load(save);
ok(g2.pipeType[mk]===1,'main type save/load');
ok(g2.pipeType[subK]===0,'sub type save/load');
ok(g2.pipeCapacity(mk)>g2.pipeCapacity(subK),'main capacity greater');
ok(g2.pipeDiameter(mk)>g2.pipeDiameter(subK),'main diameter greater');
console.log('PIPE TYPES TEST PASS',{mainCap,mainD,mainTiles:route.fresh.length});
