/* NETWORK DIAGNOSTICS in a real browser: the button, the panel, the real map overlay and the jump to a fault.   NODE_PATH=/opt/npm-tools/node_modules node test-network-diag-ui.js */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
(async () => {
  const b = await chromium.launch(), p = await (await b.newContext({ viewport: { width: 412, height: 866 }, hasTouch: true, isMobile: true })).newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message)); const ev = (f, a) => p.evaluate(f, a), port = srv.address().port;
  await p.goto('http://localhost:' + port + '/?lab=1&lang=en'); await p.waitForFunction(() => window.__lab && __lab.restored && window.__layers && window.__netdiag, null, { timeout: 90000 });
  await ev(() => { localStorage.clear(); __lab.reset(); __lab.company.speed = 0; }); await p.waitForTimeout(350); await p.waitForFunction(() => __wp.idle(), null, { timeout: 90000 });
  const built = await ev(async () => { const d = await __lab.buildDemo(); return { ok: d.ok, total: d.total, pipelines: d.pipelines }; }); ok(built.ok && built.total === 12 && built.pipelines === 11, 'the real oil chain is built in the game (12 buildings, 11 pipelines)');
  await p.waitForFunction(() => __wp.idle(), null, { timeout: 90000 }); await ev(() => { __lab.company.speed = 0; __lab.company.advanceHours(24); });
  ok(await p.locator('#ndBtn').count() === 1, 'the «فاحص الشبكة» button is in the toolbar');
  await p.locator('#ndBtn').tap(); await p.waitForSelector('#ndPanel .nd-sum', { timeout: 10000 });
  let t = await p.textContent('#ndPanel'); ok(/سلامة الشبكة/.test(t) && /العناصر المفحوصة/.test(t) && /الاتصالات السليمة/.test(t) && /الأعطال المؤكدة/.test(t) && /التحذيرات/.test(t), 'the panel shows health %, checked elements, healthy connections, faults, warnings');
  const s0 = await ev(() => JSON.parse(JSON.stringify(__netdiag.st.rep.stats))); ok(s0.faults === 0 && s0.health === 100 && s0.buildings === 12 && s0.lines === 11, 'a healthy network: 0 faults, 100% (12 buildings, 11 pipes)', JSON.stringify(s0));
  ok(/لم يُعثر على أي عطل/.test(t), 'and the panel says so');
  const before = await ev(() => JSON.stringify({ n: __lab.pipes.toJSON(), cash: __lab.store.cash, h: __lab.company.hours })); await ev(() => __netdiag.scan()); ok(await ev(() => JSON.stringify({ n: __lab.pipes.toJSON(), cash: __lab.store.cash, h: __lab.company.hours })) === before, 'scanning changed nothing (pipes, cash, game time)');
  /* break the network: detach one pipe, close another */
  const info = await ev(() => { const L = [...__lab.pipes.lines.values()]; const a = L[5], b2 = L[6], tail = a.path[a.path.length - 1]; a.b = null; __lab.pipes.rev++; b2.open = false; __lab.pipes.rev++; return { a: a.id, tail, c: b2.id }; });
  await p.waitForTimeout(300); t = await p.textContent('#ndPanel'); ok(/تغيّرت الشبكة منذ آخر فحص/.test(await ev(() => (__netdiag.render(), __netdiag.panel.textContent))), 'after a change the panel warns that the result is stale');
  await p.locator('#ndPanel [data-nd=scan]').first().tap(); await p.waitForTimeout(400);
  const rep = await ev(() => __netdiag.st.rep.faults.map(f => ({ no: f.no, code: f.code, sev: f.severity, el: f.element.id, x: f.x, y: f.y, zone: f.zone, confirmed: f.confirmed }))); const open = rep.find(f => f.code === 'OPEN_END'), closed = rep.find(f => f.code === 'CLOSED_LINE');
  ok(open && open.el === info.a && open.x === info.tail[0] && open.y === info.tail[1] && open.sev === 'CRITICAL', 'the detached pipe is found at its free end', JSON.stringify(rep));
  ok(closed && closed.el === info.c && !closed.confirmed, 'the closed pipe is a warning on the right pipe');
  ok(rep[0].no === 1 && rep.every((f, i) => f.no === i + 1) && rep[0].sev === 'CRITICAL', 'the list is numbered and starts with the critical fault');
  ok(await ev(() => __netdiag.ov.lines.some(l => l.ok) && __netdiag.ov.lines.some(l => !l.ok && l.c === '#ff3b30') && __netdiag.ov.lines.some(l => l.c === '#ffd60a')), 'the overlay has green (healthy), red (critical) and yellow (warning) pipes');
  await p.locator('#ndPanel .nd-fh').first().tap(); await p.waitForTimeout(500);
  const cam = await ev(() => ({ x: __wp.cam.x, y: __wp.cam.y, sel: __netdiag.st.sel })); const near = await ev((o) => { const u = __wp.cam.x, v = __wp.cam.y; return Math.hypot(u - (o.x + .5), v - (o.y + .5)); }, open); ok(cam.sel === 1 && near < 6, 'tapping the fault in the list moves the map to its location (distance ' + near.toFixed(1) + ' tiles)');
  t = await p.textContent('#ndPanel .nd-f.sel'); ok(/النوع/.test(t) && /الخطورة/.test(t) && /العنصر/.test(t) && /المنطقة/.test(t) && /الإحداثيات/.test(t) && /السابق في التدفق/.test(t) && /اللاحق في التدفق/.test(t) && /السبب/.test(t) && /التأثير/.test(t) && /الإصلاح المقترح/.test(t), 'the open fault shows all ten fields');
  ok(t.includes('PIPE-' + info.a) && t.includes('(' + info.tail[0] + ', ' + info.tail[1] + ')'), 'with the real pipe id and coordinates');
  await p.screenshot({ path: process.env.SHOT || '/tmp/netdiag-ui.png' });
  /* tapping the marker on the map selects the same fault */
  await ev(() => __netdiag.select(2)); const pt = await ev(() => { const m = __netdiag.ov.marks.find(z => z.no === 1); return { x: __wp.sx(m.x, m.y), y: __wp.sy(m.x, m.y) }; });
  await p.waitForTimeout(300); await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(300); ok(await ev(() => __netdiag.st.sel) === 1, 'tapping the red marker on the map selects fault 1 in the panel');
  /* repair and re-scan */
  await ev(() => { const L = __lab.pipes.lines; const a = [...L.values()][5]; const orig = __lab.pipes.lines.get(a.id); orig.b = { b: [...__lab.store.items.values()].find(z => z.d === 'crude_tank_m').id, port: 'INPUT_W' }; delete [...L.values()][6].open; __lab.pipes.rev++; });
  await p.locator('#ndPanel [data-nd=scan]').first().tap(); await p.waitForTimeout(400); const s2 = await ev(() => __netdiag.st.rep.stats);
  ok(s2.faults + s2.warnings < rep.length + 0 && !(await ev(() => __netdiag.st.rep.faults.some(f => f.code === 'CLOSED_LINE'))), 'after the repair and a re-scan the closed-pipe warning is gone', JSON.stringify(s2));
  await p.locator('#ndPanel .nd-x').tap(); ok(await ev(() => getComputedStyle(document.getElementById('ndPanel')).display) === 'none', 'the panel closes');
  ok(errs.length === 0, 'no page errors: ' + errs.join(' | ')); console.log('PASS ' + n); await b.close(); srv.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
