/* Hybrid batch experiment. Production files are untouched.
 * One scheduler wake-up per 500ms real time; simulation time is subdivided
 * into <= 0.25 game-second steps to preserve time-dependent engine behavior.
 */
const assert = require('assert');
const { Game, CFG } = require('./core.js');
CFG.BUILD = { well: 0, tank: 0, pump: 0, pipeTile: 0, pipeMax: 0 };
CFG.PIPE.LEAK_PER_TILE_MIN = 0;
CFG.TERRAIN.MULT = [1, 1, 1, 1];
CFG.REGIONS.forEach(r => { r.mult = 1; });

function makeScenario() {
  const g = new Game({ seed: 731 });
  g.s.cash = 1e7;
  g.s.regions.forEach(r => { r.unlocked = true; });
  for (const a of g.areas) if (a.land) {
    a.st = 2; a.kind = 'large'; a.size = a.remaining = 50000; a.potential = 180; a.quality = 'MEDIUM';
  }
  const well = g.place('well', 20, 14);
  assert(well.ok, 'well placement: ' + well.reason);
  let tank = null;
  for (let y = 12; y < 22 && !tank; y++) {
    const result = g.place('tank', 28, y);
    if (result.ok) tank = result;
  }
  assert(tank, 'tank placement failed');
  const route = g.routePipe(20, 14, 28, tank.building.y, false);
  assert(route.ok, 'pipe route: ' + route.reason);
  const built = g.buildRoute(route);
  assert(built.ok, 'pipe build: ' + built.reason);
  return g;
}
function snapshot(g) {
  const w = g.buildings.find(b => b.type === 'well');
  const t = g.buildings.find(b => b.type === 'tank');
  return {
    time:g.s.time, oil:g.oilTotal(), tank:t.amt, pressure:w.pressure,
    condition:w.condition, remaining:g.areas[w.area].remaining,
    cash:g.s.cash, revenue:g.s.revenue, costs:g.opex.total,
    price:g.s.price, playerRate:g.s.pRate,
    flow:g.net.comps.reduce((n,c)=>n+(c.flow||0),0)
  };
}
function run(speed, mode, realSeconds) {
  const g=makeScenario(), frames=Math.round(realSeconds*60);
  let calls=0, batches=0;
  const start=process.hrtime.bigint();
  if(mode==='baseline') {
    for(let i=0;i<frames;i++) {
      let left=(1/60)*speed;
      while(left>1e-6){const d=Math.min(left,0.25);g.step(d);left-=d;calls++;}
    }
  } else {
    const ticks=Math.round(realSeconds/0.5);
    for(let i=0;i<ticks;i++){
      let left=0.5*speed; batches++;
      while(left>1e-6){const d=Math.min(left,0.25);g.step(d);left-=d;calls++;}
    }
  }
  return {state:snapshot(g),calls,batches,ms:Number(process.hrtime.bigint()-start)/1e6};
}
function diff(a,b){return Math.abs(a-b)/Math.max(1,Math.abs(a),Math.abs(b))*100;}
const duration=30;
console.log('OLI hybrid scheduler + <=0.25s simulation substeps');
console.log('Baseline: current frame-driven stepping. Candidate: 500ms real-time scheduler with bounded substeps.');
for(const speed of [1,5,10]){
 const a=run(speed,'baseline',duration), b=run(speed,'hybrid',duration);
 const fields=Object.keys(a.state);
 const differences=Object.fromEntries(fields.map(k=>[k,+diff(a.state[k],b.state[k]).toFixed(5)]));
 console.log(JSON.stringify({speed:speed+'x',baselineCalls:a.calls,hybridCalls:b.calls,batches:b.batches,
 callReductionPct:+(100*(1-b.calls/a.calls)).toFixed(2),
 baselineMs:+a.ms.toFixed(2),hybridMs:+b.ms.toFixed(2),
 differencesPct:differences,baseline:a.state,hybrid:b.state},null,2));
 // Both modes should advance the same game time.
 assert(Math.abs(a.state.time-b.state.time)<1e-6,'game time diverged at '+speed+'x');
}
