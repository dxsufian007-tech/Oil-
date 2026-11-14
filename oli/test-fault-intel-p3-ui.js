/* FAULT INTELLIGENCE P3 in the real game on a phone viewport: the repair catalog on a closed pipe: options with costs, a before/after preview and risks; the preview changes nothing; nothing is saved or charged.  SHOTS=/dir NODE_PATH=/opt/npm-tools/node_modules node test-fault-intel-p3-ui.js */
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
  const save0 = await ev(() => JSON.stringify({ n: __lab.pipes.toJSON(), s: [...__lab.store.items.values()], cash: __lab.company.cash }));
  await ev(() => { __lab.pipes.lines.get(6).open = false; __lab.pipes.rev++; __lab.company.advanceHours(1); });
  await p.locator('#ndBtn').tap(); await p.waitForSelector('#ndPanel .nd-sum', { timeout: 10000 });
  const snap = () => ev(() => JSON.stringify({ n: __lab.pipes.toJSON(), s: [...__lab.store.items.values()], cash: __lab.store.cash, ccash: __lab.company.cash, flows: [...__lab.pipes.lines.values()].map(L => [L.id, L.flow, L.open]) }));
  await ev(() => { __netdiag.st.mode = 'full'; __netdiag.select(__netdiag.st.rep.rca.groups.find(g => g.element.id === 6).rootNo); __netdiag.st.mode = 'full'; __netdiag.render(); }); await p.waitForTimeout(400);
  const s0 = await snap(); let t = await p.textContent('#ndPanel');
  ok(/الحلول المقترحة/.test(t) && /التغييرات الكبيرة توصيات فقط/.test(t) && /لا يغيّران اللعبة/.test(t) && /افتح المسار/.test(t) && /احذف الأنبوب/.test(t) && /موصى به/.test(t), 'the root shows the proposed solutions, the recommended one, and says: simple repairs need your approval, major changes are advice only, previews change nothing');
  ok(/مجاني/.test(t) && /يُسترد \$/.test(t), 'costs are shown: free for opening, a refund for deleting');
  await p.locator('#ndPanel .nd-op.rec > button').first().tap(); await p.waitForTimeout(300); t = await p.textContent('#ndPanel'); if (SH) await p.screenshot({ path: SH + '/p3a.png' });
  ok(/معاينة قبل الإصلاح/.test(t) && /مغلق/.test(t) && /مفتوح/.test(t) && /حتى [\d,]+ برميل/.test(t), 'tapping an option shows the before/after preview and the recovery');
  await p.locator('#ndPanel .nd-op:not(.rec) > button').first().tap(); await p.waitForTimeout(300); t = await p.textContent('#ndPanel'); if (SH) await p.screenshot({ path: SH + '/p3b.png' }); ok(/المخاطر/.test(t) && /حذف نهائي/.test(t), 'the other option shows its risks');
  ok((await snap()) === s0, 'opening the catalog and the previews changed nothing: buildings, pipes, flows, cash');
  const sym = await ev(() => { const f = __netdiag.st.rep.faults.find(f => f.rca && f.rca.role === 'SYMPTOM'); __netdiag.select(f.no); __netdiag.st.mode = 'full'; __netdiag.render(); return f.no; }); await p.waitForTimeout(300); t = await p.textContent('#ndPanel'); ok(/هذا عَرَض/.test(t), 'a symptom points to its root cause instead of proposing fixes');
  const saved = await ev(() => JSON.stringify({ n: __lab.pipes.toJSON(), s: [...__lab.store.items.values()] })); ok(saved.indexOf('actions') < 0 && saved.indexOf('remed') < 0, 'nothing from the catalog reaches the save data');
  ok(errs.length === 0, 'no page errors: ' + errs.join(' | ')); console.log('PASS ' + n); await b.close(); srv.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
