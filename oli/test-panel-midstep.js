/* The info panel must show the last FINISHED step while a live (sliced) step is paused half-way, and the offshore platform panel must list only the outputs it has (no NaN).  node test-panel-midstep.js */
const K = require('./test-central-kit.js'), { world, mk, attach } = K, buildAll = require('./test-offshore-lib.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const f = world.allSites().filter(s => s.offshore)[0], g = mk(); g.store.cash = Infinity; world.restoreProgress([[f.id, 'DRILLABLE']]);
const plats = buildAll(g, [f]), p = plats[0], row = (b, k) => { const r = g.sim.indicators(b).list.find(i => i.k === k); return r && r.v; };
const ids = [...g.cn.st.keys()]; for (let i = 0; i < 3; i++) attach(g, 'crude_tank_c', ids.slice(i * 3).concat(ids.slice(0, i * 3)), 'CRUDE', 'in', 0, 36); attach(g, 'gas_sphere_l', ids, 'GAS', 'in', 0, 36); attach(g, 'water_tank_c', ids, 'WATER', 'in', 0, 36);
for (let i = 0; i < 4; i++) g.sim.step(1);
T('1 the platform panel lists exactly one output and no NaN', g.sim.indicators(p.deck).list.filter(i => /^Output \d Flow$/.test(i.k)).length === 1 && g.sim.indicators(p.deck).list.every(i => !(typeof i.v === 'number' && isNaN(i.v))));
g.sim.watchId = p.pump.id; g.sim.step(1); const full = row(p.pump, 'Flow In'); T('2 the pump carries flow in a finished step', full > 1e5, full);
let pauses = 0, raw0 = 0, viewOk = 0, statusOk = 0; for (let k = 0; k < 4; k++) { const gen = g.sim.stepGen(1, true); let r = gen.next(); while (!r.done) { pauses++; if (!(row(p.pump, 'Flow In') > 1e5)) raw0++; const v = g.sim.view(p.pump, () => [row(p.pump, 'Flow In'), row(p.pump, 'Pressure In'), g.sim.status(p.pump)]); if (v[0] > .98 * full && v[1] > 1000 && v[2] === 'RUNNING') viewOk++; r = gen.next(); } }
T('3 the live step really pauses (the test is meaningful)', pauses > 0, pauses); T('4 without the view a half-finished step reads zero (the old bug)', raw0 > 0, raw0);
T('5 with the view every pause shows the last finished step (flow, pressure, status)', viewOk === pauses, { viewOk, pauses });
const after = row(p.pump, 'Flow In'); T('6 after the step the live values are back (view restores them)', after > .98 * full, after);
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
