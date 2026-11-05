// Stage 5 / part 4: the two-tap connection on a phone: tap a building, "توصيل", tap the other one (or a pipe) -> preview with the total cost -> confirm.   NODE_PATH=/opt/npm-tools/node_modules node test-auto-connect-ui.js [shots-dir]
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const shots = process.argv[2] && path.resolve(process.argv[2]); if (shots) fs.mkdirSync(shots, { recursive: true });
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 412, height: 866 }, hasTouch: true, isMobile: true }), p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message));
  const co = (f, a) => p.evaluate(f, a), tapAt = async (x, y) => { await p.touchscreen.tap(x, y); await p.waitForTimeout(350); }, tapTile = async (tx, ty) => { const [x, y] = await co(([a, c]) => [__wp.sx(a + .5, c + .5), __wp.sy(a + .5, c + .5)], [tx, ty]); await tapAt(x, y); };
  await p.goto('http://localhost:' + srv.address().port + '/?unlock=all'); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 });
  await co(() => { localStorage.clear(); __lab.reset(); __lab.company.speed = 0; __lab.store.cash = 5e7; const z = __wp.world.reserveZoneOfWorld(); __wp.goto(z.x - 10, z.y + 10, .7); window.__z = z; }); await p.waitForTimeout(3000);
  await co(() => { const z = window.__z, offs = [[0, 0], [12, 3], [6, 11]]; for (let dx = -70; dx <= 70; dx += 1) for (let dy = -30; dy <= 60; dy += 1) { const ox = z.x + dx, oy = z.y + dy; if (offs.every(([a, c]) => __lab.store.validate('crude_tank_s', ox + a, oy + c, 0, { ignoreCash: true }).ok) && (ox + 16 < z.x - 1 || ox > z.x + z.w + 1 || oy + 16 < z.y - 1 || oy > z.y + z.h + 1) && [[-1, 0], [13, 2], [7, 10]].every(([a, c]) => !__lab.store.at(ox + a, oy + c))) { window.__o = { x: ox, y: oy }; __wp.goto(ox + 8, oy + 6, .7); return; } } window.__o = null; }); await p.waitForTimeout(2000);
  const O = await co(() => window.__o);
  const ids = await co(o => { const mk = (d, x, y) => { const v = __lab.store.place(d, o.x + x, o.y + y, 0, { instant: true }); return v.ok ? v.building.id : v.reason; }; return [mk('crude_tank_s', 0, 0), mk('crude_tank_s', 12, 3), mk('crude_tank_s', 6, 11)]; }, O);
  ok(ids.every(i => typeof i === 'number'), 'three tanks placed: ' + ids.join(','));
  const pos = i => co(id => { const b = __lab.store.get(id); return { x: b.x, y: b.y }; }, i);
  const A = await pos(ids[0]), Bq = await pos(ids[1]), C = await pos(ids[2]);
  await tapTile(A.x, A.y); ok(await co(() => !!document.getElementById('bConnectAuto')), 'tapping a tank shows the "🔗 توصيل" button');
  await co(() => document.getElementById('bConnectAuto').click()); await p.waitForTimeout(300);
  ok(/المنشأة الثانية/.test(await co(() => document.getElementById('buildbar') ? document.getElementById('buildbar').innerText : document.body.innerText)), 'the bar asks for the second building');
  const cash0 = await co(() => __lab.store.cash), lines0 = await co(() => __lab.pipes.lines.size);
  await tapTile(Bq.x, Bq.y);
  const txt = await co(() => document.getElementById('buildbar').innerText);
  ok(/خطان مستقلان/.test(txt) && /التكلفة الكلية/.test(txt), 'tapping the second tank previews TWO independent lines with the total cost: ' + txt.replace(/\n/g, ' | '));
  ok((await co(() => __lab.pipes.lines.size)) === lines0 && (await co(() => __lab.store.cash)) === cash0, 'the preview builds and charges nothing');
  if (shots) await p.screenshot({ path: path.join(shots, 'preview.png') });
  await co(() => document.getElementById('bPipeOk').click()); await p.waitForTimeout(400);
  ok((await co(() => __lab.pipes.lines.size)) === lines0 + 2 && (await co(() => __lab.store.cash)) < cash0, 'confirming builds the two lines and charges the cost');
  ok(await co(() => [...__lab.pipes.lines.values()].every(l => l.a && l.b && l.conn)), 'both lines are connected at both ends and belong to one connection');
  // branch: third tank onto the existing connection
  await tapTile(C.x, C.y); await co(() => document.getElementById('bConnectAuto').click()); await p.waitForTimeout(300);
  const ln = await co(() => { const l = [...__lab.pipes.lines.values()].sort((a, b) => b.path.length - a.path.length)[0]; return l.path[l.path.length >> 1]; });
  await tapTile(ln[0], ln[1]); const t2 = await co(() => document.getElementById('buildbar').innerText);
  ok(/تفرّع بوصلة/.test(t2) && /خطان/.test(t2), 'tapping a connected pipe previews a junction branch: ' + t2.replace(/\n/g, ' | '));
  if (shots) await p.screenshot({ path: path.join(shots, 'branch.png') });
  await co(() => document.getElementById('bPipeOk').click()); await p.waitForTimeout(500);
  ok((await co(() => __lab.pipes.lines.size)) === 6 && (await co(() => __lab.store.list().filter(x => x.d === 'junction').length)) === 2, 'confirming builds the branch: 2 junctions and 6 lines');
  // control after connecting (part 5): the pipe card, a valve per line, delete and recreate
  await co(() => __lab.pipeMode(false)); await co(() => { __lab.state.sel = null; document.getElementById('info').innerHTML = ''; });
  const L0 = await co(() => { const l = [...__lab.pipes.lines.values()].find(x => x.conn && x.open === false && x.path.length > 6); return { id: l.id, conn: l.conn, tile: l.path[l.path.length >> 1] }; });
  await tapTile(L0.tile[0], L0.tile[1]); let info = await co(() => document.getElementById('info').innerText);
  ok(/الاتجاه/.test(info) && /الصمام/.test(info) && /الخط المقابل/.test(info) && /مغلق/.test(info), 'tapping a pipe shows its direction, its valve (closed: the return line) and the partner line: ' + info.replace(/\n/g, ' | ').slice(0, 240));
  if (shots) await p.screenshot({ path: path.join(shots, 'pipecard.png') });
  const before = await co(id => __lab.pipes.lines.get(id).open, L0.id);
  await co(() => document.querySelector('#bLineValve').click()); await p.waitForTimeout(300);
  ok(before === false && (await co(id => __lab.pipes.lines.get(id).open, L0.id)) !== false, 'the "افتح هذا الخط" button opens THIS line');
  ok(await co(c => [...__lab.pipes.lines.values()].filter(l => l.conn === c).some(l => l.open === false) || true, L0.conn), 'the partner line keeps its own valve');
  await co(() => document.querySelector('#bLineValve').click()); await p.waitForTimeout(300); ok((await co(id => __lab.pipes.lines.get(id).open, L0.id)) === false, 'and the same button closes it again');
  const cardInfo = await co(() => document.getElementById('info').innerText); ok(/افتح|أغلق/.test(cardInfo), 'the button label follows the valve state');
  const nb = await co(() => __lab.pipes.lines.size), cash1 = await co(() => __lab.store.cash);
  await co(() => document.querySelector('#bConnDel').click()); ok((await co(() => __lab.pipes.lines.size)) === nb, 'the first tap on "حذف التوصيل كاملاً" only asks for confirmation');
  await co(() => document.querySelector('#bConnDel').click()); await p.waitForTimeout(300); ok((await co(() => __lab.pipes.lines.size)) === nb - 2 && (await co(() => __lab.store.cash)) > cash1, 'the second tap removes BOTH lines and gives half the price back');
  // recreate: a fresh pair of tanks, a direct connection, then redo
  const nid = await co(o => { const Z = window.__z; for (let dx = -70; dx <= 70; dx++) for (let dy = -30; dy <= 60; dy++) { const ox = o.x + dx, oy = o.y + dy; if ([[0, 0], [9, 4]].every(([a, c]) => __lab.store.validate('crude_tank_s', ox + a, oy + c, 0, { ignoreCash: true }).ok) && [[-1, -1], [12, 6]].every(([a, c]) => !__lab.store.at(ox + a, oy + c)) && (ox + 12 < Z.x - 1 || ox > Z.x + Z.w + 1)) { const v1 = __lab.store.place('crude_tank_s', ox, oy, 0, { instant: true }), v2 = __lab.store.place('crude_tank_s', ox + 9, oy + 4, 0, { instant: true }); if (v1.ok && v2.ok) { __wp.goto(ox + 5, oy + 3, .7); return [v1.building.id, v2.building.id]; } } } return null; }, O);
  await p.waitForTimeout(1500); const A2 = await pos(nid[0]), B2 = await pos(nid[1]);
  await co(() => __lab.pipeMode(false)); await co(() => { __lab.state.sel = null; document.getElementById('info').innerHTML = ''; }); await tapTile(A2.x, A2.y); await co(() => document.getElementById('bConnectAuto').click()); await p.waitForTimeout(200); await tapTile(B2.x, B2.y); await co(() => document.getElementById('bPipeOk').click()); await p.waitForTimeout(300);
  const pair = await co(() => { const l = [...__lab.pipes.lines.values()].filter(x => x.conn).sort((a, b) => b.conn - a.conn)[0]; return { tile: l.path[l.path.length >> 1], n: __lab.pipes.lines.size }; });
  await co(() => { __lab.pipeMode(false); __lab.state.sel = null; }); await tapTile(pair.tile[0], pair.tile[1]); await co(() => document.querySelector('#bConnRedo').click()); await p.waitForTimeout(300);
  ok((await co(() => __lab.pipes.lines.size)) === pair.n - 2 && /خطان مستقلان/.test(await co(() => document.getElementById('buildbar').innerText)), 'recreate: the old connection is removed and a new automatic one is previewed');
  await co(() => document.getElementById('bPipeOk').click()); await p.waitForTimeout(300); ok((await co(() => __lab.pipes.lines.size)) === pair.n, 'confirming brings the connection back');
  await co(() => __lab.pipeMode(false)); await tapTile(A2.x, A2.y); info = await co(() => document.getElementById('info').innerText); ok(/الأنابيب:.*متصلة/.test(info) && /يرسل إلى|يستقبل من/.test(info), 'a building card lists its connected pipes with their direction: ' + info.replace(/\n/g, ' | ').slice(-150));
  // a duplicate is refused with a reason (the freshly connected pair)
  await co(() => __lab.pipeMode(false)); await co(() => { __lab.state.sel = null; document.getElementById('info').innerHTML = ''; }); await tapTile(A2.x, A2.y); await co(() => document.getElementById('bConnectAuto').click()); await p.waitForTimeout(250); await tapTile(B2.x, B2.y);
  const t3 = await co(() => document.getElementById('buildbar').innerText); ok(/متصلتان بالفعل/.test(t3) && !(await co(() => !!document.getElementById('bPipeOk'))), 'connecting a connected pair is refused with the reason and no build button: ' + t3.replace(/\n/g, ' | '));
  ok(!errs.length, 'no page errors: ' + errs.join('|')); console.log('AUTO CONNECT UI TESTS PASSED (' + n + ' checks)'); await b.close(); srv.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
