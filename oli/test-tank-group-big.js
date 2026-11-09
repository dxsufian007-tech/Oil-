'use strict';
/* Tank Group verification: 100 tanks + several pumps, oil + water + bought share in many tanks, closing / opening an inner line, save + load of several groups.   node test-tank-group-big.js */
const H = require('./test-reserve-helpers.js'), { B, I, game, put } = H, assert = require('assert');
let n = 0; const ok = (c, m, x) => { if (!c) console.log('  FAIL ' + m + (x ? ' ' + JSON.stringify(x) : '')); assert(c, m); n++; console.log('  ok  ' + m); };
const CAP = B.DEFS.crude_tank_c.capacity.value, PUMP = B.DEFS.pump_station_l.params.maxFlow;
const link = (g, t) => I.autoLinkTank(g.store, g.net, g.ts, t.id), S = (g, b) => g.sim.ensure(b);
const rnd = (() => { let a = 12345; return () => (a = (a * 1664525 + 1013904223) >>> 0) / 4294967296; })();
const tot = (g, T, k) => T.reduce((q, t) => q + (S(g, t)[k] || 0), 0);
const pump = (g, T, tank, px, py, sink) => { const pu = put(g, 'pump_station_l', px, py), a = I.layConnect(g.store, g.net, g.ts, tank.id, pu.id, {}), b = I.layConnect(g.store, g.net, g.ts, pu.id, sink.id, {}); assert(a.ok && b.ok, 'pump connect ' + (a.reason || b.reason)); return pu; };

{ // 1 + 2: a group of 100 tanks, four pumps on different tanks, oil + water + bought oil spread unevenly
  const g = game(1e13), T = []; for (let j = 0; j < 10; j++) for (let i = 0; i < 10; i++) { const t = put(g, 'crude_tank_c', 100 + i * 10, 100 + j * 10); T.push(t); link(g, t); }
  const sinks = [put(g, 'crude_tank_c', 50, 70), put(g, 'crude_tank_c', 230, 70), put(g, 'crude_tank_c', 50, 220), put(g, 'crude_tank_c', 230, 220)];
  const P = [pump(g, T, T[0], 90, 100, sinks[0]), pump(g, T, T[9], 200, 100, sinks[1]), pump(g, T, T[90], 90, 190, sinks[2]), pump(g, T, T[99], 200, 190, sinks[3])];
  g.sim.build(); const gi0 = g.sim.groupInfo(T[0]); ok(gi0.n === 100 && gi0.capacity === 100 * CAP, 'one group of 100 tanks, capacity ' + gi0.capacity);
  for (const t of T) { const s = S(g, t); s.vol = Math.round(CAP * (0.05 + 0.9 * rnd()) * (rnd() < .2 ? 0 : 1)); s.wat = Math.round(s.vol * 0.3 * rnd()); s.bv = Math.round((s.vol - s.wat) * rnd() * .5); }
  const v0 = tot(g, T, 'vol'), w0 = tot(g, T, 'wat'), b0 = tot(g, T, 'bv'), snap = T.map(t => ({ ...S(g, t) })), fr0 = T.map((t, i) => snap[i].vol), tanksOnly = () => tot(g, T, 'vol'), sinkVol = () => sinks.reduce((q, t) => q + S(g, t).vol, 0), sinkWat = () => sinks.reduce((q, t) => q + (S(g, t).wat || 0), 0);
  ok(g.sim.groupInfo(T[50]).volume === v0, 'group stock = sum of the 100 tanks (' + Math.round(v0) + ' bbl); nothing copied');
  let worst = 0, maxStep = 0, bad = 0; const times = []; const t0 = process.hrtime.bigint();
  for (let d = 0; d < 20; d++) { for (let k = 0; k < 20; k++) { const q = process.hrtime.bigint(); g.sim.step(1 / 20); const ms1 = Number(process.hrtime.bigint() - q) / 1e6; times.push(ms1); maxStep = Math.max(maxStep, ms1); }
    const dv = Math.abs(tanksOnly() + sinkVol() - v0) / v0, dw = Math.abs(tot(g, T, 'wat') + sinkWat() - w0) / Math.max(1, w0); worst = Math.max(worst, dv, dw);
    if (T.some(t => S(g, t).vol < -1e-9 || S(g, t).vol > CAP + 1e-6)) bad++; }
  const secs = Number(process.hrtime.bigint() - t0) / 1e9;
  ok(worst < 1e-9, '20 days, 4 pumps: oil AND water conserved every day (worst relative drift ' + worst.toExponential(1) + ')'); ok(bad === 0, 'no tank ever below 0 or above capacity');
  const moved = sinkVol(); ok(moved > 0 && moved <= 4 * PUMP * 20 * 1.0001, 'what the pumps moved (' + Math.round(moved) + ' bbl in 20 days) never exceeds 4 pumps x ' + PUMP + ' bbl/day x 20 days');
  const fr = T.map((t, i) => fr0[i] ? S(g, t).vol / fr0[i] : null).filter(x => x != null); ok(Math.max(...fr) - Math.min(...fr) < 1e-9, 'proportional draw: every tank lost the SAME share of its own stock (' + (1 - fr[0]).toFixed(5) + ')');
  const wr = T.every((t, i) => !snap[i].vol || Math.abs(S(g, t).wat / S(g, t).vol - snap[i].wat / snap[i].vol) < 1e-9 && Math.abs((S(g, t).bv || 0) / S(g, t).vol - (snap[i].bv || 0) / snap[i].vol) < 1e-9);
  ok(wr, 'every tank kept ITS OWN water share and bought-oil share through the draw (no mixing between tanks)');
  ok(P.every(p => (S(g, p)._in || 0) <= PUMP + 1e-6), 'no pump exceeded its own capacity in the last step');
  times.sort((a, b) => a - b); const p99 = times[Math.floor(times.length * .99)]; ok(p99 < 5, 'simulator step with 100 tanks + 4 pumps: 99% of steps under ' + p99.toFixed(2) + ' ms (limit 5 ms), worst ' + maxStep.toFixed(2) + ' ms, average ' + (secs * 1000 / 400).toFixed(2) + ' ms');
  const one = (() => { const g1 = game(1e13), T1 = []; for (let j = 0; j < 10; j++) for (let i = 0; i < 10; i++) { const t = put(g1, 'crude_tank_c', 100 + i * 10, 100 + j * 10); T1.push(t); link(g1, t); } const sk = put(g1, 'crude_tank_c', 50, 70); pump(g1, T1, T1[0], 90, 100, sk); g1.sim.build(); for (const t of T1) S(g1, t).vol = CAP / 2; g1.sim.run(1); return S(g1, sk).vol; })();
  ok(moved / 20 > one * 1.5, 'more pumps move more oil (4 pumps ~' + Math.round(moved / 20) + '/day vs 1 pump ' + Math.round(one) + '/day) - each keeps its own capacity');
  g.sim.run(200); const leftover = tanksOnly(); ok(Math.abs(leftover + sinkVol() - v0) < 1e-6 * v0 && leftover >= -1e-6, '200 more days (sinks fill up at 4 x 4M): stock never invented or lost (' + Math.round(leftover) + ' bbl left, ' + Math.round(sinkVol()) + ' moved, total ' + Math.round(v0) + ')');
}

{ // 2b: different products never share a group
  const g = game(), c1 = put(g, 'crude_tank_c', 40, 40), c2 = put(g, 'crude_tank_c', 50, 40), p1 = put(g, 'gasoline_tank_l', 60, 40), p2 = put(g, 'gasoline_tank_l', 66, 40); link(g, c2); const r = link(g, p1); link(g, p2); g.sim.build();
  const gc = g.sim.groupOf(c1), gp = g.sim.groupOf(p1);
  ok(r.skipped.some(x => x.reason === 'invalidProduct') && gc && gp && gc !== gp && g.sim.groupInfo(c1).n === 2 && g.sim.groupInfo(p1).n === 2, 'crude tanks and gasoline tanks form separate groups (never mixed)'); S(g, c1).vol = 100; S(g, p1).vol = 50; ok(g.sim.groupInfo(c1).volume === 100 && g.sim.groupInfo(p1).volume === 50, 'each group counts only its own product'); void r;
}

{ // 3: closing one inner line splits the group, opening it joins again; the stocks never change
  const g = game(), A = put(g, 'crude_tank_c', 40, 40), Bt = put(g, 'crude_tank_c', 50, 40), C = put(g, 'crude_tank_c', 60, 40); link(g, Bt); link(g, C); g.sim.build();
  const set = [A, Bt, C]; set.forEach((t, i) => { const s = S(g, t); s.vol = 1000 * (i + 1); s.wat = 10 * (i + 1); s.bv = 100 * i; }); const snap = () => JSON.stringify(set.map(t => { const s = S(g, t); return [s.vol, s.wat, s.bv]; })), s0 = snap();
  ok(g.sim.groupInfo(A).n === 3, 'A-B-C is one group of 3');
  const pairBC = [...g.net.lines.values()].filter(L => (L.a.b === Bt.id && L.b.b === C.id) || (L.a.b === C.id && L.b.b === Bt.id)); ok(pairBC.length === 2, 'B and C are joined by two lines');
  I.setLineOpen(g.net, pairBC[0].id, false); g.sim.build(); ok(g.sim.groupInfo(A).n === 2 && !g.sim.groupOf(C) && snap() === s0, 'closing ONE inner line: C leaves the group (A+B stay), no stock moved');
  I.setLineOpen(g.net, pairBC[0].id, true); g.sim.build(); ok(g.sim.groupInfo(A).n === 3 && snap() === s0, 'opening it again: C joins back (3 tanks), no stock moved');
  I.setLineOpen(g.net, pairBC[1].id, false); g.sim.build(); ok(g.sim.groupInfo(A).n === 2 && !g.sim.groupOf(C) && snap() === s0, 'closing the OTHER line works the same');
  I.setLineOpen(g.net, pairBC[1].id, true); g.sim.build(); ok(g.sim.groupInfo(A).n === 3, 'and reopening restores the group');
  // closed + one line open = an ordinary one-way pipe: oil may flow through it, conservation holds
  I.setLineOpen(g.net, pairBC[0].id, false); g.sim.build(); const v = set.reduce((q, t) => q + S(g, t).vol, 0); g.sim.run(5); ok(Math.abs(set.reduce((q, t) => q + S(g, t).vol, 0) - v) < 1e-6, 'with one line closed the remaining line is a normal pipe: total oil unchanged'); }

{ // 4: several groups, save + load of the pipes and the buildings
  const g = game(1e13), mkG = (x0, y0, k) => { const L = []; for (let i = 0; i < k; i++) { const t = put(g, 'crude_tank_c', x0 + i * 10, y0); L.push(t); link(g, t); } return L; };
  const G1 = mkG(30, 30, 4), G2 = mkG(30, 60, 3), G3 = mkG(30, 90, 2), lone = put(g, 'crude_tank_c', 30, 120), GP = [put(g, 'gasoline_tank_l', 110, 30), put(g, 'gasoline_tank_l', 125, 30)]; link(g, GP[1]);
  const all = [...G1, ...G2, ...G3, lone, ...GP]; all.forEach((t, i) => { const s = S(g, t); s.vol = 1000 + i * 77; if (DEFS(t).product === 'CRUDE') { s.wat = 11 * i; s.bv = 7 * i; } });
  const sig = gg => JSON.stringify([...new Set(all.map(t => { const x = gg.sim.groupOf(gg.store.get(t.id)); return x ? x.members.join('.') : '-'; }))].sort()), vols = gg => all.map(t => { const s = S(gg, gg.store.get(t.id)); return [s.vol, s.wat || 0, s.bv || 0]; }), s1 = sig(g), v1 = JSON.stringify(vols(g));
  const sj = JSON.parse(JSON.stringify(g.store.toJSON())), nj = JSON.parse(JSON.stringify(g.net.toJSON())), g2 = game(1e13), r = B.BuildingStore.fromJSON(g2.ts, sj);
  g2.store.items = r.store.items; g2.store.occ = r.store.occ; g2.store.bucket = r.store.bucket; g2.store.nextId = r.store.nextId; g2.store.rev = (g2.store.rev | 0) + 1; g2.sim.net = I.PipeNet.fromJSON(g2.ts.W, nj); g2.sim.builtRev = -1;
  ok(sig(g2) === s1, 'after save + load the same groups are derived (' + s1.length + ' chars of group signature, 4 groups + 1 lone tank)'); ok(JSON.stringify(vols(g2)) === v1, 'after save + load every tank has exactly its own oil, water and bought share');
  g2.sim.run(3); ok(JSON.stringify(vols(g2)) === v1, 'and stepping the loaded game with no pumps changes nothing (no shuffling between tanks)');
  function DEFS(t) { return B.DEFS[t.d]; } }
console.log('TANK GROUP BIG TESTS PASSED (' + n + ' checks)');
