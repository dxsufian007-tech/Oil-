/* Automatic Reserve Selling UI on phone widths: create, pause, resume, edit, delete, totals, history; no sideways scroll.
 *   NODE_PATH=/opt/npm-tools/node_modules node test-reserve-auto-ui.js [shotDir] */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'); let ok = 0, bad = 0; const t = (n, c, x) => { if (c) { ok++; console.log('  ok  ' + n); } else { bad++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x).slice(0, 400)); } };
const SHOT = process.argv[2] || null;
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : f.endsWith('.webp') ? 'image/webp' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream' }); r.end(d); }); });
srv.listen(0, async () => {
  const b = await chromium.launch(), errs = [];
  for (const W of [412, 360, 768]) {
    const ctx = await b.newContext({ viewport: { width: W, height: W === 768 ? 1024 : 866 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true }), p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    const shot = async nm => { if (SHOT) await p.screenshot({ path: path.join(SHOT, 'auto-' + W + '-' + nm + '.png') }); }, ev = (f, a) => p.evaluate(f, a), body = () => ev(() => document.getElementById('es-body').innerText.replace(/[\u2066-\u2069\u200e\u200f]/g, '')), tap = async sel => { await p.locator(sel).first().tap(); await p.waitForTimeout(200); };
    const noScroll = async () => ev(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.getElementById('es-body').scrollWidth <= document.getElementById('es-body').clientWidth + 1);
    await p.goto('http://localhost:' + srv.address().port + '/?lab=1'); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 120000 }); await ev(() => { localStorage.clear(); __lab.reset(); __lab.company.injectEquity(1e9, 't'); });
    await ev(() => { const z = __wp.world.reserveZoneOfWorld(); __wp.goto(z.x + z.w / 2, z.y + z.h / 2, .6); }); await p.waitForFunction(() => __wp.idle && __wp.idle(), null, { timeout: 60000 }); await p.waitForTimeout(800);
    await ev(() => { const z = __wp.world.reserveZoneOfWorld(), A = z.levels[__lab.company.reserve.lv]; const pl = __lab.store.place('crude_tank_m', A.x + 2, A.y + 2, 0, { instant: true }); window.__pl = pl.ok ? 'ok' : pl.reason; __lab.company.sync(); const r = __lab.company.reserveBuy('CRUDE', 40000, 'A', 'CASH'); window.__buy = r.ok; window.__why = r.reason + '|' + (typeof pl !== 'undefined' ? '' : ''); __lab.company.market.tick = () => {}; __lab.company.market.price.CRUDE = 70; });
    t(W + ': reserve holds 40,000 bbl of crude', await ev(() => __buy && __lab.company.reserveStock('CRUDE') === 40000), await ev(() => [__pl, __why]));
    await ev(() => __lab.EU.open('reserve')); await p.waitForTimeout(400);
    const tabs = await ev(() => [...document.querySelectorAll('#es-body [data-act="rvsec"]')].map(x => x.textContent)); t(W + ': the reserve screen has the Arabic "تلقائي" section', tabs.includes('تلقائي'), tabs);
    t(W + ': six section buttons fit the width', await noScroll());
    await tap('#es-body [data-act="rvsec"][data-v="au"]'); let tx = await body(); await shot('1-empty');
    t(W + ': shows market price, remaining reserve, totals and the create form', /سعر السوق الآن/.test(tx) && /\$70\.00/.test(tx) && /المتبقي في الاحتياطي/.test(tx) && /40,000/.test(tx) && /إجمالي الكميات المباعة/.test(tx) && /إجمالي الإيرادات/.test(tx) && /إنشاء أمر بيع/.test(tx));
    t(W + ': no overflow in the empty state', await noScroll());
    await p.fill('#au-price', '80'); await p.fill('#au-amount', '10000'); await tap('[data-act="ausave"]'); tx = await body(); await shot('2-active');
    t(W + ': an active order is listed with target, quantity per run and state', /أمر رقم 1/.test(tx) && /فعال/.test(tx) && /\$80\.00/.test(tx) && /10,000 برميل/.test(tx) && /ينتظر السعر|لم يُفحص/.test(tx), tx.slice(0, 300));
    t(W + ': creating it did not sell anything by itself', await ev(() => __lab.company.reserveStock('CRUDE') === 40000));
    await ev(() => { __lab.company.market.price.CRUDE = 85; __lab.company.advanceHours(24); __lab.EU.open('reserve'); }); await p.waitForTimeout(300); await tap('#es-body [data-act="rvsec"][data-v="au"]'); tx = await body(); await shot('3-sold'); await ev(() => { const e = document.getElementById('es-body'); e.scrollTop = e.scrollHeight; }); await p.waitForTimeout(200); await shot('3b-order'); await ev(() => { document.getElementById('es-body').scrollTop = 0; });
    t(W + ': after a day at $85 it sold 10,000 once: stock 30,000, revenue $850,000, history row', await ev(() => __lab.company.reserveStock('CRUDE') === 30000) && /850,000|\$850\.0K|850/.test(tx) && /سجل التنفيذ/.test(tx) && /\$85\.00/.test(tx), tx.slice(0, 500));
    await tap('[data-act="autog"]'); tx = await body(); t(W + ': pause: the order shows stopped', /متوقف/.test(tx) && /▶️ استئناف/.test(tx)); await shot('4-paused');
    await ev(() => __lab.company.advanceHours(24 * 3)); t(W + ': paused order sells nothing in 3 more days', await ev(() => __lab.company.reserveStock('CRUDE') === 30000));
    await tap('[data-act="autog"]'); tx = await body(); t(W + ': resume: the order shows active again', /فعال/.test(tx) && /⏸️ إيقاف/.test(tx));
    await tap('[data-act="auedit"]'); t(W + ': edit loads the order into the form', (await ev(() => document.getElementById('au-price').value)) === '80'); await p.fill('#au-price', '90'); await tap('[data-act="ausave"]'); tx = await body(); t(W + ': saved edit shows $90.00', /\$90\.00/.test(tx));
    await tap('[data-act="aumode"][data-v="pct"]'); tx = await body(); t(W + ': the percentage mode relabels the amount field', /النسبة في كل عملية/.test(tx));
    await p.fill('#au-price', ''); await tap('[data-act="ausave"]'); t(W + ': an empty price is refused in Arabic (toast) and creates nothing', (await ev(() => __lab.company.reserveAutoList().length)) === 1);
    t(W + ': no sideways scroll with an order and history', await noScroll());
    await tap('[data-act="audel"]'); t(W + ': delete needs a second tap (still there after the first)', (await ev(() => __lab.company.reserveAutoList().length)) === 1); await tap('[data-act="audel"]'); t(W + ': second tap deletes it', (await ev(() => __lab.company.reserveAutoList().length)) === 0);
    const lg = await (async () => { await tap('#es-body [data-act="rvsec"][data-v="lg"]'); return body(); })(); t(W + ': the log shows the automatic sale row', /بيع/.test(lg) && /تلقائي/.test(lg) || /أمر بيع آلي/.test(lg), lg.slice(0, 300));
    await ctx.close();
  }
  t('no page errors', !errs.length, errs); console.log(ok + ' passed, ' + bad + ' failed'); await b.close(); srv.close(); process.exit(bad ? 1 : 0);
});
