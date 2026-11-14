/* FAULT INTELLIGENCE P4A in the real game on a phone viewport: executing the 4A repairs on a phone: paused-only, one confirmation to open, two to delete an orphan pipe; the result, the cash and the save.  SHOTS=/dir NODE_PATH=/opt/npm-tools/node_modules node test-fault-repair-4a-ui.js */
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
  const st = () => ev(() => JSON.stringify({ cash: __lab.store.cash, n: __lab.pipes.toJSON(), j: __lab.company.journal.n, ev: __lab.company.events.length }));
  const open = async (no) => { await ev(n => { __netdiag.st.mode = 'full'; __netdiag.select(n); __netdiag.st.mode = 'full'; __netdiag.render(); }, no); await p.waitForTimeout(300); };
  const rootNo = () => ev(() => __netdiag.st.rep.rca.groups.find(g => g.element.id === 6).rootNo);
  /* A: open the closed pipe */
  await ev(() => { __lab.pipes.lines.get(6).open = false; __lab.pipes.rev++; __lab.company.advanceHours(1); __lab.company.speed = 1; });
  await p.locator('#ndBtn').tap(); await p.waitForSelector('#ndPanel .nd-sum', { timeout: 10000 }); await open(await rootNo());
  await p.locator('#ndPanel .nd-op.rec > button').first().tap(); await p.waitForTimeout(250); await p.locator('[data-nd=rpPlan]').first().tap(); await p.waitForTimeout(250);
  let t = await p.textContent('#ndPanel'); ok(/تأكيد التنفيذ/.test(t) && /بلا كلفة/.test(t) && /أوقف اللعبة مؤقتاً/.test(t), 'A1 while the game runs the confirmation says "pause first"');
  ok(await p.locator('[data-nd=rpConfirm]').isDisabled(), 'A2 the confirm button is disabled while the game runs'); if (SH) await p.screenshot({ path: SH + '/r1.png' });
  await ev(() => { __lab.company.speed = 0; __netdiag.render(); }); await p.waitForTimeout(200); ok(!(await p.locator('[data-nd=rpConfirm]').isDisabled()), 'A3 paused: the confirm button is enabled');
  const s0 = JSON.parse(await st()); await p.locator('[data-nd=rpConfirm]').tap(); await p.waitForTimeout(500); t = await p.textContent('#ndPanel'); if (SH) await p.screenshot({ path: SH + '/r2.png' });
  const s1 = JSON.parse(await st()); ok(/الإصلاح: فتح المسار/.test(t) && s1.cash === s0.cash && s1.j === s0.j && s1.ev === s0.ev + 1, 'A4 one tap: executed, no money, no journal entry, one event', [s0.cash, s1.cash, s0.j, s1.j]);
  ok(await ev(() => __lab.pipes.lines.get(6).open !== false), 'A5 the pipe is open'); ok(await ev(() => !__netdiag.st.rep.faults.some(f => f.code === 'CLOSED_LINE' && f.element.id === 6)), 'A6 the new scan no longer lists the closed pipe');
  /* B: delete an orphan pipe (two confirmations, the refund in the journal) */
  const orph = await ev(() => { const L = __lab.pipes.lines.get(9) || [...__lab.pipes.lines.values()].find(l => l.id !== 6); for (const e of [L.a, L.b]) if (e && __lab.store.get(e.b)) __lab.store.demolish(e.b, { building: true, pipes: true, pipeSet: __lab.pipes }); __lab.pipes.rev++; return L.id; });
  await ev(() => { __lab.company.speed = 0; }); await p.locator('#ndBtn').tap().catch(() => {}); await ev(() => { __netdiag.scan(); }); await p.waitForTimeout(300);
  const fno = await ev(id => { const f = __netdiag.st.rep.faults.find(z => z.code === 'MISSING_BUILDING' && z.element.id === id); return f && f.no; }, orph); ok(!!fno, 'B0 the orphan pipe is reported'); await open(fno);
  await p.locator('#ndPanel .nd-op > button', { hasText: 'احذف الأنبوب' }).first().tap(); await p.waitForTimeout(250); await p.locator('[data-nd=rpPlan]').first().tap(); await p.waitForTimeout(250); t = await p.textContent('#ndPanel');
  ok(/تأكيد نهائي مطلوب/.test(t) && /يُسترد/.test(t) && /التأكيد 1 من 2/.test(t), 'B1 deletion: a two-step confirmation with the refund shown'); const b0 = JSON.parse(await st()); await p.locator('[data-nd=rpConfirm]').tap(); await p.waitForTimeout(300); const b1 = JSON.parse(await st());
  ok(b1.cash === b0.cash && await ev(id => __lab.pipes.lines.has(id), orph), 'B2 the first confirmation changes nothing'); t = await p.textContent('#ndPanel'); ok(/تأكيد الحذف النهائي/.test(t), 'B3 the second step asks for the final confirmation'); if (SH) await p.screenshot({ path: SH + '/r3.png' });
  await p.locator('[data-nd=rpConfirm]').tap(); await p.waitForTimeout(600); const b2 = JSON.parse(await st()), refund = b2.cash - b0.cash; ok(refund > 0 && b2.j === b0.j + 1 && await ev(id => !__lab.pipes.lines.has(id), orph), 'B4 the second confirmation deletes it: cash +' + refund + ' through one journal entry', [b0.cash, b2.cash, b0.j, b2.j]);
  ok(await ev(() => __lab.company.audit().ok), 'B5 the company audit passes'); t = await p.textContent('#ndPanel'); ok(/الإصلاح: حذف/.test(t), 'B6 the result is shown');
  /* C: the save has no ticket data */
  const saved = await ev(() => JSON.stringify(__lab.company.toJSON()) + JSON.stringify(__lab.pipes.toJSON())); ok(!/"tickets"|"repairs"/.test(saved), 'C1 no repair/ticket structure in the save');
  ok(errs.length === 0, 'no page errors: ' + errs.join(' | ')); console.log('PASS ' + n); await b.close(); srv.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
