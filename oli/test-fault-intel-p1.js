/* FAULT INTELLIGENCE, PHASE 1 (read-only): one pipe = one finding, severity follows the real impact, an in-memory issue registry; nothing is saved, nothing in the game changes. node test-fault-intel-p1.js */
const H = require('./test-economy-helpers.js'), { game, chain } = H, ND = require('./network-diag.js'), FR = require('./fault-registry.js'); let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++, console.log('  ok ', n); else fail++, console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x).slice(0, 500)); };
const run = (g, o) => ND.run(g.store, g.net, Object.assign({ sim: g.sim, locate: (x, y) => 'C' + (x >> 6) + (y >> 6) }, o || {})), by = (r, c) => r.faults.filter(f => f.code === c);
const settle = g => { for (let i = 0; i < 60; i++) g.sim.step(g.sim.dt || 0.05); };
const demo = (g, id) => g.store.demolish(id, { building: true, pipes: true, pipeSet: g.net }), snap = g => JSON.stringify({ items: [...g.store.items.values()], net: g.net.toJSON(), cash: g.store.cash, flows: [...g.net.lines.values()].map(L => [L.id, L.flow]) });
const ends = (g, id) => { const L = g.net.lines.get(id); return [L.a && L.a.b, L.b && L.b.b]; };
const sound = () => { const g = game(5e12), c = chain(g, true); settle(g); return { g, c }; };

console.log('A. a leftover pipe (both end buildings demolished)');
{ const { g } = sound(), before = run(g); const [a, b] = ends(g, 9); demo(g, a); demo(g, b); g.net.rev++; settle(g); const r = run(g), f = by(r, 'MISSING_BUILDING').filter(x => x.element.id === 9);
  ok(f.length === 1, 'A1 the two ends of PIPE-9 are ONE finding (was two)', f.length); const m = f[0];
  ok(m.merged === 2 && m.locations.length === 2 && m.evidence.leftover === true && m.evidence.missing.length === 2, 'A2 it records both ends, both places and both missing ids', m.evidence);
  ok(m.severity === 'LOW' && /بقايا أنبوب/.test(m.effect) && /اختياري/.test(m.fix), 'A3 severity LOW: a leftover pipe that carries nothing and disables nothing is not critical', [m.severity, m.effect]);
  ok(/#\d+ و#\d+/.test(m.cause) && m.cause.indexOf(String(a)) >= 0 && m.cause.indexOf(String(b)) >= 0, 'A4 the cause names both missing buildings', m.cause);
  const nb = r.stats.critical; ok(nb === r.faults.filter(x => x.severity === 'CRITICAL').length, 'A5 the critical count follows the new severity', nb);
  ok(r.stats.health <= before.stats.health, 'A6 the health figure still counts the pipe as a defect (the formula is unchanged: only the label changed)', [before.stats.health, r.stats.health]); }

console.log('B. one end missing: the severity follows what the OTHER end loses');
{ const { g } = sound(); const L = g.net.lines.get(9), a = L.a.b, b = L.b.b; demo(g, b); g.net.rev++; const r = run(g), f = by(r, 'MISSING_BUILDING').filter(x => x.element.id === 9);
  ok(f.length === 1 && !f[0].merged && f[0].evidence.leftover === false && /بلا مسار|اختياري/.test(f[0].effect), 'B1 one finding, not a leftover (its other end still exists)', f.map(x => x.effect));
  const surv = g.store.get(a), P = (require('./buildings.js').worldPoints(surv).find(p => p.id === L.a.port) || {}); ok(f[0].severity === (P.required !== false ? 'CRITICAL' : 'MEDIUM'), 'B2 severity = CRITICAL if the surviving port is required, MEDIUM if it is optional (port ' + L.a.port + ' required=' + P.required + ')', f[0].severity); }
{ const { g, c } = sound(); const jl = [...g.net.lines.values()].find(L => L.a && L.b && g.store.get(L.a.b) && g.store.get(L.b.b) && (g.store.get(L.a.b).d === 'junction_t' || /junction/.test(g.store.get(L.a.b).d) || /junction/.test(g.store.get(L.b.b).d))); if (jl) { const jEnd = /junction/.test(g.store.get(jl.a.b).d) ? 'a' : 'b', other = jEnd === 'a' ? jl.b.b : jl.a.b; demo(g, other); g.net.rev++; const f = by(run(g), 'MISSING_BUILDING').filter(x => x.element.id === jl.id); ok(f.length === 1 && f[0].severity === 'MEDIUM', 'B3 a pipe whose surviving end is a junction (optional port) is MEDIUM, not critical', f.map(x => x.severity)); } else ok(true, 'B3 (no junction pipe in this chain)'); }

console.log('C. a faulty pipe elsewhere is untouched');
{ const { g } = sound(), L = g.net.lines.get(6); L.b = null; g.net.rev++; const r = run(g), f = by(r, 'OPEN_END');
  ok(f.length === 1 && f[0].severity === 'CRITICAL' && !f[0].merged, 'C1 OPEN_END keeps its critical severity and is not merged'); }
{ const { g } = sound(), L = g.net.lines.get(9), p = L.path; L.path = p.map(t => [t[0] + 1, t[1]]); g.net.rev++; const r = run(g), w = by(r, 'WRONG_POINT').filter(x => x.element.id === 9);
  ok(w.length <= 1 && (w.length === 0 || w[0].merged === 2 || w[0].merged === undefined), 'C2 WRONG_POINT on both ends of one pipe is also a single finding', w.map(x => x.merged)); }

console.log('D. the issue registry (in memory, read-only)');
{ const { g } = sound(), reg = FR.create(); const r0 = FR.update(reg, run(g), 100); ok(r0.issues.active === 0 && r0.issues.scans === 1, 'D1 a healthy network has no issues');
  const [a, b] = ends(g, 9); demo(g, a); demo(g, b); g.net.rev++; settle(g); let r1 = FR.update(reg, run(g), 124); let f = by(r1, 'MISSING_BUILDING')[0];
  ok(r1.issues.active >= 1 && f.issue.since === 124 && f.issue.scans === 1 && f.issue.ageHours === 0, 'D2 a new issue is stamped with the game time it was first seen', f.issue);
  const r2 = FR.update(reg, run(g), 172); f = by(r2, 'MISSING_BUILDING')[0]; ok(f.issue.since === 124 && f.issue.ageHours === 48 && f.issue.scans === 2, 'D3 two days later: still since 124, age 48 h, seen in 2 scans', f.issue);
  const s0 = snap(g); FR.update(reg, run(g), 180); FR.update(reg, run(g, { sim: null }), 181); ok(snap(g) === s0, 'D4 inspecting and registering change nothing in the game (buildings, pipes, cash, flows)');
  g.net.remove(9); g.net.rev++; const r3 = FR.update(reg, run(g), 200); ok(by(r3, 'MISSING_BUILDING').filter(x => x.element.id === 9).length === 0 && r3.issues.list.some(e => e.element.id === 9 && e.status === 'RESOLVED' && e.resolvedAt === 200), 'D5 the player deletes the pipe: the issue is marked RESOLVED with the time');
  const reg2 = FR.create(); for (let i = 0; i < 260; i++) { const fake = { faults: [{ code: 'X', severity: 'LOW', element: { type: 'PIPE', id: i } }] }; FR.update(reg2, fake, i); FR.update(reg2, { faults: [] }, i + 0.5); } ok(reg2.map.size <= 201, 'D6 the registry is bounded (' + reg2.map.size + ' entries after 260 resolved issues)', reg2.map.size);
  ok(JSON.stringify(g.net.toJSON()).indexOf('issue') < 0 && JSON.stringify([...g.store.items.values()]).indexOf('issue') < 0, 'D7 nothing about the registry reaches the save data'); }

console.log('E. speed on a large network (limit unchanged: 1500 ms; the registry adds almost nothing)');
{ const g = game(1e15), COLS = 28, ROWS = 48; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const x = 4 + c * 13, y = 4 + r * 6; try { const w = H.put(g, 'oil_well', x, y), t = H.put(g, 'crude_tank_m', x + 7, y); H.pipe(g, w, 'OIL_OUT_E', t, 'INPUT_W'); } catch (e) {} }
  const els = g.store.items.size + g.net.lines.size; let n = 0; for (const L of g.net.lines.values()) if (n++ % 40 === 0) { demo(g, L.a.b); demo(g, L.b.b); } g.net.rev++;
  const t0 = Date.now(), r = run(g, { sim: null }), ms = Date.now() - t0, reg = FR.create(), t1 = Date.now(); FR.update(reg, r, 1); const ms2 = Date.now() - t1; const mb = by(r, 'MISSING_BUILDING');
  ok(els >= 2000 && mb.length >= 20 && mb.every(f => f.merged === 2) && mb.length === new Set(mb.map(f => f.element.id)).size, 'E1 ' + els + ' elements, ' + mb.length + ' leftover pipes, each ONE finding', [els, mb.length]); ok(ms < 1500, 'E2 inspection took ' + ms + ' ms (limit 1500)', ms); ok(ms2 < 100, 'E3 the registry update took ' + ms2 + ' ms for ' + r.faults.length + ' findings', ms2); }
console.log('\n' + (fail ? 'FAILED' : 'PASS') + ' ' + pass + ' ok, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
