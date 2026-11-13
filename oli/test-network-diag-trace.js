/* NETWORK DIAGNOSTICS - the oil path of a blocked well: which element stops the oil first, and why.   node test-network-diag-trace.js
 * Every scenario is a real game built with the economy helpers and stepped by the real engine; the inspector only READS it. */
const assert = require('assert'), H = require('./test-economy-helpers.js'), { game, put, pipe, chain } = H, ND = require('./network-diag.js'), UI = require('./diag-ui.js');
let n = 0; const ok = (c, m, x) => { if (!c) { console.log('FAIL ' + m, x === undefined ? '' : JSON.stringify(x)); process.exitCode = 1; return; } n++; console.log('  ok  ' + m); };
const run = g => ND.run(g.store, g.net, { sim: g.sim, locate: (x, y) => 'C' + (x >> 6) + (y >> 6) }), settle = g => { for (let i = 0; i < 60; i++) g.sim.step(g.sim.dt || .05); };
const blocked = (r, w) => r.faults.find(f => f.code === 'BLOCKED' && f.element.id === w.id), snap = g => JSON.stringify({ n: g.net.toJSON(), s: g.store.toJSON({ live: true }) });
const T = f => f && f.trace, culprit = f => T(f) && T(f).culprit, codes = f => T(f).causes.map(c => c.code);

console.log('1. a well on a sound network');
{ const g = game(5e12), c = chain(g, false); settle(g); const s0 = snap(g), r = run(g); ok(c.wells.every(w => g.sim.status(w) === 'RUNNING') && !r.faults.some(f => f.code === 'BLOCKED'), '1a running wells: no BLOCKED finding at all'); ok(snap(g) === s0, '1b read-only: the game is identical after the scan'); }

console.log('2. a closed pipe');
{ const g = game(5e12), c = chain(g, false); g.net.lines.get(4).open = false; g.net.rev++; settle(g); const r = run(g), f = blocked(r, c.wells[0]);
  ok(f && T(f).cause === 'PIPE_CLOSED' && /PIPE-4/.test(culprit(f)), '2a the first stop is the CLOSED pipe itself (PIPE-4), not the junction beside it', f && T(f).cause + ' ' + culprit(f)); ok(/Junction/.test(f.prev), '2b the last healthy element is the junction', f.prev);
  ok(T(f).responsible.type === 'pipe' && T(f).responsible.id === 4, '2c the responsible element is pipe 4 (id given)'); ok(f.x != null && T(f).steps[T(f).firstBad].type === 'pipe', '2d the map point is on that pipe');
  ok(T(f).lost > 0 && Math.abs(T(f).lost - (T(f).well.target - T(f).well.out)) < 1e-6 && T(f).sharedWith.length === 2 && T(f).groupLost > T(f).lost, '2e production lost = target - actual; the three wells sharing the cause are summed', [T(f).lost, T(f).groupLost]); }

console.log('3. a stopped pump');
for (const st of ['MAINTENANCE', 'DAMAGED']) { const g = game(5e12), c = chain(g, false); c.pump.st = st; g.sim.dirty(); g.net.rev++; settle(g); const f = blocked(run(g), c.wells[1]);
  ok(f && T(f).cause === st && T(f).responsible.id === c.pump.id && /Pump/.test(culprit(f)), '3 pump ' + st + ': the first stop is the pump (#' + c.pump.id + ')', f && T(f).cause); }

console.log('4. a DETACHED pipe is blamed on the pipe, not on the pump');
{ const g = game(5e12), c = chain(g, false); g.net.lines.get(5).b = null; g.net.rev++; settle(g); const r = run(g), f = blocked(r, c.wells[0]);
  ok(f && T(f).cause === 'PIPE_DETACHED' && /PIPE-5/.test(culprit(f)), '4a first stop = PIPE-5, cause PIPE_DETACHED', f && [T(f).cause, culprit(f)]); ok(/Pump/.test(f.prev) && !codes(f).includes('PUMP_IDLE'), '4b the pump is the last HEALTHY element and is not listed as a cause', codes(f));
  ok(/مفصول/.test(f.cause) && /نفسه سليم/.test(T(f).causeAr), '4c the text says the pipe is detached and the pump itself is sound'); ok(r.faults.some(z => z.code === 'OPEN_END'), '4d the structural OPEN_END finding is still reported on the pipe'); }

console.log('5. a path that ends without a destination');
{ const g = game(5e12), c = chain(g, false); g.net.lines.delete(6); g.net.rev++; settle(g); const f = blocked(run(g), c.wells[2]);
  ok(f && /Separator/.test(culprit(f)) && T(f).cause === 'DEAD_END', '5 the oil stops at the separator (no outlet pipe)', f && [culprit(f), T(f).cause]); }

console.log('6. a well connected to nothing');
{ const g = game(5e12), c = chain(g, false), w = put(g, 'oil_well', 20, 48); settle(g); const r = run(g); ok(g.sim.status(w) === 'NO_OUTPUT' && !blocked(r, w) && r.faults.some(z => z.element.id === w.id && z.code === 'ISOLATED'), '6 NO_OUTPUT is reported as ISOLATED, never as a blocked flow'); }

console.log('7. a full tank');
{ const g = game(5e12), c = chain(g, false); g.sim.ensure(c.ct).vol = 4e6; settle(g); const f = blocked(run(g), c.wells[0]); ok(f && T(f).cause === 'TANK_FULL' && T(f).responsible.id === c.ct.id, '7 the first stop is the full crude tank', f && T(f).cause); }

console.log('8. several wells blocked for DIFFERENT causes in one game, each reported on its own');
{ const g = game(5e12), A = chain(g, false); const wB = put(g, 'oil_well', 20, 60), jB = put(g, 'junction', 28, 62), pB = put(g, 'pump_station_l', 34, 62), sB = put(g, 'separator', 50, 60), tB = put(g, 'crude_tank_m', 68, 60);
  pipe(g, wB, 'OIL_OUT_E', jB, 'PORT_N'); pipe(g, jB, 'PORT_E', pB, 'INPUT'); pipe(g, pB, 'OUTPUT', sB, 'MIXTURE_IN'); const lB = pipe(g, sB, 'OIL_OUT', tB, 'INPUT_W');
  const wC = put(g, 'oil_well', 20, 76), jC = put(g, 'junction', 28, 78), tC = put(g, 'crude_tank_m', 48, 76); pipe(g, wC, 'OIL_OUT_E', jC, 'PORT_N'); pipe(g, jC, 'PORT_E', tC, 'INPUT_W');
  A.pump.st = 'MAINTENANCE'; g.sim.dirty(); g.sim.ensure(tC).vol = 4e6; const lid = lB.id || (lB.line && lB.line.id); g.net.lines.get(lid) && (g.net.lines.get(lid).b = null); g.net.rev++; settle(g); const r = run(g);
  const fa = blocked(r, A.wells[0]), fb = blocked(r, wB), fc = blocked(r, wC);
  ok(fa && fb && fc, '8a all three chains report a blocked well', [!!fa, !!fb, !!fc]); ok(T(fa).cause === 'MAINTENANCE' && T(fc).cause === 'TANK_FULL' && /مفصول/.test(T(fb).causeAr), '8b three different causes, each named correctly: pump stopped / tank full / pipe detached', [T(fa).cause, T(fb).cause, T(fc).cause]);
  ok(T(fa).sharedWith.length === 2 && T(fb).sharedWith.length === 0 && T(fc).sharedWith.length === 0, '8c wells are grouped only with the wells of the SAME cause', [T(fa).sharedWith, T(fb).sharedWith]); ok(new Set([fa, fb, fc].map(f => f.no)).size === 3, '8d each has its own report number'); }

console.log('9. several causes on ONE path are listed separately');
{ const g = game(5e12), c = chain(g, false); c.pump.st = 'MAINTENANCE'; g.sim.dirty(); g.sim.ensure(c.ct).vol = 4e6; g.net.rev++; settle(g); const f = blocked(run(g), c.wells[0]), cs = T(f).causes;
  ok(cs.length >= 2 && cs[0].first && cs.some(z => z.code === 'MAINTENANCE') && cs.some(z => z.code === 'TANK_FULL') && cs.every(z => z.ar && z.fix && z.element), '9a pump stopped AND tank full: two separate causes, each with its element, text and fix', cs.map(z => z.code));
  const html = UI.html(run(g), { sel: f.no, showOk: true, limit: 50 }); ok(/السبب 1 \(أول انقطاع\)/.test(html) && /السبب 2/.test(html), '9b the panel shows them as separate cards, the first one marked as where the oil first stops'); }

console.log('10. the cause cannot be established');
{ const g = game(5e12), c = chain(g, false); settle(g); c.wells[0].s._out = 0; const f = blocked(run(g), c.wells[0]); ok(f && T(f).cause === 'UNKNOWN' && /السبب غير محدد/.test(f.cause) && T(f).firstBad == null && T(f).responsible === null, '10a «السبب غير محدد» and nothing is guessed', f && T(f).cause);
  ok(/لا أخمّن/.test(f.cause) && !T(f).causes.length, '10b says so explicitly and lists no invented cause'); }

console.log('11. the panel');
{ const g = game(5e12), c = chain(g, false); g.net.lines.get(4).open = false; g.net.rev++; settle(g); const r = run(g), f = blocked(r, c.wells[0]), html = UI.html(r, { sel: f.no, showOk: true, limit: 50 });
  ok(/تتبّع مسار/.test(html) && /آخر عنصر سليم/.test(html) && /أول نقطة فشل/.test(html) && /الإنتاج المتأثر/.test(html) && /المنطقة/.test(html) && /حالة البئر/.test(html), '11a rows: well, zone, state, last healthy element, first failure, production affected, cause');
  ok(/PIPE-4/.test(html) && /الإصلاح/.test(html) && /بعد نقطة الانقطاع/.test(html), '11b the responsible pipe, the fix and the elements after the break');
  ok(T(f).steps.every(z => typeof z.x === 'number') && T(f).steps.some(z => z.path && z.path.length), '11c the path carries coordinates and the pipe tiles for the map overlay (green / red / orange)'); }
console.log('\n' + n + ' passed'); 
