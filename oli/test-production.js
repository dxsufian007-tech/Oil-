/* Phase 5 of the oil system: production and depletion. Reservoir pressure falls as oil is taken and the wells follow it; injection wells hold the pressure and raise the recovery; lifting costs follow the depth and the pressure;
 * production never passes the reserve or the capacity of the field; everything is saved.
 * Built with the real functions on the real world (world.drillWell, store.place, layPipe, Sim.step, Company.advanceHours).
 *   NODE_PATH=/opt/npm-tools/node_modules node oli/test-production.js */
const W = require('./worldmap.js'), B = require('./buildings.js'), I = require('./industry.js'), E = require('./economy.js'), EC = require('./economy-config.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol) * Math.max(1, Math.abs(a), Math.abs(b));
const P = W.CONFIG.PRODUCTION;

function newWorld(seed) { const world = W.createWorld({ seed: seed || 20260101 }), ts = B.fromWorld(world), store = new B.BuildingStore(ts, { cash: 1e11 }), net = new I.PipeNet(ts.W), sim = new I.Sim(store, net); return { world, ts, store, net, sim }; }
const fields = g => g.world.regionSites(g.world.regions.find(r => r.starter).id).filter(s => s.kind === 'FIELD').sort((a, b) => b.radius - a.radius);
const open = (g, f) => { g.world.discover(f.id); g.world.survey(f.id); g.world.makeDrillable(f.id); return f; };
function spotNear(g, def, cx, cy, maxr, skip) { for (let r = 0; r <= maxr; r++) { const n = 16 + r * 6; for (let a = 0; a < n; a++) { const x = Math.round(cx + Math.cos(a / n * 6.283) * r), y = Math.round(cy + Math.sin(a / n * 6.283) * r); if (skip && skip(x, y)) continue; if (g.store.validate(def, x, y, 0, {}).ok) return [x, y]; } } return null; }
function rig(g, f, n) {
  const wells = [], tanks = [], bad = []; let tries = 0; const giveUp = (x, y) => bad.some(q => Math.hypot(q[0] - x, q[1] - y) < 3);
  while (wells.length < n && tries++ < n * 12) {
    const s = spotNear(g, 'oil_well', f.x, f.y, f.radius, (x, y) => giveUp(x, y) || g.store.list().some(o => Math.hypot(o.x - x, o.y - y) < 7)); if (!s) break; const w = g.store.place('oil_well', s[0], s[1], 0, { instant: true }); if (!w.ok) { bad.push(s); continue; }
    const drop = () => { g.store.demolish(w.building.id, { building: true, pipes: true, pipeSet: g.net }); bad.push(s); };
    const ts = spotNear(g, 'crude_tank_l', w.building.x + 8, w.building.y, 16); const t = ts && g.store.place('crude_tank_l', ts[0], ts[1], 0, { instant: true }); if (!(t && t.ok)) { drop(); continue; }
    const L = I.layPipe(g.store, g.net, g.ts, { b: w.building.id, port: 'OIL_OUT_E' }, { b: t.building.id, port: 'INPUT_W' }, 16); if (!L.ok) { g.store.demolish(t.building.id, { building: true, pipes: true, pipeSet: g.net }); drop(); continue; }
    wells.push(w.building); tanks.push(t.building);
  }
  g.tanks = tanks; return wells;
}
/* `days` days of production with a buyer that empties the tanks every day (so the wells are never blocked by a full tank); returns the oil taken out of the ground and the daily rate at the end of each 'period' days */
function run(g, wells, days, period) { let oil = 0; const rates = []; let acc = 0;
  for (let d = 0; d < days; d++) { for (const t of g.tanks) if (t.s) t.s.vol = 0; for (let q = 0; q < 4; q++) g.sim.step(0.25); let day = 0; for (const w of wells) { const s = w.s; if (s._out) day += s._out * (1 - s._wc - s._gas); } oil += day; acc += day; if (period && (d + 1) % period === 0) { rates.push(acc / period); acc = 0; } }
  return { oil, rates }; }
const site = (g, wells, f) => g.world.siteById(f.id);

console.log('1. production falls gradually with time as the reservoir pressure drops');
{ const g = newWorld(), f = open(g, fields(g)[2]); f.props.capacity = 2500; f.props.decline = 0.15; f.initialReserve = f.remainingReserve = 1.4e6; const wells = rig(g, f, 2), r = run(g, wells, 720, 90);
  T('1a wells were built', wells.length >= 1, wells.length);
  T('1b the daily output never rises over the years (it only falls or stays)', r.rates.every((v, i) => i === 0 || v <= r.rates[i - 1] * 1.001), r.rates.map(Math.round));
  T('1c it falls clearly over two years (the last quarter is below 85% of the first)', r.rates[r.rates.length - 1] < 0.85 * r.rates[0], r.rates.map(Math.round));
  T('1d it falls gradually, not in a step (no quarter loses more than 25% of the one before)', r.rates.every((v, i) => i === 0 || v > 0.75 * r.rates[i - 1]), r.rates.map(Math.round));
  T('1e the reservoir pressure fell from 1 and stays above its floor', f.pr < 1 && f.pr >= P.PR_FLOOR, f.pr);
  T('1f the field lost exactly what the wells took (conservation, no injection)', near(f.initialReserve - f.remainingReserve, r.oil, 0.002), [f.initialReserve - f.remainingReserve, r.oil]); }

console.log('2. the pressure drives the output');
{ const a = newWorld(), fa = open(a, fields(a)[2]); fa.props.capacity = 1e6; const wa = rig(a, fa, 1), b = newWorld(), fb = open(b, fields(b)[2]); fb.props.capacity = 1e6; const wb = rig(b, fb, 1);
  run(a, wa, 3); fb.pr = 0.4; run(b, wb, 3);
  T('2a at 40% pressure a well delivers only (0.4 + 0.6 x 0.4) = 64% of what it delivers at full pressure', near(wb[0].s._target / wa[0].s._target, (0.4 + 0.6 * 0.4) / (0.4 + 0.6 * 1), 0.01), [wb[0].s._target, wa[0].s._target]);
  T('2b the wellhead pressure shown follows the reservoir pressure', wb[0].s._p < wa[0].s._p && wb[0].s._p > 0, [wa[0].s._p, wb[0].s._p]);
  T('2c the well panel shows the reservoir pressure (percent of the original)', I.Sim.prototype.indicators.call(b.sim, wb[0]).list.some(i => i.k === 'Reservoir Pressure' && Math.abs(i.v - 40) < 2), I.Sim.prototype.indicators.call(b.sim, wb[0]).list.map(i => i.k));
  fb.pr = 1; run(b, wb, 3); T('2d with the pressure back the output is back too (pressure, not a stored decline, decides)', near(wb[0].s._target, wa[0].s._target, 0.01)); }

console.log('3. injection wells hold the pressure and improve the recovery');
{ const mk = inj => { const g = newWorld(), f = open(g, fields(g)[2]); f.props.capacity = 2500; f.props.decline = 0.15; const w = rig(g, f, 2); run(g, w, 2); for (let i = 0; i < inj; i++) g.world.drillWell('INJECTION', f.id, i); const r = run(g, w, 540, 90); return { g, f, w, r, inj }; };
  const none = mk(0), two = mk(2);
  T('3a with injection the pressure drops less over the same production period', two.f.pr > none.f.pr, [none.f.pr, two.f.pr]);
  T('3b so the output after 18 months is higher with injection', two.r.rates[two.r.rates.length - 1] > none.r.rates[none.r.rates.length - 1], [none.r.rates.map(Math.round), two.r.rates.map(Math.round)]);
  T('3c the support of 2 injectors is ' + Math.round(W.createWorld().injectionSupport({ injectors: 2 }) * 100) + '% and never passes ' + P.INJ_MAX * 100 + '%', W.createWorld().injectionSupport({ injectors: 2 }) > 0.4 && W.createWorld().injectionSupport({ injectors: 100 }) === P.INJ_MAX && W.createWorld().injectionSupport({ injectors: 0 }) === 0);
  T('3d injection raises the recovery: extra recoverable oil appears (gain > 0) only with injectors', two.f.gain > 0 && !(none.f.gain > 0), [none.f.gain, two.f.gain]);
  T('3e the gain is a small part of the oil produced (recovery bonus x support), never more', two.f.gain > 0 && two.f.gain <= two.f.produced * P.RECOVERY_BONUS * P.INJ_MAX + 1, [two.f.gain, two.f.produced]);
  T('3f the books of the reserve balance with injection: produced = initial + gain - what is left', near(two.f.produced, two.f.initialReserve + two.f.gain - two.f.remainingReserve, 0.001), [two.f.produced, two.f.initialReserve + two.f.gain - two.f.remainingReserve]);
  T('3g the original reserve of the field is not changed by injection', two.f.initialReserve === none.f.initialReserve);
  T('3h injection wells cost money to run every day (charged to the cost of the crude)', two.g.ts.injectionCostDay() === 2 * P.INJ_OP_DAY && none.g.ts.injectionCostDay() === 0 && P.INJ_OP_DAY > 0);
  T('3i an injection well on a field with no production is refused', (() => { const g = newWorld(), f = open(g, fields(g)[3]); return g.world.drillWell('INJECTION', f.id).reason === 'state'; })()); }

console.log('4. the cost of lifting follows the depth and the pressure');
{ const g = newWorld(), fs = g.world.allSites().filter(s => s.kind === 'FIELD'), lo = fs.reduce((p, q) => q.props.extractCost < p.props.extractCost ? q : p), hi = fs.reduce((p, q) => q.props.extractCost > p.props.extractCost ? q : p);
  T('4a a deeper, dearer field costs more to lift than a shallow cheap one (' + lo.props.extractCost + ' vs ' + hi.props.extractCost + ' $/bbl)', g.world.liftFactor(hi.id) > g.world.liftFactor(lo.id) * 1.5);
  const mean = fs.reduce((a, s) => a + g.world.liftFactor(s.id), 0) / fs.length;
  T('4b on average the factor is about 1, so the total economy keeps its balance (' + mean.toFixed(2) + ')', mean > 0.8 && mean < 1.3, mean);
  const f = fs[0]; const c0 = g.world.liftFactor(f.id); f.pr = 0.4; const c1 = g.world.liftFactor(f.id); f.pr = undefined;
  T('4c lifting gets dearer as the pressure falls (at 40% pressure: ' + (c1 / c0).toFixed(2) + ' x)', near(c1 / c0, 1 + P.LIFT_PRESSURE * 0.6, 0.01), [c0, c1]);
  T('4d the cost really enters the books: the same oil costs more to lift at a dear field', (() => {
    const cost = f => { const g2 = newWorld(), fld = open(g2, fields(g2)[2]); fld.props.extractCost = f; const w = rig(g2, fld, 1); const co = new E.Company(g2.store, g2.net, g2.sim, { now: () => 1e12 }); for (const b of g2.store.list()) g2.sim.ensure(b); co.advanceHours(48); return { life: co.led.life.produced.CRUDE, inc: co.journal.bal.INV_CRUDE + (co.journal.bal.EXP_LOSS || 0) }; };
    const cheap = cost(6), dear = cost(25); return dear.life > 0 && (dear.inc / dear.life) > (cheap.inc / cheap.life); })()); }

console.log('5. production never passes the reserve or the capacity of the field');
{ const g = newWorld(), f = open(g, fields(g)[2]); f.props.capacity = 1500; const wells = rig(g, f, 4); let worstDay = 0, total = 0;
  for (let d = 0; d < 200; d++) { for (const t of g.tanks) if (t.s) t.s.vol = 0; for (let q = 0; q < 4; q++) g.sim.step(0.25); let day = 0; for (const w of wells) if (w.s._out) day += w.s._out * (1 - w.s._wc - w.s._gas); worstDay = Math.max(worstDay, day); total += day; }
  T('5a no day delivers more than the capacity of the field (' + Math.round(worstDay) + ' of ' + f.props.capacity + ')', worstDay <= f.props.capacity * 1.001, worstDay);
  T('5b the total never exceeds the reserve', total <= f.initialReserve && f.remainingReserve >= 0, [total, f.initialReserve]);
  const h = newWorld(), g2 = open(h, fields(h)[3]); g2.remainingReserve = 30000; g2.props.decline = 0.2; const w2 = rig(h, g2, 3); const r = run(h, w2, 400);
  T('5c a field that runs out stops: the oil taken is exactly what it had, the state is depleted, nothing regenerates', near(r.oil, 30000, 0.002) && g2.remainingReserve === 0 && h.world.stateOf(g2.id) === 'DEPLETED', [r.oil, g2.remainingReserve]);
  T('5d the pressure never goes below its floor, even when the field is empty', g2.pr >= P.PR_FLOOR - 1e-12, g2.pr); }

console.log('6. save and restore of production, pressure and reserves');
{ const g = newWorld(), f = open(g, fields(g)[2]); f.props.capacity = 2500; const w = rig(g, f, 2); run(g, w, 5); g.world.drillWell('INJECTION', f.id, 1); run(g, w, 60);
  const snap = JSON.parse(JSON.stringify(g.world.reserveSnapshot())), ps = JSON.parse(JSON.stringify(g.world.progressSnapshot())), h = newWorld(); h.world.restoreProgress(ps); h.world.restoreReserve(snap); const f2 = h.world.siteById(f.id);
  T('6a the pressure, the remaining reserve, the recovery gain and the oil produced come back exactly', near(f2.pr, f.pr, 1e-5) && f2.remainingReserve === f.remainingReserve && near(f2.gain, f.gain, 1e-6) && near(f2.produced, f.produced, 1e-6) && f2.injectors === 1, [f.pr, f2.pr, f.gain, f2.gain]);
  T('6b the restored field keeps the books balanced (produced = initial + gain - left)', near(f2.produced, f2.initialReserve + f2.gain - f2.remainingReserve, 0.001));
  T('6c an old save without pressure starts at full pressure', (() => { const o = newWorld(), s = o.world.siteById(f.id); o.world.restoreReserve({ n: 1, w: [], f: [[f.id, f.remainingReserve, 0, 0, 1]] }); return o.world.pressureOf(f.id) === 1 && s.remainingReserve === f.remainingReserve; })());
  T('6d the save stays small (one entry per field that was touched)', snap.f.length === 1 && JSON.stringify(snap).length < 700, JSON.stringify(snap).length);
  const before = f2.pr; const sim2 = new I.Sim(B.BuildingStore.fromJSON(h.ts, JSON.parse(JSON.stringify(g.store.toJSON()))).store, new I.PipeNet(h.ts.W)); sim2.step(1);
  T('6e a restored game goes on from the saved pressure (a step without pipes does not change it)', f2.pr === before); }

console.log('\nPRODUCTION TESTS: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
