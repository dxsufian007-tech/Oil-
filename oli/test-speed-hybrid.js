/* Isolated hybrid timing experiment.
 * Batches wake every 500ms of wall time, but simulation advances in <=0.1 game-second
 * substeps to preserve the numerical behaviour of the current engine.
 * No production loop or core simulation code is changed.
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
    const r = g.place('tank', 28, y);
    if (r.ok) tank = r;
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
function stepInSubsteps(g, seconds, maxStep) {
  let left=seconds, calls=0;
  while(left>1e-9) {
    const dt=Math.min(left,maxStep);
    g.step(dt); left-=dt; calls++;
  }
  return calls;
}
function run(speed, mode, realSeconds) {
  const g=makeScenario(), start=process.hrtime.bigint();
  let calls=0;
  if(mode==='baseline') {
    const frames=Math.round(realSeconds*60);
    for(let i=0;i<frames;i++) calls+=stepInSubsteps(g,Math.min(1/60,0.25)*speed,0.25);
  } else {
    const batches=Math.round(realSeconds/0.5);
    for(let i=0;i<batches;i++) calls+=stepInSubsteps(g,0.5*speed,0.1);
  }
  return {state:snapshot(g),calls,ms:Number(process.hrtime.bigint()-start)/1e6};
}
function diff(a,b) {
  if(Math.abs(a)<1e-9&&Math.abs(b)<1e-9)return 0;
  return Math.abs(a-b)/Math.max(1,Math.abs(a),Math.abs(b))*100;
}
const REAL_SECONDS=30;
console.log('OLI HYBRID FIXED-STEP EXPERIMENT');
console.log('Baseline: current 60-FPS stepping, max 0.25 game seconds per step.');
console.log('Candidate: 500ms real-time batch, subdivided into <=0.1 game-second steps.');
console.log('Scenario: deterministic one-well / one-pipeline / one-tank; leaks disabled.');
for(const speed of [1,5,10]) {
  const a=run(speed,'baseline',REAL_SECONDS), b=run(speed,'hybrid',REAL_SECONDS);
  const fields=Object.keys(a.state);
  const differences=Object.fromEntries(fields.map(k=>[k,+diff(a.state[k],b.state[k]).toFixed(6)]));
  const maxDiff=Math.max(...Object.values(differences));
  console.log('\nSPEED '+speed+'x');
  console.log(JSON.stringify({
    baselineCalls:a.calls,hybridCalls:b.calls,
    callsReductionPct:+(100*(1-b.calls/a.calls)).toFixed(2),
    baselineMs:+a.ms.toFixed(2),hybridMs:+b.ms.toFixed(2),
    speedup:+(a.ms/Math.max(b.ms,0.001)).toFixed(2),
    maxStateDifferencePct:+maxDiff.toFixed(6),differences,
    baseline:a.state,hybrid:b.state
  },null,2));
  assert(maxDiff<0.5,'State divergence exceeded 0.5% at '+speed+'x: '+maxDiff+'%');
}
console.log('\nPASS: all tested state differences stayed below 0.5%.');
