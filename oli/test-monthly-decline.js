'use strict';
/* Monthly decline + monthly well reserve (experiment branch).  The decline inputs of a well (reservoir pressure, reserve ratio) and the reserve it shows are read once per game month (Sim.monthKey = year * 12 + month, set by the Company);
 * the field's real reserve and pressure keep moving every hour.  Without a calendar (monthKey undefined) a Sim behaves exactly as before.
 *   NODE_PATH=/opt/npm-tools/node_modules node oli/test-monthly-decline.js */
const W = require('./worldmap.js'), B = require('./buildings.js'), I = require('./industry.js'), CFGW = require('./building-config.js').WELL;
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };

function newWorld(seed) { const world = W.createWorld({ sectors: false, seed: seed || 20260101 }), ts = B.fromWorld(world), store = new B.BuildingStore(ts, { cash: 1e11 }), net = new I.PipeNet(ts.W), sim = new I.Sim(store, net); return { world, ts, store, net, sim }; }
const fieldOf = (g, pick) => g.world.regionSites(g.world.homeRegionOfWorld().id).filter(s => s.kind === 'FIELD').sort((a, b) => b.radius - a.radius)[pick || 0];
const open = (g, f) => { g.world.discover(f.id); g.world.survey(f.id); g.world.makeDrillable(f.id); return f; };
function spotNear(g, def, cx, cy, maxr, skip) { for (let r = 0; r <= maxr; r++) { const n = 16 + r * 6; for (let a = 0; a < n; a++) { const x = Math.round(cx + Math.cos(a / n * 6.283) * r), y = Math.round(cy + Math.sin(a / n * 6.283) * r); if (skip && skip(x, y)) continue; if (g.store.validate(def, x, y, 0, {}).ok) return [x, y]; } } return null; }
/* n production wells on the field, each piped into its own crude tank, so every well can really deliver its oil */
function rig(g, f, n) {
  const wells = [], bad = []; let tries = 0, giveUp = (x, y) => bad.some(q => Math.hypot(q[0] - x, q[1] - y) < 3);
  while (wells.length < n && tries++ < n * 12) {
    const s = spotNear(g, 'oil_well', f.x, f.y, f.radius, (x, y) => giveUp(x, y) || g.store.list().some(o => Math.hypot(o.x - x, o.y - y) < 7)); if (!s) break; const w = g.store.place('oil_well', s[0], s[1], 0, { instant: true }); if (!w.ok) { bad.push(s); continue; }
    const drop = () => { g.store.demolish(w.building.id, { building: true, pipes: true, pipeSet: g.net }); bad.push(s); };
    const ts = spotNear(g, 'crude_tank_l', w.building.x + 8, w.building.y, 16); const t = ts && g.store.place('crude_tank_l', ts[0], ts[1], 0, { instant: true }); if (!(t && t.ok)) { drop(); continue; }
    const L = I.layPipe(g.store, g.net, g.ts, { b: w.building.id, port: 'OIL_OUT_E' }, { b: t.building.id, port: 'INPUT_W' }, 16); if (!L.ok) { g.store.demolish(t.building.id, { building: true, pipes: true, pipeSet: g.net }); drop(); continue; }
    wells.push(w.building);
  }
  return wells;
}
const build = (n) => { const g = newWorld(), f = open(g, fieldOf(g)); g.world.drillWell('INJECTION', f.id); const wells = rig(g, f, n); g.f = f; g.wells = wells; g.sim.ensure; for (const b of g.store.list()) g.sim.ensure(b); return g; };
const steps = (g, h) => { for (let i = 0; i < h; i++) g.sim.step(1 / 24); };
const snap = g => g.wells.map(b => ({ out: b.s._out, tg: b.s._target, wc: b.s._wc, p: b.s._p, res: b.s.reserve, mp: b.s.mp ? b.s.mp.slice() : null }));
console.log('1. no calendar: live decline, exactly as before');
{ const g = build(3); T('1a three wells are on the field', g.wells.length === 3); steps(g, 2); const a = snap(g)[0]; steps(g, 48); const b = snap(g)[0];
  T('1b without monthKey the target falls every hour and no record is made', b.tg < a.tg && g.wells.every(w => !w.s.mp), [a.tg, b.tg]); }
console.log('2. with a calendar: constant inside a month, one step at the next');
{ const g = build(3); g.sim.monthKey = 24000; steps(g, 1); const s1 = snap(g), pr0 = g.f.pr == null ? 1 : g.f.pr, rem0 = g.f.remainingReserve; steps(g, 200); const s2 = snap(g);
  T('2a every well has its own record [monthKey, ratio, pressure, reserve]', g.wells.every(w => Array.isArray(w.s.mp) && w.s.mp.length === 4 && w.s.mp[0] === 24000));
  T('2b the records are separate objects (nothing shared between wells)', g.wells[0].s.mp !== g.wells[1].s.mp && g.wells[1].s.mp !== g.wells[2].s.mp);
  T('2c the target, water cut and wellhead pressure of each well do not move inside the month', s1.every((x, i) => x.tg === s2[i].tg && x.wc === s2[i].wc && x.p === s2[i].p), [s1[0], s2[0]]);
  T('2d the reserve a well shows is constant inside the month', s1.every((x, i) => x.mp[3] === s2[i].mp[3]) && g.wells.every(w => w.s.mp[3] === s1[0].mp[3]));
  T('2e the real field keeps draining every hour (the oil really comes out of the ground)', g.f.remainingReserve < rem0 - 1 && (g.f.pr == null ? 1 : g.f.pr) < pr0, [rem0, g.f.remainingReserve]);
  T('2f the live reserve of the well (accounting) moved, the shown one did not', s2[0].res < s1[0].res && s2[0].mp[3] === s1[0].mp[3]);
  const prBefore = g.f.pr == null ? 1 : g.f.pr, remBefore = g.f.remainingReserve; g.sim.monthKey = 24001; steps(g, 1); const s3 = snap(g);
  T('2g next month: the pressure and reserve are read again, with the same formula (ratio = reserve / initial, target = nominal * (.4 + .6 * pressure) ...)', s3.every(x => x.mp[0] === 24001 && Math.abs(x.mp[2] - prBefore) < 1e-12 && Math.abs(x.mp[3] - remBefore) < 1e-6), [s3[0].mp, prBefore, remBefore]);
  T('2h the target stepped down once, by the amount the live formula gives for the new pressure', s3[0].tg < s2[0].tg && Math.abs(s3[0].tg / s2[0].tg - (.4 + .6 * prBefore) / (.4 + .6 * s1[0].mp[2])) < 1e-9, [s3[0].tg, s2[0].tg]); }
console.log('3. save and load in the middle of a month');
{ const A = build(3), Bw = build(3); for (const g of [A, Bw]) { g.sim.monthKey = 24000; steps(g, 100); }
  const same = () => A.wells.every((a, i) => { const b = Bw.wells[i]; return a.s._out === b.s._out && a.s.reserve === b.s.reserve && a.s.total === b.s.total && JSON.stringify(a.s.mp) === JSON.stringify(b.s.mp); });
  T('3a identical before the save', same());
  for (const b of Bw.wells) b.s = JSON.parse(JSON.stringify(b.s)); Bw.sim = new I.Sim(Bw.store, Bw.net); Bw.sim.monthKey = 24000; for (const b of Bw.store.list()) Bw.sim.ensure(b);
  steps(A, 72); steps(Bw, 72); T('3b a well state saved and loaded (new Sim, no memory) mid-month continues bit for bit', same());
  A.sim.monthKey = 24001; Bw.sim.monthKey = 24001; steps(A, 30); steps(Bw, 30); T('3c and so does the next month change after the load', same()); }
console.log('4. an older save (no record on the wells)');
{ const A = build(3), Bw = build(3); for (const g of [A, Bw]) { g.sim.monthKey = 24000; steps(g, 120); }
  const before = Bw.wells[0].s._target; for (const b of Bw.wells) delete b.s.mp; Bw.sim = new I.Sim(Bw.store, Bw.net); Bw.sim.monthKey = 24000; for (const b of Bw.store.list()) Bw.sim.ensure(b); steps(Bw, 1); steps(A, 1);
  T('4a it loads and runs: every well gets a record again', Bw.wells.every(w => Array.isArray(w.s.mp) && w.s.mp[0] === 24000));
  T('4b the one-time difference is only the decline of the hours since the month started (< 0.5 %)', Math.abs(Bw.wells[0].s._target / A.wells[0].s._target - 1) < 0.005 && Bw.wells[0].s._target <= A.wells[0].s._target + 1e-9, [Bw.wells[0].s._target, A.wells[0].s._target]); }
console.log('5. depletion is never hidden by the shown reserve');
{ const g = build(2); g.sim.monthKey = 24000; steps(g, 1); g.f.remainingReserve = 0.5; steps(g, 3);
  T('5a an empty field stops the wells at once even though the month record still shows reserve', g.wells.every(w => (w.s.reserve === 0 || w.s._depleted) && !(w.s._out > 1e-6)), g.wells.map(w => [w.s.reserve, w.s._out, w.s.mp[3]])); }
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
