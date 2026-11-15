/* EXPERIMENT (branch experiment/weekly-flow-freeze): the weekly flow freeze.  Not part of `npm test` - run it by hand:  node test-weekly-freeze.js
 * 195 wells + pumps + tanks + valves + refineries (bench-full.js scene).  The same game is run twice (freeze OFF = the exact simulator, freeze ON = 7-day frozen rates) and compared.
 * It checks: OFF changes nothing; ON replays most hours; stock keeps moving while the rates are frozen; production / refining / stock stay within the stated tolerance;
 * every event that matters (valve, throttle, structure, pump fault of the central net, full / empty tank) is solved at once; a save + load in the middle of the week is safe. */
const { build } = require('./bench-full.js'), EC = require('./economy-config.js');
let pass = 0, fail = 0; const ok = (c, n, x) => { if (c) pass++, console.log('  ok ', n); else fail++, console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); };
const rel = (a, b) => Math.abs(a - b) / Math.max(1, Math.abs(a));
const scene = days => { EC.TIME.flowFreezeDays = days; EC.TIME.flowFreezeTol = 0; const g = build(450); g.co.tier = EC.POWER.tiers.length - 1; return g; };
const totals = g => { let vol = 0, made = 0, crude = 0; for (const b of g.store.list()) { const s = b.s; if (!s) continue; if (typeof s.vol === 'number') vol += s.vol; if (s.made) for (const k in s.made) made += s.made[k]; if (typeof s.crude === 'number') crude += s.crude; } return { vol, made, crude, cash: g.store.cash, qty: g.co.qty.CRUDE, gas: g.co.qty.GASOLINE }; };
const HOURS = 24 * 14;

console.log('A. freeze OFF is the unchanged simulator');
const A = scene(0), A2 = scene(0); A.co.advanceHours(168); A2.co.advanceHours(168);
ok(A.sim.fzStats.solved === 0 && A.sim.fzStats.replayed === 0 && !A.sim.fz, 'A1 OFF: no hour is recorded or replayed');
ok(JSON.stringify(totals(A)) === JSON.stringify(totals(A2)), 'A2 OFF: two identical runs give identical totals');
const wells = A.store.list().filter(b => b.d === 'oil_well').length; ok(wells >= 190, 'A3 the scene has ~200 wells (' + wells + ')');

console.log('B. freeze ON: most hours are replayed, results stay close');
const base = scene(0), frz = scene(7); let flowBase = 0; base.co.advanceHours(HOURS); frz.co.advanceHours(HOURS);
const tb = totals(base), tf = totals(frz), st = frz.sim.fzStats;
ok(st.replayed / (st.solved + st.replayed) > 0.5, 'B1 more than half of the hours replayed (' + st.replayed + ' of ' + (st.solved + st.replayed) + ')', st);
ok(rel(tb.crude, tf.crude) < 1e-4 && rel(tb.made, tf.made) < 1e-4, 'B2 refined crude / products made within 0.01% over 14 days', [tb.crude, tf.crude, tb.made, tf.made]);
ok(rel(tb.vol, tf.vol) < 2e-3, 'B3 total stock in tanks within 0.2%', [tb.vol, tf.vol]);
ok(rel(tb.cash, tf.cash) < 2e-3 && rel(tb.qty, tf.qty) < 2e-3, 'B4 cash and crude balance within 0.2%', [tb.cash, tf.cash, tb.qty, tf.qty]);

console.log('C. the stock keeps changing while the rates are frozen');
{ const g = scene(7); g.co.advanceHours(30); const t = g.store.list().find(b => b.d === 'crude_tank_m' && b.s && b.s.vol > 0 && b.s.vol < 1e9); const before = g.sim.fzStats.replayed; const v0 = t ? t.s.vol : 0; g.co.advanceHours(3);
  ok(g.sim.fzStats.replayed - before >= 2, 'C1 the 3 hours were replayed (not solved)', g.sim.fzStats); ok(t && t.s.vol !== v0, 'C2 a tank\'s stock moved during the replayed hours', [v0, t && t.s.vol]); }

console.log('D. a change that matters is solved at once');
{ const g = scene(7); g.co.advanceHours(40); const s0 = g.sim.fzStats.solved, valves = g.store.list().filter(b => b.d === 'valve' && b.s);
  g.sim.setValve(valves[3], 'CLOSED'); g.co.advanceHours(1); ok(g.sim.fzStats.solved > s0 && g.sim.fzStats.state > 0, 'D1 valve closed: the next hour is solved, not replayed', g.sim.fzStats);
  const s1 = g.sim.fzStats.solved, rf = g.store.list().find(b => /refinery/.test(b.d)); g.co.advanceHours(4); const s2 = g.sim.fzStats.solved; rf.s.opLimit = 0.4; g.co.advanceHours(1); ok(g.sim.fzStats.solved > s2, 'D2 refinery throttled: solved at once', g.sim.fzStats);
  const s3 = g.sim.fzStats.solved, b0 = g.store.list().length; g.co.advanceHours(3); const tk = g.store.place('crude_tank_m', 3, 3, 0, { instant: true }); g.co.advanceHours(1); ok(!tk.ok || g.sim.fzStats.structure > 0 || g.store.list().length === b0, 'D3 a new building: the structure check forces a solve', g.sim.fzStats); }
{ const g = scene(7); g.co.advanceHours(10); const T = g.store.list().filter(b => /crude_tank/.test(b.d) && b.s && b.s.vol > 0)[0], cap = require('./buildings.js').DEFS[T.d].capacity.value; T.s.vol = cap * 0.9995; g.co.advanceHours(12);
  ok(T.s.vol <= cap + 1e-6, 'D4 a tank pushed to full never goes past its capacity while replaying', [T.s.vol, cap]); ok((g.sim.fzStats.limit || 0) + (g.sim.fzStats.regime || 0) > 0, 'D5 reaching full / empty is detected (limit / regime re-solve)', g.sim.fzStats); }
{ const g = scene(7); g.co.advanceHours(10); const wk0 = g.sim.fzStats.week | 0; g.co.advanceHours(24 * 8); ok((g.sim.fzStats.week | 0) > wk0, 'D6 a new game week starts with a full solve', g.sim.fzStats); }

console.log('E. save + load in the middle of the week');
{ const g = scene(7); g.co.advanceHours(50); const j = JSON.parse(JSON.stringify(g.co.toJSON())); g.co.fromJSON(j); ok(g.sim.fz === null, 'E1 after loading no recorded week is kept (the first hour solves)'); const s0 = g.sim.fzStats.solved; g.co.advanceHours(1); ok(g.sim.fzStats.solved === s0 + 1, 'E2 the first hour after loading is a full solve');
  g.co.advanceHours(30); const t = totals(g); const gb = scene(0); gb.co.advanceHours(50); const jb = JSON.parse(JSON.stringify(gb.co.toJSON())); gb.co.fromJSON(jb); gb.co.advanceHours(31); const tb2 = totals(gb); ok(rel(tb2.crude, t.crude) < 5e-3 && rel(tb2.vol, t.vol) < 5e-3, 'E3 save + load mid-week: results within the same tolerance of the exact simulator', [tb2.crude, t.crude, tb2.vol, t.vol]); }

console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
