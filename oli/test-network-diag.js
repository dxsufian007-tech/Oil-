/* NETWORK DIAGNOSTICS: the inspector finds every fault, names the right element and place, reports nothing on a healthy network, never changes anything, and stays fast on thousands of elements */
const H = require('./test-economy-helpers.js'), { game, put, pipe, chain, I, B } = H, ND = require('./network-diag.js'); let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++, console.log('  ok ', n); else fail++, console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x).slice(0, 600)); };
const snap = g => JSON.stringify({ items: [...g.store.items.values()], net: g.net.toJSON(), rev: g.net.rev, dirty: g.sim.dirty(), cash: g.store.cash, nl: g.net.lines.size, flows: [...g.net.lines.values()].map(L => [L.id, L.flow, L.over, L.hiP, L.lowP, L.pressure]) });
const mk = (full) => { const g = game(5e12), c = chain(g, full !== false); g.sim.step ? 0 : 0; return { g, c }; };
const run = (g, o) => ND.run(g.store, g.net, Object.assign({ sim: g.sim, locate: (x, y) => 'C' + (x >> 6) + (y >> 6) }, o || {}));
const by = (r, code) => r.faults.filter(f => f.code === code);
const settle = g => { for (let i = 0; i < 40; i++) g.sim.step(g.sim.dt || 0.05); };

console.log('A. a healthy network reports nothing');
{ const { g } = mk(); let r = run(g); ok(r.faults.length === 0 && r.stats.health === 100, 'A1 the full oil chain (wells, junction, pump, separator, tank, refinery, 4 product stores): no faults, no warnings', r.faults.map(f => f.code));
  ok(r.stats.buildings === 12 && r.stats.lines === 11 && r.stats.checked === 23 && r.stats.healthyConnections === 11, 'A2 counts: 12 buildings + 11 lines checked, 11 healthy connections', r.stats);
  settle(g); r = run(g); ok(r.stats.solved && r.faults.every(f => f.code !== 'DEAD_END') , 'A3 after the simulation has run, still no structural fault', r.faults.map(f => f.code + ':' + f.element.label));
  const s0 = snap(g); run(g); run(g, { sim: null }); ok(snap(g) === s0, 'A4 the inspection changes nothing: buildings, lines, flows, cash and the simulation are identical before and after'); }

console.log('B. a detached pipe (open end)');
{ const { g, c } = mk(), L = g.net.lines.get(6); const tail = L.path[L.path.length - 1]; L.b = null; g.net.rev++; const r = run(g), f = by(r, 'OPEN_END');
  ok(f.length === 1 && f[0].element.id === 6 && f[0].element.label === 'PIPE-6' && f[0].severity === 'CRITICAL' && f[0].confirmed, 'B1 OPEN_END on PIPE-6, critical, confirmed', r.faults.map(f => f.code));
  ok(f[0].x === tail[0] && f[0].y === tail[1], 'B2 located at the free end of the pipe (' + tail + ')', [f[0].x, f[0].y]);
  ok(/Separator|فاصل|separator/i.test(f[0].prev || '') || /#/.test(f[0].prev || ''), 'B3 the previous element is named', f[0].prev);
  const d = by(r, 'DEAD_END'); ok(d.length === 1 && d[0].element.id === c.sep.id && d[0].evidence.wells.length === 3, 'B4 the path of the 3 wells is reported as ending at the separator (no wrong element)', d.map(x => x.element.label));
  ok(/برميل\/يوم/.test(d[0].effect) && /7,500/.test(d[0].effect), 'B5 the effect quantifies the lost production from the real well capacities (3 x 2,500)', d[0].effect);
  ok(r.stats.faults >= 2 && r.stats.health < 100, 'B6 the health figure drops'); }

console.log('C. a wrong connection');
{ const { g, c } = mk(), L = g.net.lines.get(6); L.b = { b: c.ct.id, port: 'INPUT_N' }; g.net.rev++; const r = run(g), f = by(r, 'WRONG_POINT');
  ok(f.length === 1 && f[0].element.id === 6 && f[0].severity === 'CRITICAL', 'C1 WRONG_POINT on PIPE-6', r.faults.map(f => f.code));
  ok(/INPUT_N/.test(f[0].cause) && /\(\d+,\d+\)/.test(f[0].cause), 'C2 the cause names the port and the exact tiles', f[0].cause); }
{ const { g, c } = mk(); g.net.lines.get(6).a = { b: 99999, port: 'OIL_OUT' }; g.net.rev++; const r = run(g); ok(by(r, 'MISSING_BUILDING').length === 1 && by(r, 'MISSING_BUILDING')[0].element.id === 6, 'C3 a pipe that points to a deleted building is found'); }
{ const { g, c } = mk(); g.net.lines.get(6).b = { b: c.ct.id, port: 'NOPE' }; g.net.rev++; const r = run(g); ok(by(r, 'BAD_PORT').length === 1, 'C4 a port that does not exist is found'); }
{ const { g, c } = mk(); const L = g.net.lines.get(8); L.b = { b: c.td.id, port: 'INPUT_W' }; g.net.rev++; const r = run(g); ok(by(r, 'PRODUCT_MISMATCH').length >= 1 && by(r, 'PRODUCT_MISMATCH')[0].element.id === 8, 'C5 gasoline pipe attached to a diesel tank: product mismatch on PIPE-8', r.faults.map(f => f.code)); }

console.log('D. wrong direction');
{ const { g, c } = mk(), L = g.net.lines.get(6); const t = L.a; L.a = L.b; L.b = t; L.path = L.path.slice().reverse(); g.net.rev++; const r = run(g), f = by(r, 'WRONG_DIRECTION');
  ok(f.length === 2 && f.every(x => x.element.id === 6 && x.severity === 'MEDIUM' && !x.confirmed), 'D1 both ends of the reversed PIPE-6 are reported', f.map(x => x.cause.slice(0, 40)));
  ok(by(r, 'DEAD_END').length === 0, 'D2 a reversed registration still flows (the engine edge has no fixed direction): no false dead end', r.faults.map(f => f.code)); }

console.log('E. a pump that is not connected');
{ const { g, c } = mk(); g.net.remove(4); const r = run(g), f = by(r, 'PUMP_DISCONNECTED');
  ok(f.length === 1 && f[0].element.id === c.pump.id && /دخول/.test(f[0].cause), 'E1 the pump with no inlet is found (its own id, "no inlet")', r.faults.map(f => f.code + ':' + f[0]));
  const d = by(r, 'DEAD_END'); ok(d.length === 1 && d[0].element.id === c.jn.id && /لا يوجد أي أنبوب/.test(d[0].cause), 'E2 the oil from the wells is reported as stopping at the junction (nothing leaves it)', d.map(x => x.cause)); }
{ const g = game(5e12), w = put(g, 'oil_well', 20, 40), p = put(g, 'pump_station_s', 40, 40); const r = run(g);
  ok(by(r, 'ISOLATED').length === 2, 'E3 an isolated well and an isolated pump are both reported', r.faults.map(f => f.code)); }

console.log('F. capacity, pressure, bottleneck (engine results)');
{ const { g, c } = mk(); settle(g); const L = g.net.lines.get(5); L.over = true; L.flow = 140000; L.pressure = 3500; L.hiP = true; L.lowP = true; const r = run(g);
  ok(by(r, 'OVER_CAPACITY').length === 1 && by(r, 'OVER_CAPACITY')[0].element.id === 5 && by(r, 'OVER_CAPACITY')[0].severity === 'HIGH', 'F1 over capacity on PIPE-5 from the simulation result', r.faults.map(f => f.code));
  ok(by(r, 'HIGH_PRESSURE').some(f => f.element.id === 5) && by(r, 'LOW_PRESSURE').some(f => f.element.id === 5), 'F2 high and low pressure read from the engine');
  L.over = false; L.hiP = L.lowP = false; L.flow = 98000; const r2 = run(g), n = by(r2, 'NEAR_CAPACITY'); ok(n.length === 1 && !n[0].confirmed && n[0].severity === 'LOW', 'F3 98% of capacity is a WARNING (not a confirmed fault)', r2.faults.map(f => f.code));
  ok(r2.stats.warnings === 1 && r2.stats.faults === 0, 'F4 warnings and faults are counted separately', r2.stats);
  const g2 = game(5e12), w = [put(g2, 'oil_well', 20, 36), put(g2, 'oil_well', 20, 40), put(g2, 'oil_well', 20, 44)], jn = put(g2, 'junction', 28, 40), pm = put(g2, 'pump_station_s', 34, 40), ct = put(g2, 'crude_tank_m', 50, 38);
  ['PORT_N', 'PORT_W', 'PORT_S'].forEach((p, i) => pipe(g2, w[i], 'OIL_OUT_E', jn, p)); pipe(g2, jn, 'PORT_E', pm, 'INPUT'); pipe(g2, pm, 'OUTPUT', ct, 'INPUT_W');
  for (let i = 0; i < 60; i++) g2.sim.step(g2.sim.dt || 0.05); let r3 = run(g2); ok(r3.stats.solved && r3.faults.length === 0, 'F5 real engine run: a small pump fed by 3 wells (4,579 of 5,000 bbl/day) is NOT flagged (no false alarm below the limit)', r3.faults.map(f => f.code));
  pm.s._sat = true; r3 = run(g2); const eo = by(r3, 'ELEMENT_OVERLOAD'); ok(eo.length === 1 && eo[0].element.id === pm.id && eo[0].severity === 'HIGH', 'F6 when the engine reports the pump saturated, the finding sits on that pump', r3.faults.map(f => f.code)); }
console.log('G. closed paths');
{ const { g, c } = mk(); I.setLineOpen(g.net, 6, false); const r = run(g), f = by(r, 'CLOSED_LINE');
  ok(f.length === 1 && f[0].element.id === 6 && !f[0].confirmed && f[0].severity === 'MEDIUM', 'G1 a closed pipe is a warning on the right pipe', r.faults.map(f => f.code));
  const d = by(r, 'DEAD_END'); ok(d.length === 1 && d[0].element.id === c.sep.id && /PIPE-6/.test(d[0].cause) && /مغلق/.test(d[0].cause), 'G2 the dead end is the separator and the cause names PIPE-6 as closed', d.map(x => x.cause)); }
{ const g = game(5e12), w = put(g, 'oil_well', 20, 40), v = put(g, 'valve', 30, 40), ct = put(g, 'crude_tank_m', 50, 38); pipe(g, w, 'OIL_OUT_E', v, 'IN'); pipe(g, v, 'OUT', ct, 'INPUT_W'); g.sim.setValve(v, 'CLOSED'); let r = run(g);
  ok(by(r, 'VALVE_CLOSED').length === 1 && by(r, 'DEAD_END').length === 1 && by(r, 'DEAD_END')[0].element.id === v.id && /مغلق/.test(by(r, 'DEAD_END')[0].cause), 'G4 a closed valve in the path: warning + the dead end names the valve', r.faults.map(f => f.code));
  g.sim.setValve(v, 'FAULT'); r = run(g); ok(by(r, 'VALVE_FAULT').length === 1 && by(r, 'VALVE_FAULT')[0].severity === 'HIGH', 'G5 a faulty valve is a high-severity fault');
  g.sim.setValve(v, 'OPEN'); r = run(g); ok(r.faults.length === 0, 'G6 opening it clears everything (re-check after repair)', r.faults.map(f => f.code)); }

console.log('H. conflicts');
{ const { g, c } = mk(); const L = g.net.lines.get(6), m = L.path.length >> 1; L.path[m] = [L.path[m][0] + 5, L.path[m][1]]; g.net.rev++; const r = run(g); ok(by(r, 'BROKEN_PATH').length >= 1 && by(r, 'BROKEN_PATH')[0].element.id === 6, 'H1 a pipe whose tiles are not adjacent is reported as broken', r.faults.map(f => f.code)); }
{ const { g, c } = mk(); const L = g.net.lines.get(6); const b = c.ct; L.path[3] = [b.x, b.y]; g.net.rev++; const r = run(g); const f = by(r, 'PATH_BLOCKED'); ok(f.length === 1 && f[0].element.id === 6 && f[0].x === b.x && f[0].y === b.y && /#/.test(f[0].cause), 'H2 a pipe path inside a building is a conflict, at the right tile', r.faults.map(f => f.code)); }
{ const { g, c } = mk(); g.net.lay({ a: { b: c.wells[0].id, port: 'OIL_OUT_E' }, b: { b: c.jn.id, port: 'PORT_N' }, path: [[21, 36]], product: 'CRUDE', dia: 16 }); const r = run(g); ok(by(r, 'PORT_TWICE').length >= 1 && by(r, 'TILE_SHARED').length >= 1, 'H3 two pipes on the same port and tile are conflicts', r.faults.map(f => f.code)); }
{ const g = game(5e12), a = put(g, 'oil_well', 20, 40), pe = B.worldPoints(a).find(p => p.id === 'OIL_OUT_E'); let hit = null; for (let bx = pe.ax - 3; bx <= pe.ax + 3 && !hit; bx++) for (let by2 = pe.ay - 3; by2 <= pe.ay + 3 && !hit; by2++) { const v = g.store.validate('oil_well', bx, by2, 0, { ignoreCash: true }); if (v.ok) { const w = g.store.place('oil_well', bx, by2, 0, { instant: true }).building; if (B.worldPoints(w).some(q => q.x === pe.ax && q.y === pe.ay && q.ax === pe.x && q.ay === pe.y)) hit = w; else g.store.demolish(w.id, { building: true, pipes: true }); } }
  const r = run(g); ok(hit && by(r, 'FACING_MISMATCH').length === 0, 'H4 two wells whose outlets touch face to face (out/out): harmless, no noise', r.faults.map(f => f.code)); }

console.log('I. several faults at once, each with its element and place');
{ const { g, c } = mk(); g.net.lines.get(6).b = null; g.net.remove(4); I.setLineOpen(g.net, 7, false); g.net.lines.get(8).b = { b: c.td.id, port: 'INPUT_W' }; g.net.rev++; const r = run(g);
  const has = (code, id) => r.faults.some(f => f.code === code && f.element.id === id);
  ok(has('OPEN_END', 6) && has('PUMP_DISCONNECTED', c.pump.id) && has('CLOSED_LINE', 7) && has('PRODUCT_MISMATCH', 8), 'I1 all four independent faults are found, each on its own element', r.faults.map(f => f.code + ':' + f.element.label));
  ok(r.faults.every((f, i) => f.no === i + 1) && r.faults.every((f, i, a) => i === 0 || ND.SEV[a[i - 1].severity].rank <= ND.SEV[f.severity].rank), 'I2 numbered 1..n and ordered by severity');
  ok(r.faults.every(f => f.zone && Number.isFinite(f.x) && Number.isFinite(f.y) && f.cause && f.effect && f.fix && f.element && f.element.id != null), 'I3 every finding has number, type, severity, element + id, zone, coordinates, cause, effect, fix');
  ok(r.faults.every(f => { if (f.element.type === 'BUILDING') { const b = g.store.get(f.element.id); return b && f.x >= b.x && f.y >= b.y; } const L = g.net.lines.get(f.element.id); return L && (L.path.some(p => p[0] === f.x && p[1] === f.y)); }), 'I4 every reported coordinate really belongs to the named element');
  const healthy = new Set(r.healthyLines); ok(!healthy.has(6) && !healthy.has(7) && !healthy.has(8) && healthy.has(1) && healthy.has(2), 'I5 healthy lines (green) exclude the faulty ones and include the sound ones'); }

console.log('J. a large network (thousands of elements)');
{ const g = game(1e15); let n = 0; const COLS = 28, ROWS = 48; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const x = 4 + c * 13, y = 4 + r * 6; try { const w = put(g, 'oil_well', x, y), t = put(g, 'crude_tank_m', x + 7, y); const L = pipe(g, w, 'OIL_OUT_E', t, 'INPUT_W'); if (L && L.ok !== false) n++; } catch (e) { } }
  const els = g.store.items.size + g.net.lines.size; g.net.lines.get(10).b = null; g.net.lines.get(500).open = false; g.net.rev++;
  const t0 = Date.now(), r = run(g, { sim: null }), ms = Date.now() - t0;
  ok(els >= 2500, 'J1 a network of ' + els + ' elements (' + g.store.items.size + ' buildings, ' + g.net.lines.size + ' pipes)', els);
  ok(by(r, 'OPEN_END').length === 1 && by(r, 'OPEN_END')[0].element.id === 10 && by(r, 'CLOSED_LINE').length === 1 && by(r, 'CLOSED_LINE')[0].element.id === 500, 'J2 the two injected faults are found among thousands, nothing else is reported as an error', r.faults.map(f => f.code + ':' + f.element.label).slice(0, 8));
  ok(ms < 1500, 'J3 inspection of ' + els + ' elements took ' + ms + ' ms (limit 1500)', ms);
  const t1 = Date.now(); const r2 = run(g, { sim: null }); ok(JSON.stringify(r2.stats) === JSON.stringify(r.stats), 'J4 repeatable: a second run gives the same figures (' + (Date.now() - t1) + ' ms)'); }
console.log('K. the panel text (pure)');
{ const UI = require('./diag-ui.js'), { g, c } = mk(); g.net.lines.get(6).b = null; g.net.rev++; const r = run(g), f = r.faults[0];
  ok(/فحص الشبكة الآن/.test(UI.html(null)), 'K1 before the first scan the panel offers the scan');
  const h = UI.html(r, { sel: f.no }); ok(['النوع', 'الخطورة', 'العنصر', 'المنطقة', 'الإحداثيات', 'السابق في التدفق', 'اللاحق في التدفق', 'السبب', 'التأثير', 'الإصلاح المقترح', 'العطل رقم 01'].every(x => h.includes(x)), 'K2 the open fault shows its number and all ten fields');
  ok(h.includes('PIPE-6') && h.includes('(' + f.x + ', ' + f.y + ')'), 'K3 with the real pipe id and coordinates'); ok(/سلامة الشبكة/.test(h) && /إعادة الفحص/.test(h), 'K4 health figure and re-scan');
  const x = { faults: [Object.assign({}, f, { cause: '<img src=x onerror=alert(1)>' })], stats: r.stats, notes: [] }; ok(!/<img/.test(UI.html(x, { sel: f.no })), 'K5 text is escaped'); }
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
