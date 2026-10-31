// Phase 2 adapter check: the registry agrees with core.js where they describe the same building, and every disagreement is listed (nothing is changed in core.js).
const assert = require('assert'), B = require('./buildings.js'), Bridge = require('./building-core-bridge.js'), { Game, CFG } = require('./core.js');
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
const g = new Game({ seed: 7 });
for (const [reg, core] of Object.entries(Bridge.MAP)) { if (!core) continue; const d = Bridge.compare(B.DEFS[reg], g, core); ok(d.length === 0, reg + ' == core ' + core + ': same footprint and same ports ' + (d.length ? JSON.stringify(d) : '')); }
const pump = Bridge.compare(B.DEFS.pump_station, g, 'pump'); ok(pump.length > 0 && /footprint registry 2x2 vs core 1x1/.test(pump.join()), 'DOCUMENTED CONFLICT 2: Pump Station (2x2, Phase 1 scale table "pumpStation") is not core.js pump (1x1 in-line): ' + pump[0]);
ok(JSON.stringify(Object.keys(CFG.FOOTPRINT)) === JSON.stringify(['well', 'tank', 'pump']), 'core.js still knows only well, tank, pump (unchanged); the other 11 buildings live only in the Building System until the integration phase');
console.log('CORE BRIDGE TESTS PASSED (' + n + ' checks)');
