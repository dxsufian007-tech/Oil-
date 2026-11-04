/* Oli - bench-scale.js  (performance: how the simulation and the economy scale with the number of buildings on one map)
 * Places N buildings (wells, tanks, separators, pumps, refineries, valves, junctions) on the 400 x 300 test world, then measures:
 *   - the economy tick (one game hour, averaged), the company summary (what the screens call), save and load time and size, heap memory.
 * Run:  NODE_PATH=/opt/npm-tools/node_modules node --expose-gc bench-scale.js 500 1000 2000 3000 4000 5000
 */
const fs = require('fs'); const { B, EC, game, put } = require('./test-economy-helpers.js');
const MIX = ['oil_well', 'crude_tank_s', 'oil_well', 'junction', 'oil_well', 'gasoline_tank_s', 'separator', 'valve', 'oil_well', 'pump_station_s'];
const sizes = process.argv.slice(2).map(Number).filter(Boolean); if (!sizes.length) sizes.push(500, 1000, 2000, 3000, 4000, 5000);
const gc = () => { if (global.gc) global.gc(); };
const heapMB = () => { gc(); return process.memoryUsage().heapUsed / 1048576; };
const rows = [];
for (const N of sizes) {
  const h0 = heapMB();
  const cfg = JSON.parse(JSON.stringify(EC)); cfg.STORAGE_COST = { CRUDE: 0.001, GASOLINE: 0.001, DIESEL: 0.001, JET_FUEL: 0.001, GAS: 0.001 };
  const g = game(1e12, cfg), co = g.co; let placed = 0, k = 0; const t0 = process.hrtime.bigint();
  outer: for (let y = 2; y < 296; y += 3) for (let x = 2; x < 398; x += 3) { if (placed >= N) break outer; const d = MIX[k++ % MIX.length]; try { const v = g.store.place(d, x, y, 0, { instant: true }); if (v && v.ok) placed++; } catch (_) { /* slot unusable */ } }
  const placeMs = Number(process.hrtime.bigint() - t0) / 1e6;
  co.speed = 0; co.sync();
  // economy tick: one game day = 24 hourly ticks, time per hour
  const hours = +(process.env.HOURS || 24), t1 = process.hrtime.bigint(); co.advanceHours(hours); const tickMs = Number(process.hrtime.bigint() - t1) / 1e6 / hours;
  const t2 = process.hrtime.bigint(); for (let i = 0; i < 20; i++) co.summary(); const sumMs = Number(process.hrtime.bigint() - t2) / 1e6 / 20;
  const t3 = process.hrtime.bigint(); const json = JSON.stringify(co.toJSON()); const saveMs = Number(process.hrtime.bigint() - t3) / 1e6;
  const t4 = process.hrtime.bigint(); const g2 = game(1e12, cfg); g2.co.fromJSON(JSON.parse(json)); const loadMs = Number(process.hrtime.bigint() - t4) / 1e6;
  if (process.env.SNAP) { const r6 = v => Math.round(v * 1e6) / 1e6, j = co.journal.bal, snap = { N: placed, hours: co.hours, cash: r6(g.store.cash), journal: Object.fromEntries(Object.keys(j).map(k => [k, r6(j[k])])), qty: Object.fromEntries(Object.keys(co.qty).map(k => [k, r6(co.qty[k])])), produced: Object.fromEntries(Object.keys(co.led.life.produced).map(k => [k, r6(co.led.life.produced[k])])), value: r6(co.summary().value), buildings: g.store.list().map(b => [b.id, b.st, r6(b.c), b.s ? r6(b.s.vol || 0) : 0]) }; fs.appendFileSync(process.env.SNAP, JSON.stringify(snap) + '\n'); }
  const mem = heapMB() - h0;
  rows.push({ buildings: placed, placeMs: +placeMs.toFixed(0), tickMsPerHour: +tickMs.toFixed(2), summaryMs: +sumMs.toFixed(2), saveMs: +saveMs.toFixed(0), saveKB: Math.round(json.length / 1024), loadMs: +loadMs.toFixed(0), heapMB: +mem.toFixed(1) });
  console.log(JSON.stringify(rows[rows.length - 1]));
}
console.log('\nbuildings | place ms | tick ms/hour | summary ms | save ms | save KB | load ms | heap MB');
for (const r of rows) console.log([r.buildings, r.placeMs, r.tickMsPerHour, r.summaryMs, r.saveMs, r.saveKB, r.loadMs, r.heapMB].join(' | '));
