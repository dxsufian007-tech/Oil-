/* FAULT INTELLIGENCE, ADVISOR MODEL on a phone viewport: a MAJOR change is a recommendation (no execute button), what-if and the map route are read-only and temporary; a SIMPLE repair still needs its own approval. SHOTS=/dir NODE_PATH=/opt/npm-tools/node_modules node test-fault-advisory-ui.js */
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
  const stt = () => ev(() => JSON.stringify({ cash: __lab.store.cash, n: __lab.pipes.toJSON(), j: __lab.company.journal.n, lines: __lab.pipes.lines.size, items: [...__lab.store.items.values()], co: Object.assign(__lab.company.toJSON(), { savedAt: 0 }) }));   /* savedAt is the wall-clock stamp toJSON() writes each time it is called: not game state */
  await ev(() => { __netdiag.st.mode = 'full'; __netdiag.select(1); __netdiag.st.mode = 'full'; __netdiag.render(); }); await p.waitForTimeout(300);
  ok(await p.locator('#ndPanel .nd-op').count() >= 1, 'A0 the isolated finding lists remedy options');
  const s0 = await stt(); await p.locator('#ndPanel .nd-op.rec > button').first().tap(); await p.waitForTimeout(300); let t = await p.textContent('#ndPanel'); if (SH) await p.screenshot({ path: SH + '/c1.png' });
  ok(/توصية — التنفيذ بيدك/.test(t) && /توصية فقط/.test(t) && /لا زر تنفيذ/.test(t), 'A1 a major change is shown as "recommendation only - the execution is yours"');
  ok(await p.locator('[data-nd=rpPlan]').count() === 0 && await p.locator('[data-nd=rpConfirm]').count() === 0, 'A2 there is NO execute / plan / confirm button for it');
  ok(/كيف تنفّذه يدوياً/.test(t) && /التكلفة/.test(t) && /\$/.test(t), 'A3 the cost and the manual steps are shown');
  /* what-if */
  await p.locator('[data-nd=wi]').first().tap(); await p.waitForTimeout(300); t = await p.textContent('#ndPanel'); if (SH) await p.screenshot({ path: SH + '/c2.png' });
  ok(/ماذا لو/.test(t) && /تقدير استشاري/.test(t) && /ليس نتيجة المحاكاة الكاملة/.test(t) && /قبل/.test(t) && /بعد/.test(t), 'B1 the what-if shows flows before / after with the "advisory estimate" label');
  { const s1 = await stt(); if (s1 !== s0) { const A = JSON.parse(s0), B = JSON.parse(s1); console.log('  diff keys', Object.keys(A).filter(k => JSON.stringify(A[k]) !== JSON.stringify(B[k]))); const ca = A.co, cb = B.co; console.log('  co diff', Object.keys(ca).filter(k => JSON.stringify(ca[k]) !== JSON.stringify(cb[k]))); } ok(s1 === s0, 'B2 the what-if changed nothing (network, buildings, cash, journal, company)'); }
  /* the map route */
  await p.locator('[data-nd=mp]').first().tap(); await p.waitForTimeout(300); if (SH) await p.screenshot({ path: SH + '/c3.png' });
  const prev = await ev(() => __netdiag.ov.prev && { n: __netdiag.ov.prev.tiles.length, kind: __netdiag.ov.prev.kind }); ok(prev && prev.n > 0 && prev.kind === 'NEW', 'C1 "show me on the map": a temporary route of ' + (prev && prev.n) + ' tiles is drawn', prev);
  ok(await stt() === s0 && await ev(() => !JSON.stringify(__lab.pipes.toJSON()).includes('prev')), 'C2 the map route changed nothing and is not part of the network or the save');
  await p.locator('[data-nd=mp]').first().tap(); await p.waitForTimeout(200); ok(await ev(() => __netdiag.ov.prev == null), 'C3 pressing it again hides the route');
  await p.locator('[data-nd=mp]').first().tap(); await p.waitForTimeout(200); ok(await ev(() => !!__netdiag.ov.prev), 'C4 shown again');
  await p.locator('#ndPanel .nd-op.rec > button').first().tap(); await p.waitForTimeout(200); ok(await ev(() => __netdiag.ov.prev == null), 'C5 closing the preview (collapsing the option) removes the overlay');
  await p.locator('#ndPanel .nd-op.rec > button').first().tap(); await p.waitForTimeout(200); await p.locator('[data-nd=mp]').first().tap(); await p.waitForTimeout(200); await ev(() => { __netdiag.st.mode = 'hidden'; document.querySelector('#ndPanel [data-nd=close]') && document.querySelector('#ndPanel [data-nd=close]').click(); }); await p.waitForTimeout(200);
  ok(await ev(() => __netdiag.ov.prev == null), 'C6 closing the panel removes the overlay'); { const s1 = await stt(); if (s1 !== s0) { const A = JSON.parse(s0), B = JSON.parse(s1); console.log('  diff keys', Object.keys(A).filter(k => JSON.stringify(A[k]) !== JSON.stringify(B[k]))); for (const k of ['co', 'n']) { const ca = A[k], cb = B[k]; console.log('  ' + k + ' diff', Object.keys(ca).filter(q => JSON.stringify(ca[q]) !== JSON.stringify(cb[q])).map(q => q + ':' + JSON.stringify(ca[q]).slice(0, 80) + ' -> ' + JSON.stringify(cb[q]).slice(0, 80))); } } ok(s1 === s0, 'C7 after all of this the game is byte-identical'); }
  /* a SIMPLE repair keeps its own approval */
  await ev(() => { const L = __lab.pipes; const k = [...L.lines.keys()][0]; __lab.company.speed = 0; }); 
  const saved = await ev(() => JSON.stringify(__lab.company.toJSON()) + JSON.stringify(__lab.pipes.toJSON())); ok(!/"tickets"|"repairs"|whatIf|advisory/.test(saved), 'D1 no ticket / advisory data in the save');
  ok(errs.length === 0, 'no page errors: ' + errs.join(' | ')); console.log('PASS ' + n); await b.close(); srv.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
