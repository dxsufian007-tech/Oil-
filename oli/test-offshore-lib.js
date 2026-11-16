/* builds the eight player-style platforms on any game object g = { store, net, ts, cn, sim }.  Used by test-offshore-8.js logic and the real-save run. */
const K = require('./test-central-kit.js'), { W, B, I, C, world } = K; const OC = W.CONFIG.OFFSHORE, [DW, DH] = OC.DECK;
module.exports = function buildAll(g, seaF) {
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

  return plats; };
