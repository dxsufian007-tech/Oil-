/* S1 scene generator: grows the REAL save (a player expanding his company) with connected clusters, using only the player's own tools:
 *   store.place / store.validate (terrain, slope, oil field, overlap rules), I.layPipe (routing), C.planTap / C.commitTap (new central stations on the trunk), the
 *   six central channels with TWO ports per channel per station.  Nothing is relaxed: no limit, capacity, port count or price is changed.
 * Modules:  PRODUCER = 3 wells -> junction -> pump -> separator -> crude tank -> central CRUDE port (OUT)
 *           REFINERY = central CRUDE port -> refinery -> GASOLINE/DIESEL/JET/GAS ports (OUT) ; product tanks take from the central product channels (IN)
 * Every failure is counted by reason (the limits found while expanding).  Usage:  const S = require('./gen-scene.js'); const sc = S.generate(1000); */
'use strict';
const path = require('path'), fs = require('fs'); const dir = path.resolve(__dirname, '..');
const K = require(dir + '/test-central-kit.js'), { B, I, C, E, world } = K;
const SAVE = process.env.SAVE || '/home/claude/dxsufian007-tech/oil-/oli/local-saves/realsave.json';
const PROD = { GASOLINE: ['GASOLINE_OUT', 'gasoline_tank_m'], DIESEL: ['DIESEL_OUT', 'diesel_tank_m'], JET_FUEL: ['JET_OUT', 'jet_tank_m'], GAS: ['GAS_OUT', 'gas_sphere_m'] };

/* FLAT mode: the engine benchmark scene.  A flat, fully buildable 1920 x 1280 map with oil everywhere, the REAL central network plan (29 stations, 34 routes, 18 pumps) installed, an empty company.
   It removes the terrain / oil-field / existing-pipe obstacles of the real map (documented separately) but keeps every network rule: pipes, ports, taps, two ports per channel per station. */
function bootFlat() {
  const TERR = { FLAT_DESERT: { buildable: true, buildCost: 1, maxSlope: 10 } }, ts = { W: 1920, H: 1280, tile: () => ({ terrain: 'FLAT_DESERT', slope: 0 }), terrain: TERR, slopeK: 1, oilFieldAt: () => ({ kind: 'FIELD', id: 1 }), stateOf: () => 'DRILLABLE', zoneAt: () => ({ id: 1 }), sectorAt: () => 'A' };
  const store = new B.BuildingStore(ts, { cash: 1e15 }), net = new I.PipeNet(ts.W), sim = new I.Sim(store, net), co = new E.Company(store, net, sim, { now: () => 1e12 }); const inst = C.install(store, net); co.sync(); co.speed = 0;
  return { d: null, ts, store, net, sim, co, cn: inst.cn, flat: true };
}
function boot() {
  const d = JSON.parse(fs.readFileSync(SAVE, 'utf8')), ts = B.fromWorld(world);
  if (d.wd) { world.restoreProgress(d.wd.p); world.restoreReserve(d.wd.r); world.restoreZones(d.wd.z); }
  const r0 = B.BuildingStore.fromJSON(ts, d.store, { cash: d.cash }), store = r0.store; store.cash = 1e15;
  const net = I.PipeNet.fromJSON(ts.W, d.net), sim = new I.Sim(store, net), co = new E.Company(store, net, sim, { now: () => 1e12 }); co.fromJSON(d.eco); co.sync(); co.speed = 0;
  return { d, ts, store, net, sim, co, cn: net.central };
}
const ptsOf = (b, role) => B.worldPoints(b).filter(p => p.kind === 'pipe' && (!role || p.role === role));

function generate(target, opts) {
  opts = opts || {}; const g = opts.flat ? bootFlat() : boot(), { store, net, cn } = g, log = { fail: {}, modules: { producer: 0, refinery: 0, sink: 0, producerM: 0 }, taps: 0, reusedPorts: 0, notes: [] };
  const fail = k => { log.fail[k] = (log.fail[k] || 0) + 1; };
  const used = new Set(); const markUsed = L => { for (const e of [L.a, L.b]) if (e && e.b != null) used.add(e.b + ':' + e.port); }; for (const L of net.lines.values()) markUsed(L);
  const count = () => store.list().length;
  /* nearest free-space placement (rings), exactly the validation the player's placement uses */
  const spot = (def, x, y, maxR, rot, minR) => { for (let r = minR || 0; r <= maxR; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const v = store.validate(def, x + dx, y + dy, rot || 0, { ignoreCash: true }); if (!v.ok) continue; const p = store.place(def, x + dx, y + dy, rot || 0, { instant: true, ignoreCash: true }); if (p.ok) return p.building; } return null; };
  const lay = (a, ap, b, bp, dia) => { const r = I.layPipe(store, net, g.ts, { b: a.id, port: ap }, { b: b.id, port: bp }, dia, { ignoreCash: true }); if (r.ok) { markUsed(r.line); } else { fail('pipe:' + (r.reason || '?')); if (log.notes.length < 12) log.notes.push([a.d, ap, b.d, bp, dia, r.reason, r.state]); } return r.ok; };
  /* try the free ports in turn (a player picks the port that works): fa/fb = regex on the port id, role filter 'out'|'in'|undefined */
  const layAny = (a, fa, ra, b, fb, rb, dia) => { const pa = ptsOf(a).filter(p => fa.test(p.id) && (!ra || p.role === ra || p.role === 'both') && !used.has(a.id + ':' + p.id)), pb = ptsOf(b).filter(p => fb.test(p.id) && (!rb || p.role === rb || p.role === 'both') && !used.has(b.id + ':' + p.id)); let last = null;
    for (const x of pa) for (const y of pb) { const r = I.layPipe(store, net, g.ts, { b: a.id, port: x.id }, { b: b.id, port: y.id }, dia, { ignoreCash: true }); if (r.ok) { markUsed(r.line); return true; } last = r; }
    fail('pipe:' + (last ? last.reason : 'noFreePort')); if (process.env.GDEBUG && (global.__dbg = (global.__dbg || 0) + 1) <= 2) { console.log('DEBUG', a.d, a.x, a.y, '->', b.d, b.x, b.y, 'ports', pa.map(p => p.id + '@' + p.ax + ',' + p.ay).join(' '), '|', pb.map(p => p.id + '@' + p.ax + ',' + p.ay).join(' ')); const x0 = Math.min(a.x, b.x) - 6, x1 = Math.max(a.x, b.x) + 8, y0 = Math.min(a.y, b.y) - 8, y1 = Math.max(a.y, b.y) + 8; for (let y = y0; y <= y1; y++) { let row = ''; for (let x = x0; x <= x1; x++) { const bb = store.at(x, y), t = g.ts.tile(x, y), td = g.ts.terrain[t.terrain]; row += bb ? bb.d[0].toUpperCase() : net.lineAt(x, y) ? '=' : net.centralAt(x, y) ? 'c' : (td && td.buildable ? '.' : '#'); } console.log(row); } } if (log.notes.length < 12) log.notes.push([a.d, fa.source, b.d, fb.source, dia, last && last.reason]); return false; };
  const kill = bs => { for (const b of bs) if (b) store.demolish(b.id, { building: true, pipes: true, force: true }); };
  const baseSt = new Set(cn.st.keys()); const stations = (tapOnly) => [...cn.st.values()].filter(s => s.b != null && (!tapOnly || !baseSt.has(s.id))).map(s => ({ s, b: store.get(s.b) })).filter(o => o.b);
  const freePort = (stObj, ch) => { for (const p of C.PORTS[ch]) if (!used.has(stObj.b.id + ':' + p)) return p; return null; };
  const dist = (b, x, y) => { const c = B.worldPoints(b)[0]; return Math.abs((b.x || 0) - x) + Math.abs((b.y || 0) - y); };
  /* connect building b (port role `dir`) to the central channel ch: the nearest stations with a free port first (a player reuses a tap), then a NEW tap on the trunk next to the building */
  const trunk = []; { for (const g2 of cn.seg.values()) { const P = g2.path; for (let i = 6; i < P.length - 6; i += 3) trunk.push(P[i]); } }
  const nearTrunk = (x, y) => { let best = null, bd = 1e9; for (const p of trunk) { const d = Math.abs(p[0] - x) + Math.abs(p[1] - y); if (d < bd) { bd = d; best = p; } } return { p: best, d: bd }; };
  const connectToCentral = (b, ch, dir, dia, maxD, bre, fresh) => { bre = bre || /./;
    maxD = maxD || 90; const cands = fresh ? [] : stations(true).filter(o => freePort(o, ch)).map(o => ({ o, d: dist(o.b, b.x, b.y) })).filter(c => c.d <= maxD).sort((p, q) => p.d - q.d).slice(0, 3);
    for (const c of cands) { if (layAny(b, bre, dir, c.o.b, new RegExp('^' + freePort(c.o, ch) + '$'), undefined, dia)) { log.reusedPorts++; return true; } }
    const near = trunk.map(p => ({ p, d: Math.abs(p[0] - b.x) + Math.abs(p[1] - b.y) })).filter(c => c.d <= maxD).sort((p, q) => p.d - q.d); if (!near.length) { fail('trunkTooFar'); return false; }
    const taken = stations().map(o => [o.b.x, o.b.y]); let att = 0;
    for (const c of near) { if (taken.some(t => Math.abs(t[0] - c.p[0]) + Math.abs(t[1] - c.p[1]) < 9)) continue; if (++att > (opts.tapTries || 8)) break;
      const plan = C.planTap(store, net, c.p[0], c.p[1], { ignoreCash: true }); if (!plan.ok) { fail('tap:' + plan.reason); continue; } const r = C.commitTap(store, net, plan, { ignoreCash: true }); if (!r.ok) { fail('tapCommit:' + (r.reason || '?')); continue; } log.taps++; taken.push([r.building.x, r.building.y]);
      const o = { s: r.station, b: r.building }, prt = freePort(o, ch); if (prt && layAny(b, bre, dir, o.b, new RegExp('^' + prt + '$'), undefined, dia)) return true; }
    return false;
  };
  const sites = (opts.flat ? (() => { const o = []; for (let y = 40; y < 1240; y += 26) for (let x = 40; x < 1880; x += 26) o.push({ id: 'G' + x + '_' + y, x, y }); return o; })() : world.allSites()).filter(s => opts.flat || (!s.offshore && world.stateOf(s.id) === 'DRILLABLE' && !(world.wellsOf && (world.wellsOf(s.id) || []).length))); let si = 0, tries = 0;
  { const nt = (x, y) => nearTrunk(x, y).d; sites.sort((p, q) => nt(p.x, p.y) - nt(q.x, q.y)); const ns = sites.filter(p => { const d = nt(p.x, p.y); return d >= (opts.minTrunk || 0) && d <= (opts.maxTrunk || 150); }); log.fieldsTotal = sites.length; log.fieldsNearTrunk = ns.length; sites.length = 0; sites.push(...ns); }
  const toCentral = (b, ch, dir, x, y, dia) => connectToCentral(b, ch, dir, dia || 36);
  /* place a building at the first ring spot where the pipe from/to its neighbour can really be routed (a player moves the building when the pipe cannot reach) */
  const placeLinked = (def, x, y, maxR, minR, link, maxTry) => { let tries = 0; for (let r = minR || 0; r <= maxR; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const v = store.validate(def, x + dx, y + dy, 0, { ignoreCash: true }); if (!v.ok) continue; const p = store.place(def, x + dx, y + dy, 0, { instant: true, ignoreCash: true }); if (!p.ok) continue; if (link(p.building)) return p.building; store.demolish(p.building.id, { building: true, pipes: true, force: true }); if (++tries >= (maxTry || 14)) { fail('noLinkSpot:' + def); return null; } } fail('noSpot:' + def); return null; };
  const producer = () => {
    if (si >= sites.length * (opts.passes || 4)) { fail('noMoreFields'); return false; } const s = sites[si++ % sites.length], cx = Math.round(s.x), cy = Math.round(s.y), placed = [], done = () => { for (const b of placed) if (b) kill([b]); };
    const w1 = spot('oil_well', cx, cy, 8); if (!w1) { fail('fieldNoRoom'); return false; } placed.push(w1);
    const tw = (b, n) => { const t = nearTrunk(b.x, b.y).p; const dx = t[0] - b.x, dy = t[1] - b.y, L = Math.max(1, Math.hypot(dx, dy)); return [Math.round(b.x + dx / L * n), Math.round(b.y + dy / L * n)]; }; const c1 = [w1.x + 8, w1.y];
    const jn = placeLinked('junction', c1[0], c1[1], 6, 0, j => layAny(w1, /OIL_OUT/, 'out', j, /PORT/, undefined, 16)); if (!jn) { done(); fail('producerAborted'); return false; } placed.push(jn);
    const pump = placeLinked('pump_station_l', jn.x + 6, jn.y, 6, 0, p => layAny(jn, /PORT/, undefined, p, /INPUT/, 'in', 24)); if (!pump) { done(); fail('producerAborted'); return false; } placed.push(pump);
    let nw = 1; for (let k = 0; k < 2; k++) { const w = placeLinked('oil_well', cx, cy, 10, 3, x => layAny(x, /OIL_OUT/, 'out', jn, /PORT/, undefined, 16), 6); if (w) { placed.push(w); nw++; } }
    if (nw < 2) { done(); fail('producerAborted'); return false; }
    const sep = placeLinked('separator', pump.x + 16, pump.y - 2, 6, 0, p => layAny(pump, /OUTPUT/, 'out', p, /MIXTURE_IN/, 'in', 24)); if (!sep) { done(); fail('producerAborted'); return false; } placed.push(sep);
    const tank = placeLinked('crude_tank_m', sep.x + 18, sep.y, 6, 0, p => layAny(sep, /OIL_OUT/, 'out', p, /INPUT/, 'in', 24)); if (!tank) { done(); fail('producerAborted'); return false; } placed.push(tank);
    if (!toCentral(tank, 'CRUDE', 'out', cx, cy, 36)) { done(); fail('producerAborted'); return false; } log.modules.producer++; return true;
  };
  /* big producer: up to 8 wells -> main manifold -> pump -> separator -> crude tank -> one tap (the player's way to put many wells behind one tap) */
  const producerM = () => {
    if (si >= sites.length * (opts.passes || 4)) { fail('noMoreFields'); return false; } const s = sites[si++ % sites.length], cx = Math.round(s.x), cy = Math.round(s.y), placed = [], done = () => { for (const b of placed) if (b) kill([b]); };
    const mf = spot('main_manifold', cx + 6, cy, 6); if (!mf) { fail('fieldNoRoom'); return false; } placed.push(mf);
    const pump = placeLinked('pump_station_c', mf.x + 7, mf.y + 3, 6, 0, p => layAny(mf, /OUTPUT/, 'out', p, /INPUT/, 'in', 36)); if (!pump) { done(); fail('producerAborted'); return false; } placed.push(pump);
    let nw = 0; for (let k = 0; k < 8; k++) { const w = placeLinked('oil_well', mf.x - 7, mf.y + k * 3 - 2, 3, 0, x => layAny(x, /OIL_OUT/, 'out', mf, /INPUT/, 'in', 16), 4); if (w) { placed.push(w); nw++; } } if (nw < 3) { done(); fail('producerAborted'); return false; }
    const sep = placeLinked('separator', pump.x + 8, pump.y, 6, 0, p => layAny(pump, /OUTPUT/, 'out', p, /MIXTURE_IN/, 'in', 36)); if (!sep) { done(); fail('producerAborted'); return false; } placed.push(sep);
    const tank = placeLinked('crude_tank_m', sep.x + 10, sep.y, 6, 0, p => layAny(sep, /OIL_OUT/, 'out', p, /INPUT/, 'in', 36)); if (!tank) { done(); fail('producerAborted'); return false; } placed.push(tank);
    if (!connectToCentral(tank, 'CRUDE', 'out', 36, opts.maxD || 150)) { done(); fail('producerAborted'); return false; } log.modules.producerM = (log.modules.producerM || 0) + 1; return true;
  };
  /* LOCAL chain (no central network): wells -> junction -> pump -> separator -> crude tank -> refinery -> 4 product tanks, the chain the player builds without the trunk (tests' chain(full)) */
  const allGrid = []; if (opts.flat) for (let y = 40; y < 1240; y += 56) for (let x = 40; x < 1800; x += 96) allGrid.push({ x, y }); let li = 0;
  const local = () => {
    if (li >= allGrid.length * 6) { fail('noMoreLocalSites'); return false; } const s = allGrid[li++ % allGrid.length], cx = s.x, cy = s.y, placed = [], done = () => { for (const b of placed) if (b) kill([b]); };
    const w1 = spot('oil_well', cx, cy, 6); if (!w1) { fail('fieldNoRoom'); return false; } placed.push(w1);
    const jn = placeLinked('junction', w1.x + 8, w1.y, 6, 0, j => layAny(w1, /OIL_OUT/, 'out', j, /PORT/, undefined, 16)); if (!jn) { done(); fail('localAborted'); return false; } placed.push(jn);
    const pump = placeLinked('pump_station_l', jn.x + 6, jn.y, 6, 0, p => layAny(jn, /PORT/, undefined, p, /INPUT/, 'in', 24)); if (!pump) { done(); fail('localAborted'); return false; } placed.push(pump);
    for (let k = 0; k < 2; k++) { const w = placeLinked('oil_well', cx, cy + 4 * (k + 1), 5, 0, x => layAny(x, /OIL_OUT/, 'out', jn, /PORT/, undefined, 16), 5); if (w) placed.push(w); }
    const sep = placeLinked('separator', pump.x + 16, pump.y - 2, 6, 0, p => layAny(pump, /OUTPUT/, 'out', p, /MIXTURE_IN/, 'in', 24)); if (!sep) { done(); fail('localAborted'); return false; } placed.push(sep);
    const tank = placeLinked('crude_tank_m', sep.x + 18, sep.y, 6, 0, p => layAny(sep, /OIL_OUT/, 'out', p, /INPUT/, 'in', 24)); if (!tank) { done(); fail('localAborted'); return false; } placed.push(tank);
    const rf = placeLinked('refinery_s', tank.x + 18, tank.y, 6, 0, r => layAny(tank, /OUTPUT/, 'out', r, /CRUDE_IN/, 'in', 24)); if (!rf) { done(); fail('localAborted'); return false; } placed.push(rf);
    const ts2 = []; for (const ch of Object.keys(PROD)) { const nm = PROD[ch][0]; const t = placeLinked(PROD[ch][1], rf.x + 8, rf.y, 14, 0, tt => layAny(rf, new RegExp('^' + nm), 'out', tt, /INPUT/, 'in', 24), 8); if (!t) { done(); fail('localAborted'); return false; } placed.push(t); ts2.push(t.id); }
    g.sinks = (g.sinks || []).concat(ts2); log.modules.local = (log.modules.local || 0) + 1; return true;
  };
  /* refinery near a station with a free CRUDE port; outputs go to the product channels; product tanks take from them */
  const refinery = () => {
    if (si >= sites.length * (opts.passes || 4)) { fail('noMoreFields'); return false; } const s = sites[si++ % sites.length]; const rf = spot(opts.refDef || 'refinery_s', Math.round(s.x), Math.round(s.y), 12); if (!rf) { fail('noRoom:refinery'); return false; }
    let ok = connectToCentral(rf, 'CRUDE', 'in', 36, 150, /CRUDE/, true), placed = [rf];
    /* products leave into local product tanks next to the refinery (the player's own chain); the harness may drain them as sales */
    for (const ch of Object.keys(PROD)) { if (!ok) break; const nm = PROD[ch][0]; const t = placeLinked(PROD[ch][1], rf.x + 8, rf.y, 14, 0, tt => layAny(rf, new RegExp('^' + nm), 'out', tt, /INPUT/, 'in', 24), 8); if (!t) { ok = false; break; } placed.push(t); (g.sinks = g.sinks || []).push(t.id); }
    if (!ok) { kill(placed); fail('refineryAborted'); return false; } log.modules.refinery++; return true;
  };
  /* a product tank taking from a central product channel */
  const sink = ch => { const sl = stations(true).filter(o => freePort(o, ch)); if (!sl.length) { if (si >= sites.length * (opts.passes || 4)) { fail('noMoreFields'); return false; } const st0 = sites[si++ % sites.length], tk = spot(PROD[ch][1], Math.round(st0.x), Math.round(st0.y), 8); if (!tk) { fail('noRoom:sink'); return false; } if (!connectToCentral(tk, ch, 'in', 24, opts.maxD || 150, /INPUT/, true)) { kill([tk]); fail('sinkAborted'); return false; } log.modules.sink++; g.sinks = (g.sinks || []).concat([tk.id]); return true; } const o = sl[(log.modules.sink * 5) % sl.length], port = freePort(o, ch); const t = placeLinked(PROD[ch][1], o.b.x + 5, o.b.y + 5, 40, 4, t2 => layAny(t2, /INPUT/, 'in', o.b, new RegExp('^' + port + '$'), undefined, 24), 8); if (!t) return false; log.modules.sink++; g.sinks = (g.sinks || []).concat([t.id]); return true; };

  const t0 = Date.now(), maxFail = opts.maxFail || 400; let n = 0, lastFail = 0, sinceOk = 0, round = 0;
  const totalFail = () => Object.values(log.fail).reduce((a, b) => a + b, 0);
  let centralFail = 0, centralDead = false; if (opts.localOnly) centralDead = true;
  const cps = (opts.checkpoints || []).slice().sort((p, q) => p - q); let cpi = 0;
  while (count() < target && sinceOk < (opts.stall || 150)) {
    round++; const before = count(); let ok;
    if (centralDead || (opts.localShare && round % 100 < opts.localShare)) { ok = local(); } else { const r = round % 12; if (r === 0) ok = refinery(); else if (r % 3 === 1) ok = sink(['GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS'][(round / 3 | 0) % 4]); else ok = (opts.useManifold && r % 2 === 0) ? producerM() : producer(); if (ok) centralFail = 0; else if (++centralFail >= (opts.deadAfter || 120)) centralDead = true; }
    if (ok) sinceOk = 0; else sinceOk++; while (cpi < cps.length && count() >= cps[cpi]) { co_sync(g); if (opts.onCheckpoint) opts.onCheckpoint(cps[cpi], g, log); cpi++; } if (opts.progress && round % 10 === 0) console.log('  gen', count(), JSON.stringify(log.modules), 'taps', log.taps, 'fails', totalFail(), ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  co_sync(g); log.buildings = count(); log.lines = net.lines.size; log.stations = cn.st.size; log.genSec = (Date.now() - t0) / 1000; log.reachedTarget = count() >= target; log.stalled = sinceOk >= (opts.stall || 150);
  return { g, log };
}
function co_sync(g) { g.co.sync(); }

/* how real is the scene: share of buildings with at least one pipe, wells with flow, refinery throughput, central deliveries */
function connectivity(g) {
  const conn = new Set(); for (const L of g.net.lines.values()) for (const e of [L.a, L.b]) if (e && e.b != null) conn.add(e.b); const out = { total: 0, connected: 0, byType: {} };
  for (const b of g.store.list()) { out.total++; const c = conn.has(b.id); if (c) out.connected++; const t = out.byType[b.d] || (out.byType[b.d] = { n: 0, conn: 0 }); t.n++; if (c) t.conn++; } out.connPct = +(100 * out.connected / out.total).toFixed(1); return out;
}
function flows(g) { let wells = 0, wp = 0, prod = 0, tanks = 0, stock = 0, ref = 0, refThru = 0; for (const b of g.store.list()) { const s = g.sim.ensure(b), def = B.DEFS[b.d]; if (def.type === 'well') { wells++; if ((s._out || 0) > 0) wp++; prod += s._out || 0; } else if (def.type === 'tank' || def.type === 'gas') { tanks++; stock += s.vol || 0; } else if (/^refinery/.test(b.d)) { ref++; refThru += s._thru || s.thru || 0; } } return { wells, wellsProducing: wp, wellOutBpd: Math.round(prod), tanks, stockBbl: Math.round(stock), refineries: ref }; }
/* serialise / restore a generated scene (the same toJSON objects the game's save uses) */
function dump(g, log) { return JSON.stringify({ meta: { log, sinks: g.sinks || [] }, store: g.store.toJSON(), net: g.net.toJSON(), cash: g.store.cash, eco: g.co.toJSON() }); }
function load(file) { const d = JSON.parse(fs.readFileSync(file, 'utf8')), g = bootFlat0(); const r = B.BuildingStore.fromJSON(g.ts, d.store, { cash: d.cash }); g.store = r.store; g.store.cash = 1e15; g.net = I.PipeNet.fromJSON(g.ts.W, d.net); g.sim = new I.Sim(g.store, g.net); g.co = new E.Company(g.store, g.net, g.sim, { now: () => 1e12 }); g.co.fromJSON(d.eco); g.co.sync(); g.co.speed = 0; g.cn = g.net.central; g.sinks = d.meta.sinks; g.meta = d.meta; return g; }
function bootFlat0() { const TERR = { FLAT_DESERT: { buildable: true, buildCost: 1, maxSlope: 10 } }; return { ts: { W: 1920, H: 1280, tile: () => ({ terrain: 'FLAT_DESERT', slope: 0 }), terrain: TERR, slopeK: 1, oilFieldAt: () => ({ kind: 'FIELD', id: 1 }), stateOf: () => 'DRILLABLE', zoneAt: () => ({ id: 1 }), sectorAt: () => 'A' } }; }
module.exports = { generate, connectivity, flows, boot, bootFlat, dump, load };
