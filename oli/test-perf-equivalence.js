/* performance fixes must not change results: tank kind cache follows every change of the network */
const { game, put, B, I } = require('./test-reserve-helpers.js'); let ok = 0, bad = 0; const t = (n, c) => { if (c) ok++; else { bad++; console.log('FAIL', n); } };
const g = game(1e12), tk = put(g, 'crude_tank_l', 20, 20), tk2 = put(g, 'crude_tank_l', 40, 20), w = put(g, 'oil_well', 30, 40);
t('no pipe: commercial', g.sim.tankKind(tk) === 'COMMERCIAL');
const r = I.layConnect(g.store, g.net, g.ts, w.id, tk.id, {}); t('well piped to tank: production', r.ok && g.sim.tankKind(tk) === 'PRODUCTION');
const r2 = I.layConnect(g.store, g.net, g.ts, tk.id, tk2.id, {}); t('downstream tank: production', r2.ok && g.sim.tankKind(tk2) === 'PRODUCTION' && g.sim.tankKind(tk) === 'PRODUCTION');
for (const id of r.lines || []) { g.net.remove ? g.net.remove(id) : 0; } 
g.sim.build(); const k1 = g.sim.tankKind(tk);
t('answers are stable between calls', g.sim.tankKind(tk) === k1 && g.sim.tankKind(tk2) === g.sim.tankKind(tk2));
console.log('PERF EQUIVALENCE:', ok, 'passed,', bad, 'failed'); process.exit(bad ? 1 : 0);
