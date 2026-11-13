/* The automatic purchasing panel in the real game page (phone size): ☰ company -> purchases -> automatic purchasing.
 *   node oli/test-autobuy-ui.js [shotDir] */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'); let ok = 0, bad = 0; const t = (n, c, x) => { if (c) { ok++; console.log('  ok  ' + n); } else { bad++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); } };
const SHOT = process.argv[2] || null;
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : f.endsWith('.webp') ? 'image/webp' : 'application/octet-stream' }); r.end(d); }); });
srv.listen(0, async () => { const b = await chromium.launch(), p = await (await b.newContext({ viewport: { width: 412, height: 866 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:' + srv.address().port + '/?unlock=all'); await p.waitForFunction(() => window.__lab && __lab.restored && __wp.idle(), null, { timeout: 120000 }); await p.waitForTimeout(600);
  await p.evaluate(() => { __lab.company.speed = 0; OliEconomyUI.open('company'); }); await p.waitForTimeout(300);
  await p.click('#es-body [data-act="screen"][data-v="buy"]'); await p.waitForTimeout(300);
  let txt = (await p.innerText('#es-body')).replace(/[\u2066-\u2069]/g, ''); t('the purchases screen has the automatic purchasing section for the three materials', /الشراء التلقائي للمواد والمستودعات/.test(txt) && (txt.match(/الشراء التلقائي مفعّل|الشراء التلقائي متوقف/g) || []).length === 3, txt.slice(-600));
  t('it shows stock, capacity 500,000 kg, daily use and need, and that nothing uses them yet', /من 500,000 كغ/.test(txt) && /الاستهلاك الفعلي/.test(txt) && /لا توجد منشأة تستهلكها/.test(txt));
  await p.click('[data-ab="PARTS"] [data-act="abon"]'); await p.waitForTimeout(200); t('the switch turns automatic purchasing on for spare parts', await p.evaluate(() => __lab.company.autoBuyInfo('PARTS').on));
  await p.fill('#ab-CHEM-reorder', '12000'); await p.fill('#ab-CHEM-target', '60000'); await p.fill('#ab-CHEM-maxSpendDay', '250000'); await p.click('[data-ab="CHEM"] [data-act="abset"]'); await p.waitForTimeout(250);
  const i = await p.evaluate(() => __lab.company.autoBuyInfo('CHEM')); t('«حفظ» stores the reorder point, the target and the daily spending cap', i.reorder === 12000 && i.target === 60000 && i.maxSpendDay === 250000 && !i.reorderAuto, i);
  await p.fill('#ab-CHEM-reorder', ''); await p.click('[data-ab="CHEM"] [data-act="abset"]'); await p.waitForTimeout(200); t('an emptied field returns to automatic', await p.evaluate(() => __lab.company.autoBuyInfo('CHEM').reorderAuto));
  const c0 = await p.evaluate(() => __lab.store.cash); await p.click('[data-ab="OPS"] [data-act="whup"]'); await p.waitForTimeout(250);
  const w = await p.evaluate(() => ({ cap: __lab.company.matCap('OPS'), cash: __lab.store.cash })); t('the warehouse button upgrades operating materials to 150,000 and charges the cost', w.cap === 150000 && c0 - w.cash > 1e6, [c0, w]);
  if (SHOT) { await p.evaluate(() => { const e = document.querySelector('[data-ab="CHEM"]'); e.scrollIntoView(); }); await p.waitForTimeout(200); await p.screenshot({ path: path.join(SHOT, 'autobuy.png') }); }
  t('no page errors', !errs.length, errs); console.log('\n' + ok + ' passed, ' + bad + ' failed'); await b.close(); srv.close(); process.exit(bad ? 1 : 0); });
