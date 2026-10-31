// Phase 2 adapter check: the registry agrees with core.js where they describe the same building, and every disagreement is listed (nothing is changed in core.js).
const assert = require('assert'), B = require('./buildings.js'), Bridge = require('./building-core-bridge.js'), { Game, CFG } = require('./core.js');
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
const g = new Game({ seed: 7 });
{ const d = Bridge.compare(B.DEFS.oil_well, g, 'well'); ok(d.length === 0, 'oil_well == core well: same footprint and same ports ' + JSON.stringify(d)); }
{ const d = Bridge.compare(B.DEFS.crude_tank_s, g, 'tank'); const fp = d.filter(x => /footprint/.test(x)); ok(fp.length === 0, 'crude_tank_s == core tank: same 2x2 footprint');
  const coreIn = new Set(g.connectionPoints('tank', 0, 0, 0).map(p => p.role + ':' + p.side)), regIn = B.DEFS.crude_tank_s.connections.filter(c => c.role === 'in').map(c => 'in:' + c.side);
  ok(regIn.every(k => coreIn.has(k)), 'the registry tank INPUT ports (W, N) are a subset of the core tank inlets (every side)');
  ok(d.some(x => /registry port out:/.test(x)), 'DOCUMENTED CONFLICT 3: the registry tank also has OUTPUT ports (E, S) that core.js tank does not have: ' + d.filter(x => /registry port/.test(x)).join('; ')); }
const pump = Bridge.compare(B.DEFS.pump_station_s, g, 'pump'); ok(pump.length > 0 && /footprint registry 2x2 vs core 1x1/.test(pump.join()), 'DOCUMENTED CONFLICT 2: Pump Station (2x2, Phase 1 scale table "pumpStation") is not core.js pump (1x1 in-line): ' + pump[0]);
ok(JSON.stringify(Object.keys(CFG.FOOTPRINT)) === JSON.stringify(['well', 'tank', 'pump']), 'core.js still knows only well, tank, pump (unchanged); the other buildings live only in the Building System until the integration phase');
console.log('CORE BRIDGE TESTS PASSED (' + n + ' checks)');
