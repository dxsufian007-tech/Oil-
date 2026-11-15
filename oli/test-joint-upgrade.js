/* Joint upgrade (valve / junction / main manifold): tiers derived from the pipe tiers, paid, real effect on flow. node test-joint-upgrade.js */
const { B, I, E, EC, game, put, pipe, reload } = require('./test-reserve-helpers.js');
const CFG = require('./building-config.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };

console.log('1. tier table is derived (not invented)');
{ const tv = CFG.jointTiers('valve'), tj = CFG.jointTiers('junction'), tm = CFG.jointTiers('main_manifold');
  T('1a valve 40,000 -> 100,000 -> 300,000 (the 16" and 36" pipe capacities)', tv.map(x => x.capacity).join() === '40000,100000,300000');
  T('1b junction 60,000 -> 100,000 -> 300,000', tj.map(x => x.capacity).join() === '60000,100000,300000');
  T('1c price = own price x (new/old - 1): valve 90,000 then 120,000; junction 80,000 then 240,000', tv[1].cost === 90000 && tv[2].cost === 120000 && tj[1].cost === 80000 && tj[2].cost === 240000);
  T('1d the main manifold is already at the top tier (300,000 = a 36" pipe): no upgrade offered', tm.length === 1);
  T('1e unknown buildings (pump, central station) have no joint tiers', !CFG.jointTiers('pump_station_c') && !CFG.jointTiers('central_station')); }

/* rig: central tank -> 36" -> JOINT -> 36" -> central pump -> 36" -> tank. The joint is the narrowest element (60,000 / 40,000) until it is upgraded. */
function rig(kind) { const g = game(1e9), A = put(g, 'crude_tank_c', 10, 10), J = put(g, kind, 60, 10), PU = put(g, 'pump_station_c', 100, 10), T2 = put(g, 'crude_tank_c', 160, 10);
  const pi = kind === 'valve' ? 'IN' : 'PORT_W', po = kind === 'valve' ? 'OUT' : 'PORT_E';
  pipe(g, A, 'OUTPUT_E', J, pi, 36); pipe(g, J, po, PU, 'INPUT_1', 36); pipe(g, PU, 'OUTPUT_1', T2, 'INPUT_W', 36); const s = g.sim; s.ensure(A).vol = 3e6; s.ensure(A).prod = 'CRUDE';
  if (kind === 'valve') { const v = s.ensure(J); v.mode = 'OPEN'; }
  const run = () => { for (let i = 0; i < 80; i++) s.step(0.05); return Math.round(Math.max(...[...g.net.lines.values()].map(L => L.flow || 0))); };
  return { g, J, run, lines: () => [...g.net.lines.values()].map(L => [L.a.b, L.b.b, JSON.stringify(L.path), L.dia, L.open].join('|')) }; }

console.log('2. real flow: the joint is the bottleneck, then it is not');
for (const [kind, c1, c2, c3] of [['junction', 60000, 100000, 200000], ['valve', 40000, 100000, 200000]]) {
  const r = rig(kind), g = r.g; const f1 = r.run(), i1 = I.jointInfo(g.store, g.net, r.J.id, g.sim);
  T('2a ' + kind + ': real flow = the joint capacity ' + c1, f1 === c1, f1);
  T('2b ' + kind + ': info names the joint as the limit and gains from the upgrade', i1.ok && i1.limitNow === 'joint' && i1.next && i1.next.capacity === 100000 && i1.effectiveGain > 0, i1);
  const cash0 = g.store.cash, geo = r.lines(), up = I.upgradeJoint(g.store, g.net, r.J.id), f2 = r.run();
  T('2c ' + kind + ' L1->L2: paid exactly the tier price, level 2, flow becomes 100,000', up.ok && up.cost === CFG.jointTiers(kind)[1].cost && g.store.cash === cash0 - up.cost && r.J.lv === 2 && f2 === c2, [up, f2]);
  const up2 = I.upgradeJoint(g.store, g.net, r.J.id), f3 = r.run(), i3 = I.jointInfo(g.store, g.net, r.J.id, g.sim);
  T('2d ' + kind + ' L2->L3: flow goes up to the PUMP limit 200,000 (never above the pump)', up2.ok && r.J.lv === 3 && f3 === c3, f3);
  T('2e ' + kind + ' at the top tier: next=null, refused with "max", nothing charged; the limit is now the pump', !i3.next && I.upgradeJoint(g.store, g.net, r.J.id).reason === 'max' && g.store.cash === cash0 - up.cost - up2.cost && i3.limitNow === 'pump', i3);
  T('2f ' + kind + ': pipes, ports and path untouched by the upgrade', JSON.stringify(r.lines()) === JSON.stringify(geo)); }

console.log('3. refusals and no double charge');
{ const r = rig('junction'), g = r.g; g.store.cash = 1000; const cash0 = g.store.cash, rev0 = g.net.rev, p = I.upgradeJoint(g.store, g.net, r.J.id);
  T('3a not enough cash: refused with the price, level and cash unchanged', !p.ok && p.reason === 'cash' && p.cost === 80000 && !r.J.lv && g.store.cash === cash0 && g.net.rev === rev0);
  g.store.cash = 1e9; const a = I.upgradeJoint(g.store, g.net, r.J.id), c1 = g.store.cash; const b = I.upgradeJoint(g.store, g.net, r.J.id); T('3b two clicks = two DIFFERENT tiers (each charged once), never the same tier twice', a.ok && b.ok && a.to === 2 && b.to === 3 && g.store.cash === c1 - b.cost);
  const pump = g.store.get(3); T('3c a pump / non-joint is refused (notJoint)', pump && I.upgradeJoint(g.store, g.net, pump.id).reason === 'notJoint');
  T('3d a missing building is refused', I.upgradeJoint(g.store, g.net, 99999).reason === 'noBuilding'); }

console.log('4. several pipes on one joint + manifold');
{ const g = game(1e9), A = put(g, 'crude_tank_c', 10, 10), Bt = put(g, 'crude_tank_c', 10, 60), J = put(g, 'junction', 60, 40), C = put(g, 'crude_tank_c', 110, 40);
  pipe(g, A, 'OUTPUT_E', J, 'PORT_W', 36); pipe(g, Bt, 'OUTPUT_E', J, 'PORT_S', 36); pipe(g, J, 'PORT_E', C, 'INPUT_W', 36); const i = I.jointInfo(g.store, g.net, J.id, g.sim);
  T('4a three pipes on one junction are counted; 4 ports, 3 used', i.ok && i.ports === 4 && i.portsUsed === 3 && i.ends.length === 3);
  const M = put(g, 'main_manifold', 60, 90), im = I.jointInfo(g.store, g.net, M.id, g.sim);
  T('4b manifold: 12 ports (9 in / 3 out), level 1 of 1, next=null, reason topTier', im.ok && im.inPorts === 9 && im.outPorts === 3 && im.maxLevel === 1 && !im.next && im.why === 'topTier' && I.upgradeJoint(g.store, g.net, M.id).reason === 'max');
  const cs = put(g, 'central_station', 120, 100); T('4c the central station is not a joint here', !cs || I.upgradeJoint(g.store, g.net, cs.id).reason === 'notJoint'); }

console.log('5. save / load and old saves');
{ const r = rig('junction'), g = r.g; I.upgradeJoint(g.store, g.net, r.J.id); I.upgradeJoint(g.store, g.net, r.J.id); const g2 = reload(g), J2 = g2.store.list().find(x => x.d === 'junction');
  T('5a level 3 survives save and load', J2 && J2.lv === 3);
  const i2 = I.jointInfo(g2.store, g2.net, J2.id, g2.sim); T('5b capacity after reload = 300,000 (not reset to 60,000)', i2.capacity === 300000 && i2.level === 3);
  const g3 = rig('junction'), J3 = g3.J; delete J3.lv; T('5c an old save (no lv) is level 1: unchanged 60,000 capacity', I.jointCap(J3) === 60000 && I.jointInfo(g3.g.store, g3.g.net, J3.id).level === 1); }

console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
