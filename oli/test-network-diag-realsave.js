/* NETWORK DIAGNOSTICS on a REAL save, in node, repeatable.
 *   1. export your save once:  in the game page console  ->  copy(localStorage.getItem('oli-lab-v2'))  and paste it into  oli/local-saves/realsave.json   (the folder is git-ignored: a personal save is never committed)
 *   2. run:  npm run test:realsave        (or  SAVE=/any/path.json node test-network-diag-realsave.js)
 *   Skips cleanly when there is no save.  It asserts INVARIANTS of the inspector (no false alarm on sound connections, 1:1 with the engine's own flags, read-only) and prints the report, so any save can be checked. */
const fs = require('fs'), path = require('path'), assert = require('assert');
const SAVE = process.env.SAVE || path.join(__dirname, 'local-saves', 'realsave.json');
if (!fs.existsSync(SAVE)) { console.log('skipped: no real save at ' + SAVE + ' (see the header of this file)'); process.exit(0); }
const K = require('./test-central-kit.js'), { I, B, world } = K, E = require('./economy.js'), ND = require('./network-diag.js'), NC = require('./network-diag-central.js'), CF = require('./building-config.js');
let n = 0; const ok = (c, m, x) => { assert(c, m + (x === undefined ? '' : ' ' + JSON.stringify(x))); n++; console.log('  ok  ' + m); };
const d = JSON.parse(fs.readFileSync(SAVE, 'utf8')); assert(d && d.v === 2, 'not a v2 oli save');
const ts = B.fromWorld(world); if (d.wd) { world.restoreProgress(d.wd.p); world.restoreReserve(d.wd.r); world.restoreZones(d.wd.z); }
const r0 = B.BuildingStore.fromJSON(ts, d.store, { cash: d.cash }), store = r0.store; store.cash = d.cash; const net = I.PipeNet.fromJSON(ts.W, d.net), sim = new I.Sim(store, net), co = new E.Company(store, net, sim, { now: () => 1e12 });
co.fromJSON(d.eco); co.setSpeed(0); for (const b of store.list()) sim.ensure(b); co.advanceHours(2);
const C = net.central, snap = () => JSON.stringify({ s: store.toJSON({ live: true }), n: net.toJSON(), h: co.hours, c: store.cash });
console.log('save: ' + store.list().length + ' buildings, ' + net.lines.size + ' pipes, Central ' + (C ? C.st.size + ' stations / ' + C.seg.size + ' segments / ' + C.pumps.size + ' pumps' : 'none'));
const s0 = snap(), t0 = Date.now(), r = ND.run(store, net, { sim }), t1 = Date.now(), cr = NC.runCentral(store, net, { sim }), t2 = Date.now();
ok(snap() === s0, 'the two scans changed nothing (buildings, pipes, cash, hours identical)');
console.log('  oil     ', JSON.stringify(r.stats), (t1 - t0) + ' ms'); console.log('  central ', JSON.stringify(cr.stats), (t2 - t1) + ' ms');
const by = (rep, c) => rep.faults.filter(f => f.code === c);
ok(r.stats.solved && !r.faults.some(f => f.severity === 'CRITICAL' && f.confirmed === false), 'no unconfirmed finding is ever CRITICAL');
let hp = 0, ov = 0, sat = 0; for (const L of net.lines.values()) { if (L.hiP) hp++; if (L.over) { ov++; if ((L.flow || 0) / CF.PIPES[L.dia].capacity >= 0.95) sat++; } }
ok(by(r, 'HIGH_PRESSURE').length === hp && by(r, 'HIGH_PRESSURE').every(f => f.indicator && !f.confirmed), 'high pressure: one indicator per engine flag (' + hp + '), never a confirmed fault');
ok(by(r, 'OVER_CAPACITY').length === sat && by(r, 'OFFER_EXCEEDS').length === ov - sat, 'engine over flags (' + ov + '): ' + sat + ' sustained = confirmed, ' + (ov - sat) + ' instant offers = indicators');
ok(r.stats.faults === r.faults.filter(f => f.confirmed).length && r.stats.warnings + r.stats.indicators + r.stats.faults === r.faults.length, 'faults / warnings / indicators are counted apart and add up');
if (C && C.st.size) { ok(cr.stats.present && cr.stats.stations === C.st.size && cr.stats.segments === C.seg.size && cr.stats.pumps === C.pumps.size && cr.stats.checked === C.st.size + C.seg.size + C.pumps.size + 6, 'Central: every station, segment, pump and channel is counted (' + cr.stats.checked + ')');
  let flt = 0; for (const g of C.seg.values()) flt += Object.keys(g.fault).length; let pf = 0; for (const p of C.pumps.values()) if (p.fault) pf++; let cf = 0; for (const k in C.ch) if (C.ch[k].fault) cf++;
  ok(by(cr, 'C_SEG_FAULT').length === (flt ? by(cr, 'C_SEG_FAULT').length : 0) && by(cr, 'C_PUMP_FAULT').length === pf && by(cr, 'C_CH_FAULT').length === cf, 'Central: recorded faults (' + flt + ' segment channels, ' + pf + ' pumps, ' + cf + ' channels) all reported, nothing invented');
  ok(!cr.faults.some(f => f.confirmed && !['C_SEG_FAULT', 'C_PUMP_FAULT', 'C_CH_FAULT', 'C_CH_PARTITION', 'C_STATION_NO_BUILDING', 'C_BUILDING_NO_STATION', 'C_STATION_DAMAGED', 'C_STATION_ISOLATED', 'C_PUMP_NO_STATION', 'C_PUMP_NO_SEG', 'C_PUMP_SEG_FAR', 'C_SEG_NO_STATION'].includes(f.code)), 'Central: only structural / recorded-state findings are ever confirmed'); }
/* deliberate faults injected into the in-memory copy (the file on disk is never written): every one must be found, on the right element, at the right place */
if (C && C.st.size > 3) {
  const segs = [...C.seg.values()], g1 = segs.find(g => g.kind === 'main'), p1 = [...C.pumps.values()][0], st1 = C.st.get(p1.st), gl = segs.find(g => g.kind === 'loop');
  C.setFault(g1.id, 'GASOLINE', true); C.setPumpFault(p1.id, true); C.setChannel('DIESEL', 'CLOSED'); if (gl) C.setFault(gl.id, 'CRUDE', true);
  const c2 = NC.runCentral(store, net, { sim }), seg = c2.faults.find(f => f.code === 'C_SEG_FAULT' && f.element.id === g1.id), pf = c2.faults.find(f => f.code === 'C_PUMP_FAULT' && f.element.id === p1.id), cc = c2.faults.find(f => f.code === 'C_CH_CLOSED');
  ok(seg && seg.confirmed && g1.path.some(p => p[0] === seg.x && p[1] === seg.y), 'deliberate: the faulty segment ' + g1.id + ' is found, confirmed, at a tile of its own path (' + seg.x + ',' + seg.y + ')');
  ok(pf && pf.confirmed && pf.x === st1.x && pf.y === st1.y, 'deliberate: the faulty pump ' + p1.id + ' is found at its station (' + pf.x + ',' + pf.y + ')');
  ok(cc && !cc.confirmed && cc.element.id === 'DIESEL', 'deliberate: the closed DIESEL channel is a warning'); if (gl) ok(c2.faults.some(f => f.code === 'C_SEG_FAULT' && f.element.id === gl.id), 'deliberate: the faulty loop ' + gl.id + ' is found');
  console.log('  with faults ', JSON.stringify(c2.stats));
}
const lim = 1500; ok(t2 - t0 < lim, 'both scans together under ' + lim + ' ms (' + (t2 - t0) + ' ms)');
if (process.env.VERBOSE) for (const f of r.faults.concat(cr.faults)) console.log('   ', f.code, f.severity, f.confirmed ? 'C' : f.indicator ? 'I' : 'W', f.element.id, f.x + ',' + f.y);
console.log('\n' + n + ' passed');
