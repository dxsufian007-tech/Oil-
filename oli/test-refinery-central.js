/* The refinery on the central network: its crude feed and its product outlets through central stations really work.
 *   node oli/test-refinery-central.js
 * Bugs this guards against (found by tracing a refinery wired to stations, Nov 2026):
 *   1. "🔗 توصيل" refinery <-> station laid the crude feed with its valve CLOSED (taken for the return line of a tank pair)
 *   2. once that valve was opened the two lines were taken for a tank "level-out" pair: the refinery is no tank -> NaN rate -> no crude, ever
 *   3. a second "توصيل" to the same station was refused although the refinery still had free outlets for other products
 *   4. an outlet whose product has no receiving tank on the whole network stopped the refinery but the card said «لا يصله شيء» */
const K = require('./test-central-kit.js'), { B, I, C } = K, H = require('./help.js'), BC = require('./building-config.js'), GC = require('./game-config.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' ' + JSON.stringify(x).slice(0, 400))); } };
const CH = { GASOLINE_OUT: 'GASOLINE', DIESEL_OUT: 'DIESEL', JET_OUT: 'JET_FUEL', GAS_OUT: 'GAS' }, TANK = { GASOLINE: 'gasoline_tank_l', DIESEL: 'diesel_tank_l', JET_FUEL: 'jet_tank_l', GAS: 'gas_sphere_l' };
const SINK_ST = ['N1', 'N2', 'N3', 'N4', 'S1', 'FS', 'F1', 'F2'];
/* a large refinery in a D refinery zone, two stations tapped on the trunk nearest to it */
function setup() {
  const g = K.mk(); let ref = null;
  for (let y = 420; y < 520 && !ref; y += 2) for (let x = 150; x < 230 && !ref; x += 2) if (K.secOf(x, y) === 'D1' && g.store.validate('refinery_l', x, y, 0, { ignoreCash: true }).ok) ref = g.store.place('refinery_l', x, y, 0, { instant: true, ignoreCash: true }).building;
  const cx = ref.x + 5, cy = ref.y + 4, tiles = []; for (const s of g.cn.seg.values()) for (const [x, y] of s.path) tiles.push([Math.hypot(x - cx, y - cy), x, y]); tiles.sort((a, b) => a[0] - b[0]);
  const st = []; for (const [, x, y] of tiles) { if (st.length >= 2) break; if (st.some(m => Math.hypot(m.x - x, m.y - y) < 8)) continue; const pl = C.planTap(g.store, g.net, x, y, {}); if (!pl.ok) continue; const r = C.commitTap(g.store, g.net, pl, { instant: true }); if (r.ok) st.push({ x, y, b: r.building.id }); }
  return { g, ref, S1: st[0].b, S2: st[1].b };
}
const linesOf = (g, id) => [...g.net.lines.values()].filter(L => (L.a && L.a.b === id) || (L.b && L.b.b === id));
const taken = (g, b, port) => [...g.net.lines.values()].some(L => [L.a, L.b].some(e => e && e.b === b && e.port === port));
function wireAll(x) {   // the player's way first ("🔗 توصيل" to each station, one-way allowed), then any outlet still free by hand
  const { g, ref, S1, S2 } = x; for (const [t, ow] of [[S1, false], [S1, false], [S2, true], [S2, true], [S2, true]]) I.layConnect(g.store, g.net, g.ts, ref.id, t, { ignoreCash: true, allowOneWay: ow });
  for (const [op, ch] of Object.entries(CH)) { if (taken(g, ref.id, op)) continue; let ok = false; for (const t of [S1, S2]) for (const sp of C.PORTS[ch]) { if (ok || taken(g, t, sp)) continue; for (const d of [36, 16, 8]) if (!ok && I.layPipe(g.store, g.net, g.ts, { b: ref.id, port: op }, { b: t, port: sp }, d, { ignoreCash: true }).ok) ok = true; } }
  return Object.keys(CH).filter(op => taken(g, ref.id, op)).map(op => CH[op]);
}
function feed(x, products) {
  const { g } = x; x.src = K.attach(g, 'crude_tank_l', ['N3', 'N4', 'N5', 'S1', 'FS'], 'CRUDE', 'out', 150000);      // 60%: under the auto-sell trigger, the crude stays for the refinery
  x.sinks = {}; for (const ch of products) x.sinks[ch] = K.attach(g, TANK[ch], SINK_ST, ch, 'in');
  for (const b of g.store.list()) g.sim.ensure(b);
  g.store.cash = 3e9; g.co.sync(); for (const [m, q] of [['CHEM', 20000], ['OPS', 5000]]) g.co.buy(m, q, 'A', 'CASH');
}
const ctx = g => ({ GC, B, BC, EC: K.EC, SIM: g.sim, store: g.store, pipes: g.net, company: g.co, CEN: K.C });

console.log('1. "🔗 توصيل" refinery <-> central station');
{ const x = setup(), { g, ref, S1 } = x; T('1a a large refinery in the D refinery zone and two stations tapped near it', !!ref && !!x.S2);
  const r1 = I.layConnect(g.store, g.net, g.ts, ref.id, S1, { ignoreCash: true }), L1 = linesOf(g, ref.id);
  const crude = L1.find(L => L.product === 'CRUDE'), out1 = L1.find(L => L.a.b === ref.id);
  T('1b one press lays the crude feed (station -> refinery) AND one product outlet (refinery -> station)', r1.ok && !!crude && !!out1 && crude.b.b === ref.id && crude.b.port === 'CRUDE_IN', L1.map(L => L.product));
  T('1c the crude feed is OPEN: two different products are not a return pair (no closed valve)', crude.open !== false && out1.open !== false);
  const r2 = I.layConnect(g.store, g.net, g.ts, ref.id, S1, { ignoreCash: true }), L2 = linesOf(g, ref.id).filter(L => L.a.b === ref.id);
  T('1d a second press to the SAME station adds the next product outlet (one line per product, never a duplicate)', r2.ok && L2.length === 2 && new Set(L2.map(L => L.product)).size === 2, [r2.reason, L2.map(L => L.product)]);
  const r3 = I.layConnect(g.store, g.net, g.ts, ref.id, S1, { ignoreCash: true }); const L3 = linesOf(g, ref.id).filter(L => L.a.b === ref.id);
  T('1e no two lines for the same product: every outlet line carries a different product', new Set(L3.map(L => L.product)).size === L3.length, L3.map(L => L.product));
  g.sim.step(0.05); T('1f the simulator builds no "level-out" link between a refinery and a station', linesOf(g, ref.id).every(L => { const e = g.sim.edgeOf(g.store.get(L.a.b), L.a.port); return e && !e.lvl && !e.int; })); }

console.log('2. end to end with the economy: crude in through the CRUDE channel, four products out through their channels');
{ const x = setup(), wired = wireAll(x); T('2a the outlets are wired to stations (' + wired.join(', ') + ')', wired.length >= 3, wired); feed(x, wired);
  const { g, ref } = x, v0 = x.src.s.vol; g.co.advanceHours(24); const s = ref.s, used = v0 - x.src.s.vol;
  T('2b the refinery takes crude (no NaN anywhere)', used > 1000 && Number.isFinite(s._off || 0) && Number.isFinite(s.crude) && s.crude > 1000, [used, s._off, s.crude]);
  T('2c every wired product reaches its own tank through its own channel', wired.every(ch => x.sinks[ch] && x.sinks[ch].s.vol > 0), Object.fromEntries(wired.map(ch => [ch, x.sinks[ch] && Math.round(x.sinks[ch].s.vol)])));
  T('2d made by the refinery = held by the tanks (nothing lost in the network)', wired.every(ch => K.near(x.sinks[ch].s.vol, s.made[ch], 1e-6)), wired.map(ch => [ch, Math.round(x.sinks[ch].s.vol), Math.round(s.made[ch])]));
  const R = BC.REFINERY.yields; T('2e products in the recipe proportions (gasoline : jet = ' + R.GASOLINE + ' : ' + R.JET_FUEL + ')', !wired.includes('JET_FUEL') || K.near(s.made.GASOLINE / s.made.JET_FUEL, R.GASOLINE / R.JET_FUEL, 0.02));
  T('2f the status is a working one (running, or a pressure / capacity note), never "no input"', ['RUNNING', 'LOW_PRESSURE', 'OVER_CAPACITY'].includes(g.sim.status(ref)), g.sim.status(ref)); }

console.log('3. an old save: the crude feed laid closed, then opened by the player');
{ const x = setup(), { g, ref, S1 } = x; I.layConnect(g.store, g.net, g.ts, ref.id, S1, { ignoreCash: true }); const crude = linesOf(g, ref.id).find(L => L.product === 'CRUDE'); crude.open = false; g.net.rev++;
  I.setLineOpen(g.net, crude.id, true); wireAll(x); feed(x, Object.values(CH)); const v0 = x.src.s.vol; g.co.advanceHours(24);
  T('3a after opening the valve the refinery receives crude (no level-out NaN)', v0 - x.src.s.vol > 1000 && Number.isFinite(ref.s._off || 0) && ref.s.crude > 1000, [v0 - x.src.s.vol, ref.s._off]); }

console.log('4. a product with no receiving tank anywhere on the network');
{ const x = setup(), wired = wireAll(x), V = wired.includes('JET_FUEL') ? 'JET_FUEL' : wired.find(c => c !== 'GAS') || wired[0], AR = BC.PRODUCT_LABEL[V]; feed(x, wired.filter(c => c !== V)); const { g, ref } = x; g.co.advanceHours(12);
  T('4a ' + V + ' is wired but has nowhere to go: the refinery stops and says BLOCKED, not "no input"', g.sim.status(ref) === 'BLOCKED' && !(ref.s.crude > 0), [g.sim.status(ref), ref.s.crude]);
  const d = H.building(ctx(g), ref); T('4b the help names the ' + V + ' outlet, the station, the missing tank and the fix', d.issues.some(i => i.t.includes('مخرج ' + AR) && i.t.includes('لا يوجد أي خزان ' + AR) && i.fix.includes('ابنِ خزان ' + AR)), d.issues);
  x.sinks[V] = K.attach(g, TANK[V], SINK_ST, V, 'in'); g.sim.ensure(x.sinks[V]); g.co.advanceHours(12);
  T('4c a ' + V + ' tank on any station: the refinery runs again', ref.s.made[V] > 0 && x.sinks[V].s.vol > 0, [g.sim.status(ref), ref.s.made[V]]); }

console.log('5. tank pairs keep their old behaviour');
{ const g = K.mk(); const a = K.attach(g, 'crude_tank_m', ['N3'], 'CRUDE', 'out', 1000); let b = null; for (let d = 4; d < 30 && !b; d++) { const v = g.store.validate('crude_tank_m', a.x + d, a.y, 0, { ignoreCash: true }); if (v.ok) b = g.store.place('crude_tank_m', a.x + d, a.y, 0, { instant: true, ignoreCash: true }).building; }
  if (b) { const r = I.layConnect(g.store, g.net, g.ts, b.id, a.id, { ignoreCash: true }); const ls = (r.made || []); T('5a two crude tanks connected both ways: the return line is still laid closed (same product)', r.ok && ls.length === 2 && ls.filter(L => L.open === false).length === 1, ls.map(L => [L.product, L.open])); }
  else T('5a a second tank placed', false); }

console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
