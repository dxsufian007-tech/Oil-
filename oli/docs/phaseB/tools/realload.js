/* loads the exported real save the way the app does (building-lab.js loadFrom), keeping the central network */
const path = require('path'), ROOT = process.env.ROOT || path.join(__dirname, '../../..'), fs = require('fs');
const K = require(path.join(ROOT, 'test-central-kit.js')), { I, B, world } = K, E = require(path.join(ROOT, 'economy.js'));
function build() {
  const d = JSON.parse(fs.readFileSync(process.env.SAVE || path.join(__dirname, '../realsave.json'), 'utf8')), ts = B.fromWorld(world);
  world.restoreProgress(d.wd.p); world.restoreReserve(d.wd.r); world.restoreZones(d.wd.z);
  const r = B.BuildingStore.fromJSON(ts, d.store, { cash: d.cash }), store = r.store; store.cash = d.cash;
  const net = I.PipeNet.fromJSON(ts.W, d.net), sim = new I.Sim(store, net), co = new E.Company(store, net, sim, { now: () => 1e12 }); co.fromJSON(d.eco); co.setSpeed(0); for (const b of store.list()) sim.ensure(b);
  console.error('loaded', JSON.stringify({ loaded: r.report.loaded, dropped: r.report.dropped, buildings: store.list().length, seg: net.central.seg.size, st: net.central.st.size, pumps: net.central.pumps.size, hours: co.hours }));
  return { g: { store, net, sim, co, ts }, co };
}
module.exports = { build };
