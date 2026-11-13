/* shared kit for the central network tests */
const W = require('./worldmap.js'), B = require('./buildings.js'), I = require('./industry.js'), C = require('./central.js'), E = require('./economy.js'), EC = require('./economy-config.js');
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t) * Math.max(1, Math.abs(a), Math.abs(b));
const world = W.createWorld({ seed: 20260101 });

function mk(opts) {
  opts = opts || {}; const ts = B.fromWorld(world), store = new B.BuildingStore(ts, { cash: opts.cash == null ? 500e6 : opts.cash }), net = new I.PipeNet(world.W), sim = new I.Sim(store, net), co = new E.Company(store, net, sim, { now: () => 1e12 });
  const g = { ts, store, net, sim, co }; if (opts.central !== false) { g.inst = C.install(store, net); g.cn = g.inst.cn; } return g;
}
const stB = (g, id) => g.store.get(g.cn.st.get(id).b);
/* a building of kind `def` close to station `st` whose port toward the channel is wired to the station: dir 'out' = it pushes into the network (source), 'in' = it takes from it */
function attach(g, def, st, ch, dir, vol, dia) {
  if (Array.isArray(st)) { for (const s1 of st) { const b = attach(g, def, s1, ch, dir, vol, dia); if (b) return b; } return null; }
  const sb = stB(g, st);
  for (const portId of C.PORTS[ch]) { if (g.net.lines.size) { let taken = false; for (const L of g.net.lines.values()) for (const e of [L.a, L.b]) if (e && e.b === sb.id && e.port === portId) taken = true; if (taken) continue; }
    const pp = B.worldPoints(sb).find(p => p.id === portId); let tries = 0;
    for (let d = 2; d <= 30; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
      const x = pp.ax + dx, y = pp.ay + dy, v = g.store.validate(def, x, y, 0, { ignoreCash: true }); if (!v.ok) continue; const p = g.store.place(def, x, y, 0, { instant: true, ignoreCash: true }); if (!p.ok) continue; const b = p.building; let done = false;
      for (const q of B.worldPoints(b)) { if (q.kind !== 'pipe' || q.role !== dir) continue; const r = I.layPipe(g.store, g.net, g.ts, { b: b.id, port: q.id }, { b: sb.id, port: portId }, dia || 36, { ignoreCash: true }); if (r.ok) { done = true; break; } }
      if (done) { if (vol != null) g.sim.ensure(b).vol = vol; b.__st = st; return b; } g.store.demolish(b.id, { building: true, pipes: true }); if (++tries > 40) { d = 99; dy = 99; break; } } }
  return null;
}
const run = (g, n, dt) => { for (let i = 0; i < n; i++) g.sim.step(dt || 0.05); };
const TANK = { CRUDE: ['crude_tank_m', 'crude_tank_m'], GASOLINE: ['gasoline_tank_m', 'gasoline_tank_m'], DIESEL: ['diesel_tank_m', 'diesel_tank_m'], JET_FUEL: ['jet_tank_m', 'jet_tank_m'], GAS: ['gas_sphere_m', 'gas_sphere_m'], WATER: ['water_tank_m', 'water_tank_m'] };
const secOf = (x, y) => world.sectorAt(x, y);
module.exports = { W, B, I, C, E, EC, world, mk, stB, attach, run, secOf, near };
