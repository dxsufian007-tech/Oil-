/* Pipe diameter upgrade (player-chosen, paid, never smaller). node test-pipe-upgrade.js */
const { B, I, E, EC, game, put, pipe, reload } = require('./test-reserve-helpers.js');
const CFG = require('./building-config.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const P = CFG.PIPES;
function rig(dia, srcDef, dstDef) { const g = game(1e9), A = put(g, srcDef || 'crude_tank_m', 10, 10), Bt = put(g, dstDef || 'crude_tank_l', 70, 10); const po = d => B.DEFS[d].connections.find(c => c.role === 'out' && c.id !== 'WATER_OUT').id, pi = d => B.DEFS[d].connections.find(c => c.role === 'in').id; const r = pipe(g, A, po(srcDef || 'crude_tank_m'), Bt, pi(dstDef || 'crude_tank_l'), dia); return Object.assign(g, { A, Bt, L: g.net.lines.get(r.line ? r.line.id : [...g.net.lines.keys()][0]) }); }
const snap = L => JSON.stringify({ a: L.a, b: L.b, path: L.path, product: L.product, open: L.open, conn: L.conn });

console.log('1. 8 -> 16 and 16 -> 36');
{ const g = rig(8), L = g.L, s0 = snap(L), tiles = L.path.length, cash0 = g.store.cash, rev0 = g.net.rev;
  T('1a the line starts at 8" (30,000 bbl/day)', +L.dia === 8 && P[8].capacity === 30000 && tiles > 20);
  const r = I.upgradePipe(g.store, g.net, L.id, 16); const cost = tiles * (P[16].cost - P[8].cost);
  T('1b 8 -> 16 succeeds; cost = tiles x (40,000 - 12,000)', r.ok && r.cost === cost && r.from === 8 && r.to === 16 && r.capacityBefore === 30000 && r.capacityAfter === 100000, r);
  T('1c cash falls by exactly that cost', g.store.cash === cash0 - cost);
  T('1d diameter is 16 and the real capacity is 100,000', +L.dia === 16 && g.net.rev === rev0 + 1);
  T('1e path, both ends, ports, product, valve state and pairing are byte-identical', snap(L) === s0);
  const r2 = I.upgradePipe(g.store, g.net, L.id, 36), c2 = tiles * (P[36].cost - P[16].cost); T('1f 16 -> 36: cost = tiles x (120,000 - 40,000), diameter 36, 300,000 bbl/day', r2.ok && r2.cost === c2 && +L.dia === 36 && r2.capacityAfter === 300000 && g.store.cash === cash0 - cost - c2);
  T('1g still the same path/ends after the second upgrade', snap(L) === s0);
  const g2 = rig(8); const t2 = g2.L.path.length, rr = I.upgradePipe(g2.store, g2.net, g2.L.id, 36); T('1h 8 -> 36 directly costs tiles x (120,000 - 12,000)', rr.ok && rr.cost === t2 * (P[36].cost - P[8].cost)); }

console.log('2. refusals change nothing');
{ const g = rig(16), L = g.L, s0 = snap(L), cash0 = g.store.cash, rev0 = g.net.rev;
  const rs = [I.upgradePipe(g.store, g.net, L.id, 8), I.upgradePipe(g.store, g.net, L.id, 16), I.upgradePipe(g.store, g.net, L.id, 24), I.upgradePipe(g.store, g.net, 999, 36)];
  T('2a smaller / same / unknown diameter / missing line are refused with their reasons', rs.map(r => r.reason).join() === 'smaller,same,badDia,noLine', rs);
  T('2b nothing changed: diameter, cash, revision, geometry', +L.dia === 16 && g.store.cash === cash0 && g.net.rev === rev0 && snap(L) === s0);
  g.store.cash = 1000; const poor = I.upgradePipe(g.store, g.net, L.id, 36); T('2c not enough cash: refused with the price, nothing changed', !poor.ok && poor.reason === 'cash' && poor.cost > 1000 && +L.dia === 16 && g.store.cash === 1000); }

console.log('3. options table: capacity, cost, downtime and the REAL limit');
{ const g = rig(8), o = I.pipeUpgradeOptions(g.store, g.net, g.L.id), tiles = g.L.path.length;
  T('3a three diameters 8/16/36 with 30k / 100k / 300k', o.options.map(x => x.dia + ':' + x.capacity).join() === '8:30000,16:100000,36:300000');
  T('3b 8 is the current (not allowed), 16 and 36 allowed with their increases and costs', !o.options[0].allowed && o.options[1].allowed && o.options[1].increase === 70000 && o.options[2].increase === 270000 && o.options[1].cost === tiles * 28000 && o.options[2].cost === tiles * 108000);
  T('3c downtime is zero (the pipe keeps working) and the table never offers a smaller pipe as allowed', o.downtimeHours === 0 && o.options.filter(x => x.allowed).every(x => x.capacity > o.capacity));
  const g16 = rig(16), o16 = I.pipeUpgradeOptions(g16.store, g16.net, g16.L.id); T('3d on a 16" pipe the 8" option is refused as smaller', o16.options[0].reason === 'smaller' && !o16.options[0].allowed && o16.options[1].reason === 'current');
  /* nominal capacity is not flow: a big pipe between a small pump and a tank carries only what the pump can */
  const gp = game(1e9), T1 = put(gp, 'crude_tank_m', 10, 10), PU = put(gp, 'pump_station_s', 50, 10), T2 = put(gp, 'crude_tank_l', 90, 10); pipe(gp, T1, 'OUTPUT_E', PU, 'INPUT', 16); const rp = pipe(gp, PU, 'OUTPUT', T2, 'INPUT_W', 8), lid = rp.line ? rp.line.id : [...gp.net.lines.keys()].pop(), op = I.pipeUpgradeOptions(gp.store, gp.net, lid), mf = B.DEFS.pump_station_s.params.maxFlow;
  T('3e a small pump on the line limits the real flow: effective = the pump, not the nominal 300,000', op.need > 0 && op.need <= mf + 1e-6 && op.options[2].effective === op.need && op.options[2].effective < op.options[2].capacity && op.options[2].limit === 'ends', [op.need, mf, op.options[2]]);
  const gc = rig(8, 'crude_tank_c', 'pump_station_c'), oc = I.pipeUpgradeOptions(gc.store, gc.net, gc.L.id);
  T('3f a central tank into a central pump needs 200,000: 16" still bottlenecks (limit pipe), 36" removes the bottleneck', oc.need === 200000 && oc.options[1].limit === 'pipe' && oc.options[1].effective === 100000 && oc.options[2].limit === null && oc.options[2].effective === 200000, oc.options.map(x => [x.dia, x.limit, x.effective]));
  const go = game(1e9), A = put(go, 'crude_tank_m', 10, 10), Lo = I.layOpenPipe(go.store, go.net, go.ts, { b: A.id, port: 'OUTPUT_E' }, [40, 12], 8); const oo = I.pipeUpgradeOptions(go.store, go.net, Lo.line ? Lo.line.id : [...go.net.lines.keys()][0]);
  T('3g an open-ended pipe can be upgraded too, and says it carries nothing until connected', oo.ok && !oo.connected && oo.options[1].limit === 'open' && oo.options[1].effective === 0); }

console.log('4. the real simulation after the upgrade');
{ const g = game(1e9), A = put(g, 'crude_tank_c', 10, 10), PU = put(g, 'pump_station_c', 60, 10), T2 = put(g, 'crude_tank_c', 120, 10); pipe(g, A, 'OUTPUT_E', PU, 'INPUT_1', 8); pipe(g, PU, 'OUTPUT_1', T2, 'INPUT_W', 36); const L = [...g.net.lines.values()][0], s = g.sim; s.ensure(A).vol = 3e6; s.ensure(A).prod = 'CRUDE';
  const run = () => { for (let i = 0; i < 80; i++) s.step(0.05); return Math.round(L.flow || 0); }, info = () => s.pipeInfo(L.path[0][0], L.path[0][1]);
  const f8 = run(), i8 = info(); I.upgradePipe(g.store, g.net, L.id, 16); const i16 = info(), f16 = run(); I.upgradePipe(g.store, g.net, L.id, 36); const i36b = info(), f36 = run(), i36 = info();
  T('4a real flow follows the pipe: 8" carries 30,000, 16" carries 100,000', f8 === 30000 && f16 === 100000, [f8, f16]);
  T('4b with a 36" pipe (nominal 300,000) the real flow is only the central pump\'s 200,000: capacity is never shown as flow', f36 === 200000 && i36.capacity === 300000 && i36.currentFlow === 200000, [f36, i36 && i36.currentFlow]);
  T('4c pipeInfo (info panel + map data) shows the new diameter and capacity right away', i8.diameter === 8 && i8.capacity === 30000 && i16.diameter === 16 && i16.capacity === 100000 && i36b.diameter === 36 && i36b.capacity === 300000 && i36.capacity === 300000);
}
console.log('5. money books, save and load');
{ const g = rig(8), co = g.co; co.sync(); const pv0 = co.pipeValue(), cash0 = g.store.cash, ext0 = co.journal.bal.FIXED || 0, tiles = g.L.path.length;
  const r = I.upgradePipe(g.store, g.net, g.L.id, 16); co.sync();
  T('5a the cost is booked as pipeline works (cash down, fixed assets up by the same)', Math.abs((co.journal.bal.FIXED || 0) - ext0 - r.cost) < 1e-6 && co.audit().ok, [co.journal.bal.FIXED - ext0, r.cost]);
  T('5b the pipe value (asset) rose by exactly the price paid', Math.abs(co.pipeValue() - pv0 - r.cost) < 1e-6);
  const g2 = reload(g); const L2 = [...g2.net.lines.values()][0];
  T('5c after save/load the line is 16" with the same path, ends and product', +L2.dia === 16 && JSON.stringify(L2.path) === JSON.stringify(g.L.path) && JSON.stringify(L2.a) === JSON.stringify(g.L.a) && JSON.stringify(L2.b) === JSON.stringify(g.L.b) && L2.product === g.L.product);
  T('5d the loaded game values the pipe at the new price and its books balance', Math.abs(g2.co.pipeValue() - co.pipeValue()) < 1e-6 && g2.co.audit().ok);
  const old = JSON.parse(JSON.stringify(g.net.toJSON())); const n3 = I.PipeNet.fromJSON(400, old); T('5e the save format is unchanged: lines still carry only {id,a,b,path,product,dia,...}', Object.keys(old.lines[0]).every(k => ['id', 'a', 'b', 'path', 'product', 'dia', 'conn', 'open'].includes(k)) && n3.lines.size === 1);
  const g4 = rig(8), j = JSON.parse(JSON.stringify(g4.net.toJSON())); const g5 = I.PipeNet.fromJSON(400, j); T('5f an old save (never upgraded) loads exactly as before', +[...g5.lines.values()][0].dia === 8); }
console.log(pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1);
