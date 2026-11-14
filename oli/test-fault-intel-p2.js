/* FAULT INTELLIGENCE, PHASE 2 (read-only): root cause, fault dependency graph, facilities after the fault, lost production counted ONCE per well. node test-fault-intel-p2.js */
const H = require('./test-economy-helpers.js'), { game, put, pipe, chain } = H, ND = require('./network-diag.js'), FG = require('./fault-graph.js'); let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++, console.log('  ok ', n); else fail++, console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x).slice(0, 600)); };
const run = (g, o) => ND.run(g.store, g.net, Object.assign({ sim: g.sim, locate: () => 'z' }, o || {})), by = (r, c) => r.faults.filter(f => f.code === c);
const settle = g => { for (let i = 0; i < 40; i++) g.sim.step(g.sim.dt || 0.05); };
const snap = g => JSON.stringify({ items: [...g.store.items.values()], net: g.net.toJSON(), rev: g.net.rev, dirty: g.sim.dirty(), cash: g.store.cash, flows: [...g.net.lines.values()].map(L => [L.id, L.flow, L.over]) });
const sumUnique = r => { const m = new Map(); for (const g of r.rca.groups) for (const w of g.wells) m.set(w.id, w.loss); let s = 0; for (const v of m.values()) s += v; return Math.round(s * 10) / 10; };

console.log('A. a closed valve: ONE root, the symptoms hang on it');
{ const g = game(5e12), w = put(g, 'oil_well', 20, 40), v = put(g, 'valve', 30, 40), ct = put(g, 'crude_tank_m', 50, 38); pipe(g, w, 'OIL_OUT_E', v, 'IN'); pipe(g, v, 'OUT', ct, 'INPUT_W'); g.sim.setValve(v, 'CLOSED'); settle(g);
  const s0 = snap(g), r = run(g), R = r.rca, root = by(r, 'VALVE_CLOSED')[0];
  ok(R && R.groups.length === 1 && R.groups[0].rootNo === root.no && root.rca.role === 'ROOT', 'A1 one group; the root is the closed valve', R && R.groups.map(x => x.code));
  ok(by(r, 'DEAD_END')[0].rca.role === 'SYMPTOM' && by(r, 'BLOCKED')[0].rca.role === 'SYMPTOM' && by(r, 'DEAD_END')[0].rca.rootNo === root.no, 'A2 the dead end and the blocked well are symptoms of that root');
  ok(R.groups[0].wells.length === 1 && R.groups[0].wells[0].id === w.id && R.totals.wells === 1, 'A3 the well that lost production is attributed to it');
  ok(R.groups[0].downstream.items.some(i => i.id === ct.id) && R.groups[0].downstream.count === 1, 'A4 the facilities after the fault: the tank', R.groups[0].downstream);
  ok(R.totals.lostBblDay === sumUnique(r) && R.totals.lostBblDay > 0 && R.groups[0].wells[0].basis === 'engine', 'A5 lost production = the engine gap target - output, counted once', R.totals);
  ok(R.graph.edges.some(e => e.kind === 'CAUSES') && R.graph.edges.some(e => e.kind === 'STARVES') && R.graph.edges.some(e => e.kind === 'AFFECTS'), 'A6 the dependency graph has cause, starve and affect edges');
  ok(by(r, 'BLOCKED').every(f => f.trace.responsible && (f.trace.responsible.type === 'pipe' || f.trace.responsible.type === 'building')), 'A7b the analysis does not rewrite the inspector findings (trace.responsible keeps its original type)');
  ok(snap(g) === s0, 'A7 read-only: buildings, pipes, cash, flows unchanged by the analysis');
  const r2 = run(g, { crudePrice: 80 }); ok(r2.rca.totals.lostUsdDay === Math.round(r2.rca.totals.lostBblDay * 80) && r.rca.totals.lostUsdDay === null, 'A8 the money estimate appears only when a price is given'); }

console.log('B. cascade: one fault, many wells, and a second fault behind it: no double counting');
{ const g = game(5e12), v = put(g, 'valve', 40, 40), ct = put(g, 'crude_tank_m', 60, 38), ws = [30, 36, 42].map(y => put(g, 'oil_well', 10, y - 4)); let jn = 0;
  const j = put(g, 'junction', 28, 40); const L1 = pipe(g, j, 'PORT_E', v, 'IN'), L2 = pipe(g, v, 'OUT', ct, 'INPUT_W'); ws.forEach((w, i) => pipe(g, w, 'OIL_OUT_E', j, ['PORT_W', 'PORT_N', 'PORT_S'][i]));
  g.sim.setValve(v, 'CLOSED'); settle(g); const r = run(g), R = r.rca; ok(L1.ok !== false && L2.ok !== false, 'B0 scenario laid', [L1.reason, L2.reason]);
  ok(R.groups.length >= 1 && R.totals.lostBblDay === sumUnique(r), 'B1 totals equal the sum of UNIQUE wells (never a well twice)', [R.totals, sumUnique(r)]);
  const ids = R.groups.flatMap(x => x.wells.map(w => w.id)); ok(ids.length === new Set(ids).size, 'B2 no well sits in two groups', ids);
  const valveRoot = R.groups.find(x => x.element.id === v.id); ok(!!valveRoot && valveRoot.wells.length >= 1, 'B3 the valve is the root of the wells behind it', R.groups.map(x => [x.code, x.wells.length]));
  const cl = by(r, 'BLOCKED').concat(by(r, 'DEAD_END')); ok(cl.every(f => f.rca.role === 'SYMPTOM' || f.rca.role === 'ROOT'), 'B4 every symptom is attached to some root', cl.map(f => f.rca)); }
{ /* a root hidden behind another root: the nearer break claims the wells, the farther one is marked as masked */
  const g = game(5e12), w = put(g, 'oil_well', 20, 40), v1 = put(g, 'valve', 30, 40), v2 = put(g, 'valve', 40, 40), ct = put(g, 'crude_tank_m', 60, 38);
  pipe(g, w, 'OIL_OUT_E', v1, 'IN'); pipe(g, v1, 'OUT', v2, 'IN'); pipe(g, v2, 'OUT', ct, 'INPUT_W'); g.sim.setValve(v1, 'CLOSED'); g.sim.setValve(v2, 'CLOSED'); settle(g); const r = run(g), R = r.rca;
  ok(R.totals.lostBblDay === sumUnique(r) && new Set(R.groups.flatMap(x => x.wells.map(z => z.id))).size === R.groups.flatMap(x => x.wells.map(z => z.id)).length, 'B5 two closed valves in series: the lost barrels are counted once', R.groups.map(x => [x.label, x.lostBblDay]));
  const m = R.groups.filter(x => x.maskedBy); ok(R.groups.length >= 1 && m.every(x => R.groups.some(y => y.id === x.maskedBy)), 'B6 a root after another root names the one that masks it', R.groups.map(x => [x.id, x.maskedBy])); }

console.log('C. loops (rings of junctions) end and do not blow up');
{ const g = game(5e12), J = [[20, 20], [30, 20], [30, 30], [20, 30]].map(([x, y]) => put(g, 'junction', x, y)), w = put(g, 'oil_well', 8, 20), v = put(g, 'valve', 42, 20);
  const P = (a, ap, b, bp) => { try { const L = pipe(g, a, ap, b, bp); return !!(L && L.ok !== false); } catch (e) { return false; } };
  const laid = [P(w, 'OIL_OUT_E', J[0], 'PORT_W'), P(J[0], 'PORT_E', J[1], 'PORT_W'), P(J[1], 'PORT_S', J[2], 'PORT_N'), P(J[2], 'PORT_W', J[3], 'PORT_E'), P(J[3], 'PORT_N', J[0], 'PORT_S'), P(J[1], 'PORT_E', v, 'IN')];
  g.sim.setValve(v, 'CLOSED'); settle(g); const t0 = Date.now(); let r, thrown = null; try { r = run(g); } catch (e) { thrown = e; } const ms = Date.now() - t0;
  ok(!thrown && !!r && !!r.rca, 'C1 a ring does not throw and does not hang (' + ms + ' ms; pipes laid: ' + laid.filter(Boolean).length + ')', thrown && String(thrown.stack).slice(0, 300));
  if (r && r.rca) { const gs = r.rca.groups; ok(gs.every(x => x.downstream.count < 50), 'C2 the walk after a root visits each facility once', gs.map(x => x.downstream.count)); ok(r.rca.totals.lostBblDay === sumUnique(r), 'C3 the total is still the unique sum', r.rca.totals); }
  ok(ms < 1500, 'C4 fast', ms); }
{ /* the pure module, with a hand-made cyclic ctx: A -> B -> A */
  const faults = [{ no: 1, id: 1, code: 'VALVE_CLOSED', severity: 'MEDIUM', confirmed: false, element: { type: 'BUILDING', id: 1, label: 'V1' } }, { no: 2, id: 2, code: 'BLOCKED', severity: 'MEDIUM', element: { type: 'BUILDING', id: 7, label: 'W7' }, trace: { well: { id: 7 }, responsible: { type: 'building', id: 1, label: 'V1' }, cause: 'VALVE_CLOSED' } }, { no: 3, id: 3, code: 'BLOCKED', severity: 'MEDIUM', element: { type: 'BUILDING', id: 8, label: 'W8' }, trace: { well: { id: 8 }, responsible: { type: 'building', id: 1, label: 'V1' }, cause: 'VALVE_CLOSED' } }, { no: 4, id: 4, code: 'DEAD_END', severity: 'HIGH', element: { type: 'BUILDING', id: 1, label: 'V1' }, evidence: { wells: [7, 8, 9] } }];
  const R = FG.analyze({ faults, byId: id => ({ id }), label: e => e.label || '#' + e.id, wellLoss: id => ({ loss: id * 10, nominal: 100, basis: 'engine' }), downstream: () => ({ items: [], count: 0, truncated: false, members: new Set() }), outLines: () => [] });
  ok(R.groups.length === 1 && R.totals.wells === 3 && R.totals.lostBblDay === 240, 'C5 wells 7 and 8 (blocked) and 9 (dead end only) = 70 + 80 + 90 counted once each', R.totals);
  ok(faults[0].rca.role === 'ROOT' && faults[1].rca.role === 'SYMPTOM' && faults[3].rca.role === 'SYMPTOM', 'C6 roles are set on the findings'); }

console.log('D. a symptom with no fault behind it is its own root (no guessing)');
{ const g = game(5e12), w = put(g, 'oil_well', 20, 40), ct = put(g, 'crude_tank_m', 50, 38); pipe(g, w, 'OIL_OUT_E', ct, 'INPUT_W'); settle(g); const r = run(g); ok(r.rca.groups.length === 0 && r.rca.totals.lostBblDay === 0 && r.faults.length === 0, 'D1 a healthy line: no groups, no loss'); }

console.log('E. leftover pipes (Phase 1 merge) stay independent: they take no production');
{ const g = game(5e12), c = chain(g, true); settle(g); const L = g.net.lines.get(9), a = L.a.b, b = L.b.b; for (const id of [a, b]) g.store.demolish(id, { building: true, pipes: true, pipeSet: g.net }); g.net.rev++; settle(g); const r = run(g), f = by(r, 'MISSING_BUILDING').filter(x => x.element.id === 9)[0];
  ok(!!f && f.rca && f.rca.role !== 'SYMPTOM', 'E1 the leftover pipe is not a symptom of anything', f && f.rca); ok(r.rca.totals.lostBblDay === sumUnique(r), 'E2 totals consistent'); }

console.log('F. speed on a large network (limit 1500 ms; Phase 1 baseline ~90 ms)');
{ const g = game(1e15), COLS = 28, ROWS = 48; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const x = 4 + c * 13, y = 4 + r * 6; try { const w = put(g, 'oil_well', x, y), t = put(g, 'crude_tank_m', x + 7, y); pipe(g, w, 'OIL_OUT_E', t, 'INPUT_W'); } catch (e) { } }
  const els = g.store.items.size + g.net.lines.size; let n = 0; for (const L of g.net.lines.values()) if (n++ % 25 === 0) L.open = false; g.net.rev++; settle(g);
  const t0 = Date.now(), r = run(g), ms = Date.now() - t0, t1 = Date.now(); const r2 = run(g, { sim: null }), ms2 = Date.now() - t1;
  ok(els >= 2000 && r.rca.groups.length >= 20, 'F1 ' + els + ' elements, ' + r.rca.groups.length + ' roots analysed', [els, r.rca.groups.length]); ok(ms < 1500 && ms2 < 1500, 'F2 solved ' + ms + ' ms, unsolved ' + ms2 + ' ms', [ms, ms2]);
  ok(r.rca.totals.lostBblDay === sumUnique(r), 'F3 totals = unique sum on the large network'); }
console.log('\n' + (fail ? 'FAILED' : 'PASS') + ' ' + pass + ' ok, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
