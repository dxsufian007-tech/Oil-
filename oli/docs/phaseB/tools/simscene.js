/* B7 test scene generator: a seeded random Sim scene on the pre-built central network, with every kind of device in the oil path:
 * tanks, tank groups (linked tanks), valves (open / partial / closed), junctions (also feeding a central station = a nested central delivery), pumps, separators, refineries (their products flow back into the central network = nested refining -> central).
 * `ROOT` is the oli dir of the code under test.  build(seed) -> { g, rnd, info }.  Deterministic: no Math.random, no Date.
 */
const path = require('path'), ROOT = process.env.ROOT || path.join(__dirname, '../../..');
const K = require(path.join(ROOT, 'test-central-kit.js')), { mk, B, I, C } = K;
function rng(seed) { let a = (seed * 2654435761 + 12345) >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
/* put a device of kind `def` near the world point of (anchor building, anchor port) and join its port `np` to that anchor port with a pipe; returns the new building or null */
function attach2(g, def, ab, ap, np, dia, rnd) {
  const pp = B.worldPoints(ab).find(p => p.id === ap); if (!pp) return null; let tries = 0;
  for (let d = 2; d <= 24; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue; const x = pp.ax + dx, y = pp.ay + dy, rot = rnd ? Math.floor(rnd() * 4) : 0;
    const v = g.store.validate(def, x, y, rot, { ignoreCash: true }); if (!v.ok) continue; const p = g.store.place(def, x, y, rot, { instant: true, ignoreCash: true }); if (!p.ok) continue; const b = p.building;
    const nps = Array.isArray(np) ? np : [np]; for (const n1 of nps) { const q = B.worldPoints(b).find(z => z.id === n1 && z.kind === 'pipe'); if (q) { const r = I.layPipe(g.store, g.net, g.ts, { b: b.id, port: n1 }, { b: ab.id, port: ap }, dia || 36, { ignoreCash: true }); if (r.ok) return b; } }
    g.store.demolish(b.id, { building: true, pipes: true }); if (++tries > 30) return null;
  }
  return null;
}
const join = (g, a, ap, b, bp) => { const r = I.layPipe(g.store, g.net, g.ts, { b: a.id, port: ap }, { b: b.id, port: bp }, 36, { ignoreCash: true }); return !!(r && r.ok); };
const stPorts = (g, id, ch) => { const sb = K.stB(g, id); return { sb, ports: C.PORTS[ch].filter(pid => { for (const L of g.net.lines.values()) for (const e of [L.a, L.b]) if (e && e.b === sb.id && e.port === pid) return false; return true; }) }; };
const TIN = ['INPUT_W', 'INPUT_N', 'INPUT_E', 'INPUT_S'], TOUT = ['OUTPUT_E', 'OUTPUT_S', 'OUTPUT_W', 'OUTPUT_N'];
const TANKM = { CRUDE: 'crude_tank_m', GASOLINE: 'gasoline_tank_m', DIESEL: 'diesel_tank_m', JET_FUEL: 'jet_tank_m', GAS: 'gas_sphere_m', WATER: 'water_tank_m' };
const TANKL = { CRUDE: 'crude_tank_l', GASOLINE: 'gasoline_tank_l', DIESEL: 'diesel_tank_l', JET_FUEL: 'jet_tank_l', GAS: 'gas_sphere_l', WATER: 'water_tank_l' };
function build(seed, opt) {
  opt = opt || {}; const rnd = rng(seed), g = mk(), cn = g.cn, ids = [...cn.st.keys()], info = { src: 0, kinds: {}, srcB: [], sinkB: [] }, pick = a => a[Math.floor(rnd() * a.length)], note = k => { info.kinds[k] = (info.kinds[k] || 0) + 1; };
  const used = new Set(); const free = () => { for (let i = 0; i < 40; i++) { const s = pick(ids); const { ports } = stPorts(g, s, 'CRUDE'); if (ports.length && !used.has(s)) { used.add(s); return s; } } return null; };
  const nSrc = (opt.dense ? 6 : 2) + Math.floor(rnd() * (opt.dense ? 5 : 3)); const srcSt = [];
  for (let i = 0; i < nSrc; i++) { const s = pick(ids); const { sb, ports } = stPorts(g, s, 'CRUDE'); if (!ports.length) continue; const t = attach2(g, rnd() < .5 ? 'crude_tank_l' : 'crude_tank_m', sb, ports[0], TOUT, 36, rnd); if (t) { if (rnd() < .6) { const s2 = pick(ids), q2 = stPorts(g, s2, 'CRUDE'); if (q2.ports.length && s2 !== s) { for (const op of TOUT) if (join(g, t, op, q2.sb, q2.ports[0])) break; } } info.srcB.push(t); g.sim.ensure(t).vol = opt.dense ? 300 + Math.floor(rnd() * 12000) : 20000 + Math.floor(rnd() * 200000); srcSt.push(s); info.src++; note('src'); used.add(s); } }
  const nSink = (opt.dense ? 30 : 14) + Math.floor(rnd() * 12);
  for (let i = 0; i < nSink; i++) {
    const s = pick(ids), { sb, ports } = stPorts(g, s, 'CRUDE'); if (!ports.length) continue; const ap = ports[0], kind = pick(['tank', 'tank', 'valve', 'junction', 'pump', 'separator', 'separator', 'refinery', 'refinery', 'group', 'jc']);
    const sink = (anchor, aport, np) => { const t = attach2(g, TANKM.CRUDE, anchor, aport, np || TIN, 36, rnd); if (t) { g.sim.ensure(t).vol = Math.floor(rnd() * 100000); info.sinkB.push([t, s]); } return t; };
    if (kind === 'tank') { if (sink(sb, ap)) note('tank'); }
    else if (kind === 'valve') { const v = attach2(g, 'valve', sb, ap, TIN, 36, rnd); if (v) { const t = sink(v, 'OUT'); if (t) { const st = g.sim.ensure(v); const m = rnd(); st.mode = m < .6 ? 'OPEN' : m < .85 ? 'PARTIAL' : 'CLOSED'; st.opening = .2 + rnd() * .7; note('valve'); } } }
    else if (kind === 'junction') { const j = attach2(g, 'junction', sb, ap, 'PORT_W', 36, rnd); if (j) { let n = 0; for (const p of ['PORT_E', 'PORT_N', 'PORT_S']) if (rnd() < .7 && sink(j, p)) n++; if (n) note('junction'); } }
    else if (kind === 'pump') { const p = attach2(g, rnd() < .5 ? 'pump_station_s' : 'pump_station_l', sb, ap, 'INPUT', 36, rnd); if (p) { if (sink(p, 'OUTPUT')) note('pump'); } }
    else if (kind === 'separator') { const sp = attach2(g, 'separator', sb, ap, 'MIXTURE_IN', 36, rnd); if (sp) { let n = 0;
        for (const [port, ch, def] of [['OIL_OUT', 'CRUDE', TANKM.CRUDE], ['GAS_OUT', 'GAS', TANKM.GAS], ['WATER_OUT', 'WATER', TANKM.WATER]]) { if (rnd() < .5) { const q = stPorts(g, s, ch); if (q.ports.length && join(g, sp, port, q.sb, q.ports[0])) { n++; continue; } } if (rnd() < .8 && attach2(g, def, sp, port, TIN, 36, rnd)) n++; }
        if (n) note('separator'); } }
    else if (kind === 'refinery') {
      const rf = attach2(g, 'refinery_s', sb, ap, 'CRUDE_IN', 36, rnd); if (rf) { let n = 0;
        for (const [port, ch] of [['GASOLINE_OUT', 'GASOLINE'], ['DIESEL_OUT', 'DIESEL'], ['JET_OUT', 'JET_FUEL'], ['GAS_OUT', 'GAS']]) { if (rnd() < .6) { const q = stPorts(g, s, ch); if (q.ports.length && join(g, rf, port, q.sb, q.ports[0])) { n++; continue; } } if (attach2(g, TANKM[ch], rf, port, TIN, 36, rnd)) n++; }
        if (n) note('refinery'); } }
    else if (kind === 'group') { const t1 = sink(sb, ap); if (t1) { const pts = B.worldPoints(t1).filter(p => p.kind === 'pipe'); let ok = false; for (const p of pts) { const t2 = attach2(g, TANKM.CRUDE, t1, p.id, TIN, 36, rnd); if (t2) { ok = true; break; } } if (ok) note('group'); } }
    else if (kind === 'jc') { /* a junction that feeds ANOTHER central station (a nested central delivery) and a tank */ const j = attach2(g, 'junction', sb, ap, 'PORT_W', 36, rnd); if (j) { const s2 = pick(ids), q = stPorts(g, s2, 'CRUDE'); let n = 0; if (q.ports.length && s2 !== s && join(g, j, 'PORT_E', q.sb, q.ports[0])) n++; if (sink(j, 'PORT_N')) n++; if (rnd() < .5 && sink(j, 'PORT_S')) n++; if (n) note('jc'); } }
  }
  for (let i = 0; i < (opt.dense ? 5 : 1) && info.sinkB.length; i++) {      // shared sinks: a source tank Q next to a sink tank T pushes straight into T (a commit that never touches the central network) AND into the station T hangs on
    const [T, S] = pick(info.sinkB); let Q = null; for (const ap of TIN) { const taken = [...g.net.lines.values()].some(L => [L.a, L.b].some(e => e && e.b === T.id && e.port === ap)); if (taken) continue; Q = attach2(g, TANKM.CRUDE, T, ap, TOUT, 36, rnd); if (Q) break; } if (!Q) continue; info.srcB.push(Q); g.sim.ensure(Q).vol = 3000 + Math.floor(rnd() * 8000);
    const q = stPorts(g, S, 'CRUDE'); let done = false; for (const qp of q.ports) { for (const op of TOUT) if (join(g, Q, op, q.sb, qp)) { done = true; break; } if (done) break; } note(done ? 'shared' : 'shared-half');
  }
  return { g, rnd, info };
}
module.exports = { build, rng, attach2, K };
