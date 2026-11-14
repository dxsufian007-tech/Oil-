/* FAULT INTELLIGENCE P1 in the real game on a phone viewport: a leftover pipe is ONE low finding with its first-seen line; the registry marks it resolved; nothing is saved.  SHOTS=/dir NODE_PATH=/opt/npm-tools/node_modules node test-fault-intel-p1-ui.js */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
const SH = process.env.SHOTS;
(async () => {
  const b = await chromium.launch(), p = await (await b.newContext({ viewport: { width: 412, height: 866 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })).newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message)); const ev = (f, a) => p.evaluate(f, a), port = srv.address().port;
  await p.goto('http://localhost:' + port + '/?lab=1&lang=en'); await p.waitForFunction(() => window.__lab && __lab.restored && window.__layers && window.__netdiag, null, { timeout: 90000 });
  await ev(() => { localStorage.clear(); __lab.reset(); __lab.company.speed = 0; }); await p.waitForTimeout(350); await p.waitForFunction(() => __wp.idle(), null, { timeout: 90000 });
  await ev(async () => { await __lab.buildDemo(); }); await p.waitForFunction(() => __wp.idle(), null, { timeout: 90000 }); await ev(() => { __lab.company.speed = 0; __lab.company.advanceHours(24); });
  const save0 = await ev(() => JSON.stringify({ n: __lab.pipes.toJSON(), s: [...__lab.store.items.values()].length }));
  await ev(() => { const L = __lab.pipes.lines.get(9), a = L.a.b, b = L.b.b; for (const id of [a, b]) __lab.store.demolish(id, { building: true, pipes: true, pipeSet: __lab.pipes }); __lab.pipes.rev++; __wp.markDirty && __wp.markDirty(); });
  await p.locator('#ndBtn').tap(); await p.waitForSelector('#ndPanel .nd-sum', { timeout: 10000 });
  const rep = await ev(() => __netdiag.st.rep.faults.filter(f => f.code === 'MISSING_BUILDING' && f.element.id === 9).map(f => ({ no: f.no, sev: f.severity, merged: f.merged, since: f.issue && f.issue.ageHours })));
  ok(rep.length === 1 && rep[0].merged === 2 && rep[0].sev === 'LOW', 'the panel lists the leftover PIPE-9 once, severity LOW (not two critical faults)');
  await ev(() => { __netdiag.st.mode = 'full'; __netdiag.select(__netdiag.st.rep.faults.find(f => f.code === 'MISSING_BUILDING' && f.element.id === 9).no); __netdiag.st.mode = 'full'; __netdiag.render(); }); await p.waitForTimeout(500);
  let t = await p.textContent('#ndPanel'); if (SH) await p.screenshot({ path: SH + '/f0.png' }); ok(/بقايا أنبوب/.test(t) && /أول رصد/.test(t) && /أطراف مدموجة/.test(t), 'the detail says it is a leftover, shows the first-seen line and the merged ends'); await ev(() => { const sc = document.querySelector('#ndPanel .nd-scroll'); sc.scrollTop = sc.scrollHeight; }); await p.waitForTimeout(300); if (SH) await p.screenshot({ path: SH + '/f1-leftover.png' });
  await ev(() => { __lab.company.advanceHours(48); }); await ev(() => __netdiag.scan()); t = await p.textContent('#ndPanel'); ok(await ev(() => __netdiag.st.rep.faults.find(f => f.code === 'MISSING_BUILDING' && f.element.id === 9).issue.ageHours >= 47), 'two game days later the registry says the issue is about 2 days old (first seen in this session)'); if (SH) await p.screenshot({ path: SH + '/f2-later.png' });
  await ev(() => { __lab.pipes.remove(9); __lab.pipes.rev++; }); await ev(() => __netdiag.scan()); ok(await ev(() => __netdiag.st.rep.issues.resolved >= 1 && !__netdiag.st.rep.faults.some(f => f.code === 'MISSING_BUILDING' && f.element.id === 9)), 'after the player deletes the pipe the finding is gone and the registry counts it resolved');
  const saved = await ev(() => JSON.stringify({ n: __lab.pipes.toJSON() })); ok(saved.indexOf('issue') < 0 && saved.indexOf('registry') < 0, 'the pipe network save data has nothing from the registry');
  ok(errs.length === 0, 'no page errors: ' + errs.join(' | ')); console.log('PASS ' + n); await b.close(); srv.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
