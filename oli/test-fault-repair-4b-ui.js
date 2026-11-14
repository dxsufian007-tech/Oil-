/* FAULT INTELLIGENCE P4B in the real game on a phone viewport: connect a free port with the what-if preview, two confirmations, one journal entry. SHOTS=/dir NODE_PATH=/opt/npm-tools/node_modules node test-fault-repair-4b-ui.js */
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
  /* remove a pipe so that something becomes isolated, then connect it again from the panel */
  const victim = await ev(() => { const L = [...__lab.pipes.lines.values()].find(l => l.a && l.b); __lab.pipes.remove(L.id); __lab.company.speed = 0; __netdiag.scan(); const f = __netdiag.st.rep.faults.find(z => z.code === 'ISOLATED' || z.code === 'NO_OUTPUT_PIPE' || z.code === 'DEAD_END'); return { id: L.id, codes: [...new Set(__netdiag.st.rep.faults.map(z => z.code))], no: f && f.no }; });
  console.log('  probe', JSON.stringify(victim));
  const stt = () => ev(() => JSON.stringify({ cash: __lab.store.cash, n: __lab.pipes.toJSON(), j: __lab.company.journal.n, lines: __lab.pipes.lines.size }));
  await ev(() => { __netdiag.st.mode = 'full'; __netdiag.select(1); __netdiag.st.mode = 'full'; __netdiag.render(); }); await p.waitForTimeout(300);
  ok(await p.locator('#ndPanel .nd-op').count() >= 1, 'A0 the isolated finding lists remedy options');
  await p.locator('#ndPanel .nd-op.rec > button').first().tap(); await p.waitForTimeout(250); await p.locator('[data-nd=rpPlan]').first().tap(); await p.waitForTimeout(300);
  let t = await p.textContent('#ndPanel'); if (SH) await p.screenshot({ path: SH + '/b1.png' });
  ok(/ماذا لو/.test(t) && /تقدير استشاري/.test(t) && /ليس نتيجة المحاكاة الكاملة/.test(t), 'A1 the what-if preview is shown with the "advisory estimate, not the full simulation" label');
  ok(/التكلفة/.test(t) && /تأكيد نهائي مطلوب/.test(t) && /1 من 2/.test(t), 'A2 the cost and a TWO-step confirmation (new destination)');
  const s0 = JSON.parse(await stt()); await p.locator('[data-nd=rpConfirm]').tap(); await p.waitForTimeout(300); const s1 = JSON.parse(await stt()); ok(s1.cash === s0.cash && s1.lines === s0.lines, 'A3 the first confirmation changes nothing'); t = await p.textContent('#ndPanel'); ok(/2 من 2/.test(t), 'A4 the second step is asked');
  if (SH) await p.screenshot({ path: SH + '/b2.png' });
  await p.locator('[data-nd=rpConfirm]').tap(); await p.waitForTimeout(700); const s2 = JSON.parse(await stt()); if (SH) await p.screenshot({ path: SH + '/b3.png' });
  ok(s2.cash < s0.cash && s2.lines === s0.lines + 1 && s2.j === s0.j + 1, 'A5 executed: a new pipe, cash down, exactly one journal entry', [s0.cash - s2.cash, s2.lines, s2.j - s0.j]);
  ok(await ev(() => __lab.company.audit().ok), 'A6 the company audit passes'); ok(await ev(() => !__netdiag.st.rep.faults.some(f => f.code === 'ISOLATED')), 'A7 the new scan no longer lists the isolated well');
  const saved = await ev(() => JSON.stringify(__lab.company.toJSON()) + JSON.stringify(__lab.pipes.toJSON())); ok(!/"tickets"|"repairs"|whatIf/.test(saved), 'A8 no ticket / preview data in the save');
  ok(errs.length === 0, 'no page errors: ' + errs.join(' | ')); console.log('PASS ' + n); await b.close(); srv.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
