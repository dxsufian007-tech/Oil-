/* NETWORK DIAGNOSTICS - the Central network inspector (network-diag-central.js).   node test-network-diag-central.js */
const assert = require('assert'), CEN = require('./central.js'), NC = require('./network-diag-central.js');
let n = 0; const ok = (c, m, x) => { if (!c) { console.log('FAIL ' + m, x === undefined ? '' : JSON.stringify(x)); process.exitCode = 1; return; } n++; console.log('  ok  ' + m); };
const W = 2000;
const fakeStore = (items) => { const m = new Map(items.map(b => [b.id, b])); return { items: m, get: id => m.get(id), at: (x, y) => { for (const b of m.values()) if (b.d !== 'central_station' && x >= b.x && x < b.x + 3 && y >= b.y && y < b.y + 3) return b; return null; }, list: () => [...m.values()] }; };
/* a healthy ring of 4 stations (A-B-C-D-A) + a spur E; every station has a building; one pump per channel on A; branches on A and C */
function mk() {
  const C = new CEN.CentralNet(W), items = [], lines = new Map(); let bid = 1;
  const st = (id, x, y) => { const b = { id: bid++, d: 'central_station', x, y, r: 0, st: 'OPERATIONAL' }; items.push(b); C.addStation({ id, x, y, b: b.id }); const cl = []; for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) cl.push([x + i, y + j]); C.claimFootprint(id, cl); return b; };
  const A = st('A', 100, 100), B = st('B', 200, 100), Cc = st('C', 200, 200), D = st('D', 100, 200), E = st('E', 300, 100);
  const row = (x0, y0, x1, y1) => { const p = []; let x = x0, y = y0; p.push([x, y]); while (x !== x1) { x += Math.sign(x1 - x); p.push([x, y]); } while (y !== y1) { y += Math.sign(y1 - y); p.push([x, y]); } return p; };
  C.addSeg({ id: 'S1', kind: 'main', a: 'A', b: 'B', path: row(103, 101, 199, 101) }); C.addSeg({ id: 'S2', kind: 'main', a: 'B', b: 'C', path: row(201, 103, 201, 199) });
  C.addSeg({ id: 'S3', kind: 'loop', a: 'C', b: 'D', path: row(199, 201, 103, 201) }); C.addSeg({ id: 'S4', kind: 'loop', a: 'D', b: 'A', path: row(101, 199, 101, 103) }); C.addSeg({ id: 'S5', kind: 'main', a: 'B', b: 'E', path: row(203, 101, 299, 101) });
  for (const c of ['CRUDE', 'GASOLINE']) C.addPump({ id: 'P-' + c, st: 'A', ch: c, seg: 'S1', dir: 1 });
  lines.set(1, { id: 1, a: { b: A.id, port: 'GASOLINE_PORT' }, b: { b: 999, port: 'INPUT' } }); lines.set(2, { id: 2, a: { b: Cc.id, port: 'GASOLINE_PORT' }, b: { b: 998, port: 'INPUT' } });
  return { C, store: fakeStore(items), net: { lines, central: C }, items };
}
const by = (r, c) => r.faults.filter(f => f.code === c), run = (g, o) => NC.runCentral(g.store, g.net, o || {});
const snap = g => JSON.stringify({ c: g.C.toJSON(), ch: g.C.ch, it: g.items });
console.log('A. a sound network');
{ const g = mk(), s0 = snap(g), r = run(g); ok(r.faults.length === 0 && r.stats.faults === 0 && r.stats.warnings === 0 && r.stats.indicators === 0, 'A1 a healthy Central network: no fault, warning or indicator', r.faults.map(f => f.code));
  ok(r.stats.stations === 5 && r.stats.segments === 5 && r.stats.pumps === 2 && r.stats.channels === 6 && r.stats.checked === 18 && r.stats.healthy === 18 && r.stats.health === 100 && r.stats.branches === 2, 'A2 elements counted: 5 stations, 5 segments, 2 pumps, 6 channels (18) and 2 branches', r.stats);
  ok(r.healthySegs.length === 5, 'A3 every segment is in the healthy list (green overlay)'); ok(snap(g) === s0, 'A4 read-only: the network is identical after the scan'); ok(run({ C: new CEN.CentralNet(W), store: fakeStore([]), net: { lines: new Map(), central: new CEN.CentralNet(W) } }).stats.present === false, 'A5 a save without Central is reported as such'); }
console.log('B. deliberate faults');
{ const g = mk(); g.C.setFault('S3', 'GASOLINE', true); let r = run(g), f = by(r, 'C_SEG_FAULT');
  ok(f.length === 1 && f[0].element.id === 'S3' && f[0].severity === 'MEDIUM' && f[0].confirmed && /حلقة/.test(f[0].effect), 'B1 a faulty loop segment: confirmed, MEDIUM because the ring still carries the flow', f);
  g.C.setFault('S1', 'GASOLINE', true); g.C.setFault('S5', 'GASOLINE', true); r = run(g); f = by(r, 'C_SEG_FAULT'); const p = by(r, 'C_CH_PARTITION');
  ok(f.find(x => x.element.id === 'S5').severity === 'HIGH', 'B2 a faulty spur with no alternative is HIGH');
  ok(p.length === 1 && p[0].element.id === 'GASOLINE' && p[0].confirmed && /S1|S3|S5/.test(p[0].cause), 'B3 the gasoline channel is reported as partitioned and names the faulty segments', p.map(x => x.cause)); }
{ const g = mk(); g.C.setPumpFault('P-CRUDE', true); const r = run(g), f = by(r, 'C_PUMP_FAULT'); ok(f.length === 1 && f[0].element.id === 'P-CRUDE' && f[0].x === 100 && f[0].y === 100, 'B4 a faulty central pump is found at its station', f); }
{ const g = mk(); g.C.pumps.get('P-CRUDE').seg = 'S3'; g.C.pumps.get('P-GASOLINE').seg = null; const r = run(g); ok(by(r, 'C_PUMP_SEG_FAR').length === 1 && by(r, 'C_PUMP_NO_SEG').length === 1, 'B5 a pump on a segment that does not touch its station, and a pump with no segment'); }
{ const g = mk(); g.C.pumps.get('P-CRUDE').st = 'ZZ'; const r = run(g); ok(by(r, 'C_PUMP_NO_STATION').length === 1, 'B6 a pump whose station does not exist'); }
{ const g = mk(); g.items.splice(0, 1); g.store = fakeStore(g.items); const r = run(g), f = by(r, 'C_STATION_NO_BUILDING'); ok(f.length === 1 && f[0].element.id === 'A' && f[0].severity === 'HIGH', 'B7 a station whose building was deleted', f.map(x => x.element.id)); }
{ const g = mk(); g.items.push({ id: 77, d: 'central_station', x: 400, y: 400, r: 0, st: 'OPERATIONAL' }); g.store = fakeStore(g.items); const r = run(g); ok(by(r, 'C_BUILDING_NO_STATION').length === 1, 'B8 a Central building that is not a station of the trunk'); }
{ const g = mk(); g.C.seg.get('S5').b = 'GONE'; const r = run(g), f = by(r, 'C_SEG_NO_STATION'); ok(f.length === 1 && f[0].element.id === 'S5' && f[0].severity === 'CRITICAL', 'B9 a segment whose end station is missing is CRITICAL'); }
{ const g = mk(); g.C.seg.delete('S5'); g.C.rev++; const r = run(g), f = by(r, 'C_STATION_ISOLATED'); ok(f.length === 1 && f[0].element.id === 'E' && !f[0].confirmed && f[0].severity === 'LOW', 'B10 a station with no segment and no branch: a LOW warning (unused)', f.map(x => x.severity)); }
{ const g = mk(); g.C.seg.delete('S5'); g.net.lines.set(3, { id: 3, a: { b: g.items[4].id, port: 'GASOLINE_PORT' }, b: { b: 997, port: 'INPUT' } }); const r = run(g), f = by(r, 'C_STATION_ISOLATED'); ok(f.length === 1 && f[0].severity === 'HIGH' && f[0].confirmed, 'B11 the same station with a branch: HIGH and confirmed'); }
{ const g = mk(); g.C.addStation({ id: 'X1', x: 600, y: 600 }); g.C.addStation({ id: 'X2', x: 700, y: 600 }); g.C.addSeg({ id: 'SX', kind: 'main', a: 'X1', b: 'X2', path: [[603, 601], [604, 601]] }); const r = run(g), f = by(r, 'C_NET_SPLIT'); ok(f.length === 1 && !f[0].confirmed && /2 /.test(f[0].cause), 'B12 a separate trunk island is a warning', f.map(x => x.cause)); }
{ const g = mk(); g.C.setChannelFault('WATER', true); g.C.setChannel('DIESEL', 'CLOSED'); const r = run(g); ok(by(r, 'C_CH_FAULT').length === 1 && by(r, 'C_CH_FAULT')[0].severity === 'CRITICAL' && by(r, 'C_CH_CLOSED').length === 1 && !by(r, 'C_CH_CLOSED')[0].confirmed, 'B13 a faulty channel is confirmed CRITICAL, a closed one is a warning'); }
{ const g = mk(); g.C.seg.get('S1').path[10] = [150, 150]; g.items.push({ id: 55, d: 'oil_well', x: 120, y: 101, r: 0, st: 'OPERATIONAL' }); g.store = fakeStore(g.items); const r = run(g); ok(by(r, 'C_SEG_GAP').length === 1 && by(r, 'C_SEG_ON_BUILDING').length === 1 && by(r, 'C_SEG_GAP')[0].severity === 'MEDIUM' && !by(r, 'C_SEG_GAP')[0].confirmed, 'B14 a broken drawing and a path across a building are warnings (flow follows the registered link)'); }
{ const g = mk(), r = run(g, { sim: { dirty: () => false } }); g.C.seg.get('S1').f.GASOLINE.flow = 290000; g.C.ch.CRUDE.pressure = 3500; const r2 = run(g, { sim: { dirty: () => false } });
  ok(by(r2, 'C_SEG_NEAR_CAP').length === 1 && by(r2, 'C_CH_HIGH_PRESSURE').length === 1 && by(r2, 'C_CH_HIGH_PRESSURE')[0].indicator && r2.stats.indicators === 1 && r2.stats.faults === 0, 'B15 near capacity is a warning; channel pressure over its rating is an INDICATOR, not a fault', r2.stats);
  ok(run(g, { sim: { dirty: () => true } }).faults.length === 0, 'B16 when the simulation is stale the flow/pressure checks are skipped (and the report says so)'); }
console.log('C. several faults at once + ordering');
{ const g = mk(); g.C.setFault('S5', 'WATER', true); g.C.setPumpFault('P-GASOLINE', true); g.C.setChannelFault('JET_FUEL', true); g.C.seg.get('S2').a = 'GONE'; const r = run(g); ok(r.faults.length >= 4 && r.faults[0].code === 'C_SEG_NO_STATION' && r.faults.every((f, i) => f.no === i + 1) && r.faults.slice(0, r.stats.faults).every(f => f.confirmed), 'C1 several faults: numbered, critical first, confirmed before warnings', r.faults.map(f => f.code)); }
console.log('D. a large Central network');
{ const C = new CEN.CentralNet(W), items = [], lines = new Map(); const N = 2000; for (let i = 0; i < N; i++) { items.push({ id: i + 1, d: 'central_station', x: (i % 50) * 10, y: Math.floor(i / 50) * 10, r: 0, st: 'OPERATIONAL' }); C.addStation({ id: 'S' + i, x: (i % 50) * 10, y: Math.floor(i / 50) * 10, b: i + 1 }); }
  let k = 0; for (let i = 0; i < N - 1; i++) if (i % 50 !== 49) C.addSeg({ id: 'G' + k++, kind: 'main', a: 'S' + i, b: 'S' + (i + 1), path: [[(i % 50) * 10 + 3, Math.floor(i / 50) * 10 + 1], [(i % 50) * 10 + 4, Math.floor(i / 50) * 10 + 1], [(i % 50) * 10 + 5, Math.floor(i / 50) * 10 + 1]] });
  for (let i = 0; i < N - 50; i += 7) C.addSeg({ id: 'G' + k++, kind: 'loop', a: 'S' + i, b: 'S' + (i + 50), path: [[(i % 50) * 10 + 1, Math.floor(i / 50) * 10 + 3], [(i % 50) * 10 + 1, Math.floor(i / 50) * 10 + 4]] });
  for (let i = 0; i < N; i += 3) C.addPump({ id: 'U' + i, st: 'S' + i, ch: 'CRUDE', seg: null }); const g = { C, store: fakeStore(items), net: { lines, central: C } }; const t = Date.now(), r = run(g), ms = Date.now() - t;
  ok(r.stats.stations === 2000 && r.stats.segments === k && ms < 1500, 'D1 ' + r.stats.checked + ' Central elements scanned in ' + ms + ' ms', { ms, stats: r.stats }); }
console.log('\n' + n + ' passed'); if (process.exitCode) process.exit(1);
