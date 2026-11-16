/* OFFSHORE (F1): all eight platforms built by "the player" on one real map at once, then run; measures what reaches the central network.  node test-offshore-8.js [N platforms] */
const K = require('./test-central-kit.js'), { W, B, I, C, world, mk, run, attach } = K, fs = require('fs');
const OC = W.CONFIG.OFFSHORE, [DW, DH] = OC.DECK, N = +process.argv[2] || 8, seaF = process.env.SLOT ? [world.allSites().filter(s => s.offshore)[+process.env.SLOT]] : world.allSites().filter(s => s.offshore).slice(0, N);
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const g = mk(); g.store.cash = Infinity; world.restoreProgress(seaF.map(f => [f.id, 'DRILLABLE']));
const put = (d, x, y) => { const r = g.store.place(d, x, y, 0, { instant: true, ignoreCash: true }); if (!r.ok) throw new Error('place ' + d + ' ' + x + ',' + y + ' ' + r.reason); return r.building; };
const lay = (a, ap, b, bp, d, m) => I.layPipe(g.store, g.net, g.ts, { b: a.id, port: ap }, { b: b.id, port: bp }, d, { ignoreCash: true, margin: m || 45 });
const S = b => g.sim.ensure(b), plats = [], takenTaps = [];
const outs = [['GAS_OUT', 'GAS'], ['OIL_OUT', 'CRUDE'], ['WATER_OUT', 'WATER']], perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]], orders = [[0, 1, 2], [2, 1, 0], [1, 0, 2], [2, 0, 1], [1, 2, 0], [0, 2, 1]];
const t0 = Date.now();
for (const f of seaF) {
  const DX = f.x - (DW >> 1), DY = f.y - (DH >> 1), deck = put('offshore_platform', DX, DY), wells = OC.WELL_SLOTS.slice(0, +process.env.WELLS || 8).map(([a, b]) => put('offshore_well', DX + a, DY + b));
  const pump = put('offshore_pump', DX + 12, DY + 1), sep = put('offshore_separator', DX + 18, DY);
  const L1 = lay(deck, 'OUTPUT_1', pump, 'INPUT', 36), L2 = lay(pump, 'OUTPUT', sep, 'MIXTURE_IN', 36); const P = { f, deck, wells, pump, sep, ok: !!(L1.ok && L2.ok), lines: 0, tapsOk: false };
  if (P.ok) {
    const cand = []; for (const seg of g.cn.seg.values()) if (/^F-L/.test(seg.id)) for (const [x, y] of seg.path) { const d = Math.hypot(x - sep.x, y - sep.y); if (d > 25 && d < 120) cand.push([x, y, d]); } cand.sort((a, b) => a[2] - b[2]);
    const outAx = ['GAS_OUT', 'OIL_OUT', 'WATER_OUT'].map(id => { const q = B.worldPoints(sep).find(p => p.id === id); return [q.ax, q.ay]; }); const reach = pl => outAx.every(o => !!I.route(g.store, g.net, g.ts, o, [pl.x, pl.y], { margin: 45 }));
    const nearSt = pl => { for (const st of g.cn.st.values()) { const sb = g.store.get(st.b); if (sb && Math.max(Math.abs(sb.x - pl.x), Math.abs(sb.y - pl.y)) < 7) return true; } return false; };
    const pick = west => { const t = []; for (const [x, y] of cand) { if (t.length >= 3) break; if ([...takenTaps, ...t].some(u => Math.max(Math.abs(u.x - x), Math.abs(u.y - y)) < 8)) continue; const pl = C.planTap(g.store, g.net, x, y, { toward: [sep.x, sep.y] }); if (!pl.ok || !reach(pl) || nearSt(pl)) continue; t.push({ x, y, pl }); } return t; };
    let taps = pick(true); if (taps.length < 3) taps = pick(false); P.cand = cand.length; P.tapN = taps.length;
    if (taps.length === 3) { for (const t of taps) { const c = C.commitTap(g.store, g.net, t.pl); t.b = c.building || c.b || c; }
      const wire = (from, fp, tap, ch) => { for (const pid of C.PORTS[ch]) { const r = lay(from, fp, tap.b, pid, ch === 'GAS' ? 8 : 36); if (r.ok) return r; } return null; };
      let res = null; for (const ord of orders) { for (const pm of perms) { const got = [null, null, null]; let okAll = true; for (const i of ord) { const r = wire(sep, outs[i][0], taps[pm[i]], outs[i][1]); if (!r) { okAll = false; break; } got[i] = r; } if (okAll) { res = got; break; } for (const r of got) if (r) g.net.remove((r.line && r.line.id) || r.id); } if (res) break; }
      P.tapsOk = !!res; P.lines = res ? 3 : 0; if (res) for (const t of taps) takenTaps.push(t); }
  }
  plats.push(P); console.log('  built ' + f.id + ' (slot ' + (f.slot + 1) + '): chain ' + P.ok + ', taps found ' + P.tapN + '/3, three lines ' + P.tapsOk + '  [' + ((Date.now() - t0) / 1000).toFixed(0) + 's]');
}
T('A every platform built its own chain + three subsea lines to three taps (all by the player tools)', plats.every(p => p.tapsOk), plats.map(p => p.f.id + ':' + p.tapsOk));
const all0 = process.env.STN ? process.env.STN.split(',') : [...g.cn.st.keys()]; let _rot = 0; const rotAll = () => { const k = (_rot++ * 3) % all0.length; return all0.slice(k).concat(all0.slice(0, k)); }; const all = all0; const sinks = { crude: [], gas: [], water: [] };
const nC = +process.env.NC || plats.length * 3; for (let i = 0; i < nC; i++) { const b = attach(g, process.env.TANK || 'crude_tank_c', rotAll(), 'CRUDE', 'in', 0, 36); if (b) sinks.crude.push(b); }
for (let i = 0; i < plats.length; i++) { const a = attach(g, 'gas_sphere_l', rotAll(), 'GAS', 'in', 0, 36), w = attach(g, 'water_tank_c', [...g.cn.st.keys()].slice(i).concat([...g.cn.st.keys()].slice(0, i)), 'WATER', 'in', 0, 36); if (a) sinks.gas.push(a); if (w) sinks.water.push(w); }
console.log('  sinks: crude ' + sinks.crude.length + ' gas ' + sinks.gas.length + ' water ' + sinks.water.length);
for (const p of plats) for (const w of p.wells) S(w);



if (process.env.LONG) { const YEARS = +process.env.LONG, DT = +process.env.DT || 1, p = plats[0], site = world.siteById(p.f.id); for (const w of p.wells) S(w);
  const allSinks = [...sinks.crude, ...sinks.gas, ...sinks.water]; let oil = 0, gas = 0, wat = 0, wells = 0, n = 0, t = 0, yr = 1; const rows = []; const lift0 = site.props.extractCost;
  while (yr <= YEARS) { g.sim.step(DT); t += DT; const so = S(p.sep); oil += (so._o || 0) * DT; gas += (so._g || 0) * DT; wat += (so._w || 0) * DT; wells += p.wells.reduce((a, w) => a + (S(w)._out || 0), 0) * DT; n += DT; for (const b of allSinks) S(b).vol = 0;
    if (t >= 365 * yr - 1e-9) { rows.push({ yr, oil: Math.round(oil), gas: Math.round(gas), water: Math.round(wat), wellsAvg: Math.round(wells / n), pr: +(site.pr == null ? 1 : site.pr).toFixed(4), remaining: Math.round(site.remainingReserve), lift: +(26 * site.props.extractCost / 12.5 * (1 + 0.6 * (1 - (site.pr == null ? 1 : site.pr)))).toFixed(2) }); oil = gas = wat = wells = n = 0; yr++; } }
  console.log('  LONGROWS ' + JSON.stringify({ id: p.f.id, wells: p.wells.length, init: site.initialReserve, dt: DT, rows })); process.exit(0); }
if (process.env.SAVELOAD) { const rowsOf = G => plats.map(p => Math.round(p.wells.reduce((a, w) => a + (G.sim.ensure(G.store.get(w.id))._out || 0), 0)));
  for (const p of plats) for (const w of p.wells) S(w); for (let i = 0; i < 20; i++) g.sim.step(0.05);
  const sj = JSON.parse(JSON.stringify(g.store.toJSON({ live: true }))), nj = JSON.parse(JSON.stringify(g.net.toJSON())), prog = JSON.parse(JSON.stringify(world.progressSnapshot())), rs = JSON.parse(JSON.stringify(world.reserveSnapshot ? world.reserveSnapshot() : null));
  const g2 = mk({ central: false }); world.restoreProgress(prog); if (rs && world.restoreReserve) world.restoreReserve(rs);
  const rr = B.BuildingStore.fromJSON(g2.ts, sj, { cash: Infinity }); g2.store = rr.store; g2.net = I.PipeNet.fromJSON(g2.ts.W, nj); g2.sim = new I.Sim(g2.store, g2.net); for (const b of g2.store.list()) g2.sim.ensure(b);
  console.log('  LOAD loaded ' + rr.report.loaded + ' of ' + g.store.list().length + ' dropped ' + rr.report.dropped.length + ' lines ' + g2.net.lines.size + '/' + g.net.lines.size + ' central ' + !!g2.net.central);
  for (let i = 0; i < 20; i++) { g.sim.step(0.05); g2.sim.step(0.05); }
  const a = rowsOf(g), b = rowsOf(g2); console.log('  LOAD orig  ' + a.join(' ') + ' | ' + a.reduce((x, y) => x + y, 0)); console.log('  LOAD loaded ' + b.join(' ') + ' | ' + b.reduce((x, y) => x + y, 0));
  const worst = Math.max(...a.map((v, i) => Math.abs(v - b[i]) / Math.max(1, v))); console.log('  LOAD worst relative difference per platform ' + (worst * 100).toFixed(4) + ' %'); process.exit(0); }
if (process.env.SCEN) { const SC = process.env.SCEN, rowsOf = () => plats.map(p => { const wo = p.wells.reduce((a, w) => a + (S(w)._out || 0), 0); return Math.round(wo); });
  const show = lab => { const r = rowsOf(), vol = a => a.reduce((x, b) => x + (S(b).vol || 0), 0); console.log('  SCEN ' + SC + ' ' + lab + ': wells/platform ' + r.join(' ') + ' | total ' + r.reduce((a, b) => a + b, 0) + ' | crude stored ' + Math.round(vol(sinks.crude))); };
  const go = n => { const t = Date.now(); let mx = 0; for (let i = 0; i < n; i++) { const t1 = Date.now(); g.sim.step(0.05); mx = Math.max(mx, Date.now() - t1); } return mx; };
  for (const p of plats) for (const w of p.wells) S(w);
  let mx = go(20); show('before (24 h)');
  if (SC === 'pumpfail') { g.store.demolish(plats[2].pump.id, { building: true }); mx = Math.max(mx, go(20)); show('platform 3 pump removed (24 h later)'); }
  if (SC === 'linecut' || SC === 'reconnect') { const sp = plats[0].sep, L = [...g.net.lines.values()].find(l => [l.a, l.b].some(e => e && e.b === sp.id && e.port === 'OIL_OUT')); const other = [L.a, L.b].find(e => !(e.b === sp.id && e.port === 'OIL_OUT')); g.net.remove(L.id); mx = Math.max(mx, go(20)); show('platform 1 crude line cut'); if (SC === 'reconnect') { const r = lay(sp, 'OIL_OUT', g.store.get(other.b), other.port, 36); console.log('  relay ' + r.ok); mx = Math.max(mx, go(20)); show('crude line laid again by the player'); } }
  if (SC === 'full') { /* the sinks of the first 20 steps were small tanks only when NC small + env TANK */ for (let i = 0; i < 6; i++) { const b = attach(g, 'crude_tank_c', all, 'CRUDE', 'in', 0, 36); if (b) sinks.crude.push(b); } mx = Math.max(mx, go(20)); show('6 more consumers added'); }
  console.log('  SCEN max step ' + mx + ' ms'); process.exit(0); }
if (process.env.TALLY) { const tally = {}, o = g.sim.offer.bind(g.sim); g.sim.offer = function (b, port, f, commit, vis) { const k = b.d + ':' + port + (commit ? ':C' : ':p'); tally[k] = (tally[k] || 0) + 1; return o(b, port, f, commit, vis); }; { const ts0 = g.cn.toStation.bind(g.cn), z = { zero: 0, pos: 0, zeroBigR: 0 }; g.cn.toStation = function (sim, ch, srcId, d, want, f, commit, vis, over) { const r = ts0(sim, ch, srcId, d, want, f, commit, vis, over); if (!commit) { if (r <= 1e-9) { z.zero++; if (want > 50) z.zeroBigR++; } else z.pos++; } return r; }; const dv0 = g.cn.deliver.bind(g.cn), dt2 = {}, depthC = {}; let depth = 0; const chain = [], seen3 = []; const dv = function (sim, src, ch, f, commit, vis, port) { chain.push(src.id + '/' + port.replace('CRUDE_',''));  if (chain.length === 4 && seen3.length < 6 && ch === 'CRUDE') seen3.push(chain.join(' > ')); depth++; depthC[depth] = (depthC[depth] || 0) + 1; try { return dv0(sim, src, ch, f, commit, vis, port); } finally { depth--; chain.pop(); } }; g.cn.deliver = function (sim, src, ch, f, commit, vis, port) { if (src.id === 'FS' && ch === 'CRUDE' && !commit && (dt2.__n = (dt2.__n || 0) + 1) % 2500 === 1) console.log('  SAMPLE r=' + f.r + ' p=' + f.p + ' port=' + port + ' stack=' + new Error().stack.split('\n').slice(2, 9).map(l => l.trim().replace(/\(.*\//, '(')).join(' < ')); const k = src.id + ':' + ch + ':' + port + (commit ? ':C' : ':p') + ':r' + Math.round(f.r / 1000) + 'k'; dt2[k] = (dt2[k] || 0) + 1; return dv(sim, src, ch, f, commit, vis, port); }; g.sim.step(0.05); console.log('  DELIVER distinct ' + Object.keys(dt2).length + ' total ' + Object.values(dt2).reduce((a, b) => a + b, 0)); console.log(Object.entries(dt2).sort((a, b) => b[1] - a[1]).slice(0, 10).map(e => '  DELIVER ' + e.join('=')).join('\n')); g.cn.deliver = dv0; g.cn.toStation = ts0; console.log('  CHAINS ' + seen3.join(' || ')); for (const id of ['T20', 'T21', 'T22', 'T2', 'FS']) { const st = g.cn.st.get(id); if (!st) continue; const b = g.store.get(st.b), eb = g.sim._eb && g.sim._eb.get(b.id); for (const pt of ['CRUDE_PORT', 'CRUDE_PORT2']) { const e = eb && eb[pt]; if (e) { const fw = e.ab === b.id && e.ap === pt, far = g.store.get(fw ? e.bb : e.ab); console.log('  EDGE ' + id + '/' + pt + ' -> ' + (far && far.d) + ' ' + (far && far.id) + ' port ' + (fw ? e.bp : e.ap)); } } }
{ const b20 = g.store.get(g.cn.st.get('T20').b); for (const L of g.net.lines.values()) { const ends = [L.a, L.b].map(e => e && (g.store.get(e.b) ? g.store.get(e.b).d + '#' + e.b + ':' + e.port : '?')); if (ends.some(x => x && x.includes('#' + b20.id + ':'))) console.log('  LINE ' + L.id + ' ' + L.product + ' dia' + L.dia + ' len' + L.path.length + ' ' + ends.join(' <-> ')); } console.log('  T20 bid ' + b20.id); }
{ const pairs = new Set(); const nm = {}; for (const [id, st] of g.cn.st) nm[st.b] = id; for (const [id, st] of g.cn.st) { const eb = g.sim._eb && g.sim._eb.get(st.b); if (!eb) continue; for (const pt in eb) { const e = eb[pt]; if (!e) continue; const fw = e.ab === st.b && e.ap === pt, far = fw ? e.bb : e.ab; if (nm[far]) pairs.add([id, nm[far]].sort().join('-')); } } console.log('  DOCKED ' + [...pairs].join(' ')); }
console.log('  DEPTH ' + JSON.stringify(depthC)); console.log('  PROBE ' + JSON.stringify(z)); } console.log(Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 14).map(e => '  TALLY ' + e.join('=')).join('\n')); g.sim.offer = o; }
const NS = +process.env.STEPS || 60; const tS = Date.now(); for (let i = 0; i < NS; i++) { const t1 = Date.now(); g.sim.step(0.05); if (i < 4 || i % 10 === 0) console.log('  step ' + i + ': ' + (Date.now() - t1) + ' ms'); }
console.log('  STATS pc ' + JSON.stringify(g.cn.pcStats) + ' dm ' + JSON.stringify(g.cn.dmStats) + ' modes ' + g.cn.pcMode + ',' + g.cn._dmMode);
console.log('  steps ' + NS + ' in ' + ((Date.now() - tS) / 1000).toFixed(1) + ' s');
let totW = 0, totSep = 0, totO = 0, totG = 0, totWt = 0; const rows = [];
for (const p of plats) { const wo = p.wells.reduce((a, w) => a + (S(w)._out || 0), 0), tg = p.wells.reduce((a, w) => a + (S(w)._target || 0), 0), si = S(p.sep)._in || 0, o = S(p.sep)._o || 0, gg = S(p.sep)._g || 0, ww = S(p.sep)._w || 0; totW += wo; totSep += si; totO += o; totG += gg; totWt += ww; rows.push({ id: p.f.id, target: Math.round(tg), wells: Math.round(wo), pumpIn: Math.round(S(p.pump)._in || 0), sepIn: Math.round(si), oil: Math.round(o), gas: Math.round(gg), water: Math.round(ww) }); }
console.log(rows.map(r => '  ' + JSON.stringify(r)).join('\n'));
const vol = a => a.reduce((x, b) => x + (S(b).vol || 0), 0);
console.log('  TOTAL wells ' + Math.round(totW) + ' sepIn ' + Math.round(totSep) + ' oil ' + Math.round(totO) + ' gas ' + Math.round(totG) + ' water ' + Math.round(totWt) + ' | stored in sinks: crude ' + Math.round(vol(sinks.crude)) + ' gas ' + Math.round(vol(sinks.gas)) + ' water ' + Math.round(vol(sinks.water)));
const tgt = rows.reduce((a, r) => a + r.target, 0);
T('B the wells reach their 30,000 b/d targets (' + Math.round(totW) + ' of ' + tgt + ')', totW >= tgt * 0.99, [totW, tgt]);
T('C all of it passes pump + separator without a bottleneck (sep in = wells out)', Math.abs(totSep - totW) < tgt * 0.01, [totSep, totW]);
T('D crude, gas and water reach the central network on their own channels', vol(sinks.crude) > 0 && vol(sinks.gas) > 0 && vol(sinks.water) > 0);
fs.writeFileSync('/tmp/off8-rows.json', JSON.stringify({ rows, totW, totSep, totO, totG, totWt, sinks: [sinks.crude.length, sinks.gas.length, sinks.water.length] }));
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
