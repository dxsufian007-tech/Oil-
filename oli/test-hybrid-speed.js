/* Isolated hybrid scheduling experiment. Production files are untouched.
 * Compare the existing frame-driven stepping with a 500ms real-time scheduler
 * that preserves <=250ms simulation substeps. Run: node test-hybrid-speed.js
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
    time: g.s.time, oil: g.oilTotal(), tank: t.amt, pressure: w.pressure,
    condition: w.condition, remaining: g.areas[w.area].remaining,
    cash: g.s.cash, revenue: g.s.revenue, costs: g.opex.total,
    price: g.s.price, playerRate: g.s.pRate,
    flow: g.net.comps.reduce((n, c) => n + (c.flow || 0), 0)
  };
}
function run(speed, mode, realSeconds) {
  const g = makeScenario();
  const frames = Math.round(realSeconds * 60);
  let calls = 0;
  const start = process.hrtime.bigint();
  if (mode === 'live') {
    for (let i = 0; i < frames; i++) {
      let left = Math.min(1 / 60, 0.25) * speed;
      while (left > 1e-6) {
        const d = Math.min(left, 0.25);
        g.step(d); left -= d; calls++;
      }
    }
  } else {
    const ticks = Math.round(realSeconds / 0.5);
    for (let i = 0; i < ticks; i++) {
      // Batch scheduling is real-time; simulation remains in <=250ms substeps.
      let left = 0.5 * speed;
      while (left > 1e-6) {
        const d = Math.min(left, 0.25);
        g.step(d); left -= d; calls++;
      }
    }
  }
  return { state: snapshot(g), calls, ms: Number(process.hrtime.bigint() - start) / 1e6 };
}
function relDiff(a, b) {
  if (Math.abs(a) < 1e-9 && Math.abs(b) < 1e-9) return 0;
  return Math.abs(a - b) / Math.max(1, Math.abs(a), Math.abs(b)) * 100;
}
const REAL_SECONDS = 30;
console.log('OLI hybrid real-time batch experiment');
console.log('Baseline: frame-driven updates; candidate: 500ms real-time scheduler with <=250ms simulation substeps.');
console.log('Scenario: deterministic one-well / one-pipeline / one-tank network; leaks disabled.');
console.log('Duration:', REAL_SECONDS, 'real seconds');
for (const speed of [1, 5, 10]) {
  const base = run(speed, 'live', REAL_SECONDS);
  const test = run(speed, 'hybrid', REAL_SECONDS);
  const fields = ['time','oil','tank','pressure','condition','remaining','cash','revenue','costs','price','playerRate','flow'];
  const diffs = Object.fromEntries(fields.map(k => [k, +relDiff(base.state[k], test.state[k]).toFixed(6)]));
  console.log('\nSPEED ' + speed + 'x');
  console.log(JSON.stringify({
    baselineCalls: base.calls, hybridCalls: test.calls,
    callsReductionPct: +(100 * (1 - test.calls / base.calls)).toFixed(2),
    baselineMs: +base.ms.toFixed(2), hybridMs: +test.ms.toFixed(2),
    speedup: +(base.ms / Math.max(test.ms, 0.001)).toFixed(2),
    baseline: base.state, hybrid: test.state, relativeDifferencePct: diffs
  }, null, 2));
  for (const k of fields) {
    assert(Number.isFinite(test.state[k]), 'non-finite hybrid state: ' + k);
  }
}
