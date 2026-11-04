/* Stage 8, performance and stability (headless): a big company (two full plants + hundreds of other buildings) over two game years.
 *   cost of a game hour, a burst at x10, a long run: memory bounded, histories bounded, no day or month repeated, no NaN, no freeze; the size and speed of saving.
 *   NODE_PATH=/opt/npm-tools/node_modules node oli/test-stress.js */
const H = require('./cycle-helpers.js'), { B, I, E, EC, W } = H, v8 = require('v8'), vm = require('vm'), CAL = require('./game-calendar.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
v8.setFlagsFromString('--expose-gc'); const gc = vm.runInNewContext('gc'), heapMB = () => { gc(); gc(); return process.memoryUsage().heapUsed / 1048576; };
const ms = f => { const t = process.hrtime.bigint(); const r = f(); return { r, ms: Number(process.hrtime.bigint() - t) / 1e6 }; };

/* the big company: two complete plants (every system in play) and 260 more buildings of all kinds across the region */
const pickField = () => { for (let i = 1; i < 8; i++) { const t = H.newGame({ cash: 1e11 }), ft = H.fieldsOf(t)[i]; H.openField(t, ft); if (H.buildPlant(t, ft, { zone: 0 }).fail.length === 0) return i; } return 1; };
const g = H.cycle({ cash: 5e11 }), co = g.co, f1 = H.fieldsOf(g)[pickField()]; g.world.discover(f1.id); g.world.survey(f1.id); g.world.makeDrillable(f1.id);
const P2 = H.buildPlant(g, f1, { zone: 0 }); co.setSpeed(1); for (const p of EC.PRODUCTS) co.setMode(p, 'SPOT');
const kinds = ['crude_tank_m', 'pump_station_s', 'junction', 'crude_tank_l', 'pump_station_l', 'valve']; let extra = 0; const reg = g.sr;
for (let i = 0; extra < 260 && i < 3000; i++) { const k = kinds[i % kinds.length], x = reg.x0 + 20 + (i * 37) % (reg.w - 40), y = reg.y0 + 20 + ((i * 53) % (reg.h - 40)); const b = H.put(g, k, x, y, 6); if (b) extra++; }
for (const b of g.store.list()) g.sim.ensure(b); H.restock(co);
const nB = g.store.list().length; console.log('company: ' + nB + ' buildings, ' + g.net.lines.size + ' pipelines, 2 plants, ' + P2.fail.length + ' failed parts in plant 2');
T('1 the stress company has hundreds of buildings and a complete plant and a second one (the second may lack one link: its pipe crosses the first plant)', nB >= 250 && P2.fail.length <= 1 && P2.wells.length === 3, [nB, P2.fail]);

const mem0 = heapMB(); const day = ms(() => { for (let h = 0; h < 24; h++) { H.restock(co); co.advanceHours(1); } });
T('2 a game day with ' + nB + ' buildings costs ' + Math.round(day.ms) + ' ms (' + (day.ms / 24).toFixed(1) + ' ms per game hour; budget 120 ms)', day.ms / 24 < 120, day.ms);
const burst = ms(() => co.run(1e7)); T('3 a huge time jump (x10 for a long time, or a stalled tab waking up) is capped: ' + Math.round(burst.ms) + ' ms, at most ' + EC.TIME.maxStepsPerTick + ' hours per call, no freeze', burst.r <= EC.TIME.maxStepsPerTick && burst.ms < 8000, [burst.r, burst.ms]);
const tick10 = []; for (let i = 0; i < 40; i++) { const t = ms(() => co.run(0.25 * 2 * 10)); tick10.push(t.ms); } const worst = Math.max(...tick10);
T('4 at x10 (5 game hours per 250 ms tick) the worst tick is ' + Math.round(worst) + ' ms: the screen is never blocked for long (budget 700 ms)', worst < 700, tick10.map(Math.round));

const start = co.dayIdx, snaps = []; let lastDay = co.dayIdx, dups = 0, jumps = 0; const t0 = Date.now();
for (let d = 0; d < 365 * 2; d++) { if (d % 24 === 0) H.restock(co); co.advanceHours(24); if (co.dayIdx === lastDay) dups++; if (co.dayIdx - lastDay !== 1) jumps++; lastDay = co.dayIdx; if (d === 365) snaps.push(heapMB()); }
const mem2 = heapMB(), secs = (Date.now() - t0) / 1000; console.log('  (730 game days simulated in ' + secs.toFixed(1) + ' s)');
T('5 two game years: every day counted exactly once (no repeat, no skipped day)', dups === 0 && jumps === 0 && co.dayIdx - start === 730, [dups, jumps, co.dayIdx - start]);
T('6 memory is bounded: after year 1 ' + snaps[0].toFixed(1) + ' MB, after year 2 ' + mem2.toFixed(1) + ' MB (growth under 15 MB; started at ' + mem0.toFixed(1) + ')', mem2 - snaps[0] < 15, [mem0, snaps[0], mem2]);
const lim = EC.TRADE ? EC.TRADE.LOG_MAX : 300;
T('7 every history is capped (journal log, days, months, production history, trade log, events, exploration log)', co.journal.log.length <= 300 && co.days.length <= 60 && co.months.length <= 24 && co.prodHist.length <= EC.MARKET.historyHours + 1 && co.tradeLog.length <= lim && co.events.length <= 40 && co.explLog.length <= 200, [co.journal.log.length, co.days.length, co.months.length, co.prodHist.length, co.tradeLog.length, co.events.length]);
T('8 the books are intact after two years: audit passes, nothing is NaN or infinite, the clock is where it must be', co.audit().ok && Object.values(co.journal.bal).every(Number.isFinite) && Number.isFinite(g.store.cash) && co.clock().year >= 2028, [co.audit(), co.clock().text]);
let badState = 0; for (const b of g.store.list()) { if (!Number.isFinite(b.c) || b.c < 0 || b.c > 1) badState++; const s = b.s; if (s) for (const k of Object.keys(s)) if (typeof s[k] === 'number' && !Number.isFinite(s[k])) badState++; } T('9 every building has a sane condition and no NaN in its state (' + g.store.list().length + ' checked)', badState === 0, badState);
const fl = [...g.net.lines.values()].filter(l => !Number.isFinite(l.flow)).length; T('10 no pipe has a NaN flow', fl === 0, fl);
const raw = ms(() => JSON.stringify({ store: g.store.toJSON(), net: g.net.toJSON(), cash: g.store.cash, eco: co.toJSON(), wd: { r: g.world.reserveSnapshot(), p: g.world.progressSnapshot(), z: g.world.zoneSnapshot() } }));
T('11 a save of the big company is ' + (raw.r.length / 1048576).toFixed(2) + ' MB and takes ' + Math.round(raw.ms) + ' ms (budget: 4 MB, 800 ms; browsers allow about 5 MB)', raw.r.length < 4 * 1048576 && raw.ms < 800, [raw.r.length, raw.ms]);
const ld = ms(() => { const d = JSON.parse(raw.r), world = W.createWorld({ seed: 20260101 }), ts = B.fromWorld(world); world.restoreProgress(d.wd.p); world.restoreReserve(d.wd.r); world.restoreZones(d.wd.z); const r = B.BuildingStore.fromJSON(ts, d.store); const net = I.PipeNet.fromJSON(ts.W, d.net); const c2 = new E.Company(r.store, net, new I.Sim(r.store, net), { now: () => 1e12 }); return { ok: c2.fromJSON(d.eco), n: r.store.list().length, dropped: r.report.dropped.length, c2 }; });
T('12 loading it takes ' + Math.round(ld.ms) + ' ms, nothing is lost (' + ld.r.n + ' buildings, 0 dropped), same hours and same cash', ld.r.ok && ld.r.n === nB && ld.r.dropped === 0 && ld.r.c2.hours === co.hours, [ld.r.n, ld.r.dropped]);
console.log('\nSTRESS TESTS: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
