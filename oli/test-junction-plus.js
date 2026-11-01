// A "+" junction: one well feeding a junction that splits into three tanks (and the reverse: wells merging).  NODE_PATH=/opt/npm-tools/node_modules node test-junction-plus.js
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
(async () => {
  const b = await chromium.launch(), p = await (await b.newContext({ viewport: { width: 412, height: 866 } })).newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); });
  const co = (f, a) => p.evaluate(f, a);
  await p.goto('http://localhost:' + srv.address().port + '/?unlock=all'); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 }); await co(() => { localStorage.clear(); __lab.reset(); }); await co(() => __lab.buildDemo()); await p.waitForTimeout(500); await co(() => { __lab.company.speed = 0; __lab.store.cash = 1e9; });
  const r = await co(() => {
    const L = __lab, S = L.store, I = L.I, B = L.B, f = L.fieldSites()[0];
    const put = (d, x, y) => { const sn = S.snap(d, Math.round(x), Math.round(y), 0, { radius: 14, ignoreCash: true }); if (!sn) return null; const q = S.place(d, sn.x, sn.y, sn.r, { instant: true }); return q.ok ? q.building : null; };
    for (const id of [...L.pipes.lines.keys()]) L.pipes.remove(id); const w = S.list().find(x => x.d === 'oil_well'); for (const x of S.list()) if (x.id !== w.id) { x.id; S.demolish(x.id, { building: true, pipes: true, pipeSet: L.pipes }); } S.cash = 1e9; const j = put('junction', w.x + 8, w.y + 8); if (!w || !j) return { err: 'setup', w: !!w, j: !!j };
    const tanks = [put('crude_tank_s', j.x + 10, j.y), put('crude_tank_s', j.x, j.y + 11), put('crude_tank_s', j.x + 10, j.y + 11)].filter(Boolean);
    const free = (x, want) => B.worldPoints(x).filter(q => q.kind === 'pipe' && !q.reserved && (q.role === 'both' || q.role === want)).map(q => q.id);
    const link = (A, Bd, aOut) => { let best = null; for (const pa of free(A, 'out')) for (const pb of free(Bd, 'in')) { const v = I.planPipe(S, L.pipes, L.ts, { b: A.id, port: pa }, { b: Bd.id, port: pb }, 16, { ignoreCash: true }); if (v.ok && (!best || v.path.length < best.l)) best = { pa, pb, l: v.path.length }; } if (!best) return false; return I.layPipe(S, L.pipes, L.ts, { b: A.id, port: best.pa }, { b: Bd.id, port: best.pb }, 16, { ignoreCash: true }).ok; };
    const res = { tanks: tanks.length, w: link(w, j), t: tanks.map(t => link(j, t)) }; res.ids = { w: w.id, j: j.id, t: tanks.map(t => t.id) }; return res;
  });
  console.log('setup', JSON.stringify(r)); ok(!r.err && r.tanks === 3 && r.w && r.t.every(Boolean), 'a well, a junction and three tanks are built and connected: well -> junction -> 3 tanks');
  await co(() => { __lab.company.advanceHours(72); });
  const st = await co(ids => ({ j: __lab.sim.status(__lab.store.get(ids.j)), w: __lab.sim.status(__lab.store.get(ids.w)), t: ids.t.map(i => Math.round(__lab.sim.ensure(__lab.store.get(i)).vol || 0)), jin: Math.round(__lab.sim.ensure(__lab.store.get(ids.j))._in || 0), lines: [...__lab.pipes.lines.values()].map(l => Math.round(l.flow || 0)) }), r.ids);
  console.log('state', JSON.stringify(st), JSON.stringify(await co(ids => [[...__lab.pipes.lines.values()].map(l => [l.a && l.a.b + ':' + l.a.port, l.b && l.b.b + ':' + l.b.port, l.path.length]), ids.t.map(i => __lab.sim.status(__lab.store.get(i)) + ' ' + __lab.store.get(i).st)], r.ids)));
  ok(st.w === 'RUNNING' && st.j === 'RUNNING', 'the well and the junction are running');
  ok(st.t.every(v => v > 50), 'the oil is split to all three tanks: ' + st.t.join(' / ') + ' bbl');
  const tot = st.t.reduce((a, c) => a + c, 0), mx = Math.max(...st.t), mn = Math.min(...st.t); ok(mx < 3 * mn + 200, 'the split is shared between the branches (not all into one)');
  // a tank branch blocked (full / disconnected) must not stop the others: delete one branch, the rest keep filling
  const before = await co(ids => ids.t.map(i => __lab.sim.ensure(__lab.store.get(i)).vol), r.ids); await co(ids => { const L = [...__lab.pipes.lines.values()].find(l => l.b && l.b.b === ids.t[0]); __lab.pipes.remove(L.id); __lab.company.advanceHours(24); }, r.ids);
  const after = await co(ids => ids.t.map(i => __lab.sim.ensure(__lab.store.get(i)).vol), r.ids);
  ok(after[0] - before[0] < 5 && after[1] > before[1] + 20 && after[2] > before[2] + 20, 'after one branch is removed the other two tanks keep filling (the first stops)');
  // merging: two full tanks feed one junction that feeds a third tank
  const m = await co(() => { const L = __lab, S = L.store, I = L.I, B = L.B; for (const id of [...L.pipes.lines.keys()]) L.pipes.remove(id); const w = S.list().find(x => x.d === 'oil_well'); for (const x of S.list()) if (x.id !== w.id) S.demolish(x.id, { building: true, pipes: true, pipeSet: L.pipes }); S.cash = 1e9;
    const put = (d, x, y) => { const sn = S.snap(d, Math.round(x), Math.round(y), 0, { radius: 14, ignoreCash: true }); const q = sn && S.place(d, sn.x, sn.y, sn.r, { instant: true }); return q && q.ok ? q.building : null; };
    const j = put('junction', w.x + 8, w.y + 8), a = put('crude_tank_s', j.x - 10, j.y), c = put('crude_tank_s', j.x, j.y - 11), d = put('crude_tank_s', j.x + 10, j.y + 11); if (!(j && a && c && d)) return { err: 1 };
    for (const x of [a, c]) { L.sim.ensure(x).vol = 8000; } const free = (x, want) => B.worldPoints(x).filter(q => q.kind === 'pipe' && !q.reserved && (q.role === 'both' || q.role === want)).map(q => q.id);
    const link = (A, Bd) => { let best = null; for (const pa of free(A, 'out')) for (const pb of free(Bd, 'in')) { const v = I.planPipe(S, L.pipes, L.ts, { b: A.id, port: pa }, { b: Bd.id, port: pb }, 16, { ignoreCash: true }); if (v.ok && (!best || v.path.length < best.l)) best = { pa, pb, l: v.path.length }; } return !!best && I.layPipe(S, L.pipes, L.ts, { b: A.id, port: best.pa }, { b: Bd.id, port: best.pb }, 16, { ignoreCash: true }).ok; };
    return { ok: link(a, j) && link(c, j) && link(j, d), ids: [a.id, c.id, d.id] }; });
  ok(!m.err && m.ok, 'merge setup: two tanks -> junction -> one tank'); await co(() => __lab.company.advanceHours(48));
  const mv = await co(ids => ids.map(i => Math.round(__lab.sim.ensure(__lab.store.get(i)).vol)), m.ids); ok(mv[0] < 8000 && mv[1] < 8000 && mv[2] > 500, 'both sources drain into the single tank through the junction: ' + mv.join(' / ') + ' bbl');
  ok(errs.length === 0, 'no console / page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close(); srv.close(); console.log('\nJUNCTION PLUS TESTS PASSED (' + n + ' checks)');
})().catch(e => { console.log('FAILED: ' + e.message.split('\n').slice(0,4).join(' / ')); process.exit(1); });
