// Auto-link with the CENTRAL tank (8x8, 4M bbl) and a network of 100 tanks with pumps, pipes and flow: nothing duplicated, nothing lost, capacities respected, the simulator stays cheap.   node test-auto-link-big.js
const H = require('./test-reserve-helpers.js'), { B, I, game, put } = H, assert = require('assert');
let n = 0; const ok = (c, m, x) => { if (!c) console.log('  FAIL ' + m + (x ? ' ' + JSON.stringify(x) : '')); assert(c, m); n++; console.log('  ok  ' + m); };
const lines = g => [...g.net.lines.values()], link = (g, t) => I.autoLinkTank(g.store, g.net, g.ts, t.id), CAP = B.DEFS.crude_tank_c.capacity.value;
const portUse = g => { const m = new Map(); let clash = 0; for (const L of lines(g)) for (const e of [L.a, L.b]) { const k = e.b + '/' + e.port; if (m.has(k)) clash++; m.set(k, 1); } return clash; };

{ // 1. central tanks 8x8 side by side (gap 2 and gap 1)
  for (const gap of [2, 1]) {
    const g = game(), a = put(g, 'crude_tank_c', 40, 40), b = put(g, 'crude_tank_c', 40 + 8 + gap, 40), r = link(g, b);
    ok(r.linked.length === 1 && lines(g).length === 2 && lines(g).every(L => L.open !== false), 'central tanks 8x8, gap ' + gap + ': linked, two lines, both open', r.skipped);
    g.sim.build(); const x = g.sim.ensure(a), y = g.sim.ensure(b); x.prod = y.prod = 'CRUDE'; x.vol = CAP * .9; y.vol = 0; const tot = x.vol; g.sim.run(5);
    ok(y.vol > 0 && Math.abs(x.vol + y.vol - tot) < 1e-6 * tot && y.vol <= CAP + 1e-6 && x.vol >= 0, '  open lines: oil moves A->B (' + Math.round(y.vol) + ' bbl), total constant, within the 4M capacity');
  }
  { const g2 = game(1e12), a2 = put(g2, 'crude_tank_c', 40, 40), b2 = put(g2, 'crude_tank_c', 50, 40); link(g2, b2); g2.sim.build(); const x = g2.sim.ensure(a2), y = g2.sim.ensure(b2); x.vol = 1e6; g2.sim.run(40);   // regression: a fresh empty tank (no product yet) used to send back what it got
    ok(Math.abs(x.vol - y.vol) < 1e3 && Math.abs(x.vol + y.vol - 1e6) < 1, 'full tank fills the empty neighbour and they LEVEL OUT (' + Math.round(x.vol) + ' / ' + Math.round(y.vol) + ')'); }
  const g = game(), a = put(g, 'crude_tank_c', 40, 40), c = put(g, 'crude_tank_c', 40, 50), d = put(g, 'gasoline_tank_l', 50, 40); link(g, c); const r = link(g, d);
  ok(r.skipped.some(s => s.reason === 'invalidProduct') && lines(g).length === 2, 'a central gasoline tank beside a crude one is refused (invalidProduct)');
}
{ // 2. a 10x10 grid of 100 central tanks, built one by one (each links to its neighbours), then pumps + flow
  const g = game(1e13), T = [], t0 = Date.now(); let linkedTotal = 0, skipped = [];
  for (let j = 0; j < 10; j++) for (let i = 0; i < 10; i++) { const t = put(g, 'crude_tank_c', 20 + i * 10, 20 + j * 10); T.push(t); const r = link(g, t); linkedTotal += r.linked.length; skipped.push(...r.skipped.filter(s => s.reason !== 'exists')); }
  const ms = Date.now() - t0; ok(T.length === 100, '100 central tanks built, each auto-linked as it was placed (' + ms + ' ms in all)');
  ok(linkedTotal === 180 && lines(g).length === 360, 'a 10x10 grid has 180 neighbour pairs: 180 connections, 360 lines (' + linkedTotal + ' / ' + lines(g).length + ')', { skipped: skipped.slice(0, 3) });
  ok(portUse(g) === 0, 'no port is used by two lines anywhere in the network');
  ok(lines(g).every(L => L.open !== false), 'every one of the 360 lines starts open');
  const keys = lines(g).map(L => [L.a.b, L.a.port, L.b.b, L.b.port].join('/')); ok(new Set(keys).size === keys.length, 'no duplicate connection between any pair');
  // pumps + feed: a pump station beside tank (0,0), another beside tank (9,9)
  const p1 = put(g, 'pump_station_l', 10, 20), p2 = put(g, 'pump_station_l', 120, 20 + 90 + 2);
  const c1 = I.layConnect(g.store, g.net, g.ts, p1.id, T[0].id, {}), c2 = I.layConnect(g.store, g.net, g.ts, T[99].id, p2.id, {});
  ok(c1.ok && c2.ok, 'two pump stations connected to the network corners with the normal connect tool', { a: c1.reason, b: c2.reason });
  g.sim.build(); for (const t of T) g.sim.ensure(t).prod = 'CRUDE'; const s0 = g.sim.ensure(T[0]); s0.vol = CAP * .95; for (let i = 1; i < 100; i++) g.sim.ensure(T[i]).vol = 0;
  const total = () => T.reduce((q, t) => q + g.sim.ensure(t).vol, 0), tot0 = total(), t1 = process.hrtime.bigint(); g.sim.run(10); const stepMs = Number(process.hrtime.bigint() - t1) / 1e6;
  ok(Math.abs(total() - tot0) < 1e-6 * tot0, 'after 10 days with every line open the total oil is unchanged (' + Math.round(tot0) + ' bbl)');
  ok(T.every(t => g.sim.ensure(t).vol >= -1e-9 && g.sim.ensure(t).vol <= CAP + 1e-6), 'every tank stays between 0 and its 4M capacity');
  ok(g.sim.ensure(T[99]).vol > 0 && g.sim.ensure(T[1]).vol > 0, 'oil spread through the open network (far corner: ' + Math.round(g.sim.ensure(T[99]).vol) + ' bbl)');
  const per = (() => { g.sim.build(); const q = process.hrtime.bigint(); for (let i = 0; i < 200; i++) g.sim.step(1 / 24); return Number(process.hrtime.bigint() - q) / 1e6 / 200; })();
  ok(per < 5, 'one simulator step on the 100-tank network costs ' + per.toFixed(2) + ' ms (limit 5 ms); build of the network ' + ms + ' ms; 10 days ' + Math.round(stepMs) + ' ms');
  const sv = JSON.stringify(g.net.toJSON()), n2 = I.PipeNet.fromJSON(g.ts.W, JSON.parse(sv)); ok(n2.lines.size === 362 + 0 || n2.lines.size === lines(g).length, 'the network saves and loads whole (' + n2.lines.size + ' lines, ' + Math.round(sv.length / 1024) + ' KB)');
}
console.log('AUTO-LINK BIG TESTS PASSED (' + n + ' checks)');
