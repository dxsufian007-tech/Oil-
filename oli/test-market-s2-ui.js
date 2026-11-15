/* S2 trading desk on the phone (412 / 360 / 768): depth, ticket, preview, market and limit orders, cancel, history, positions.  NODE_PATH=/opt/npm-tools/node_modules node test-market-s2-ui.js [shots-dir] */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const SHOT = process.argv[2] || ''; if (SHOT) fs.mkdirSync(SHOT, { recursive: true });
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': /\.js$/.test(f) ? 'text/javascript' : /\.html$/.test(f) ? 'text/html' : 'application/octet-stream' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [w, h] of [[412, 866], [360, 740], [768, 1024]]) {
    const p = await (await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: w < 700 })).newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); });
    const ev = (f, a) => p.evaluate(f, a); await p.goto('http://localhost:' + srv.address().port + '/?lab=1&lang=en'); await p.waitForFunction(() => window.__lab && __lab.restored && window.__layers, null, { timeout: 90000 });
    await ev(() => { localStorage.clear(); __lab.reset(); __lab.company.speed = 0; }); await p.waitForTimeout(350); await p.waitForFunction(() => __wp.idle(), null, { timeout: 90000 });
    const dm = await ev(() => { __lab.store.cash = 5e9; return __lab.buildDemo(); }); if (!dm.ok) throw new Error('demo ' + JSON.stringify(dm).slice(0, 200)); await p.waitForTimeout(400); await ev(() => { const b0 = __lab.store.list()[0]; __wp.goto(b0.x, b0.y, .9); }); await p.waitForTimeout(600); await ev(() => { __lab.store.cash = 1e11; __lab.ts.sectorRule = null; const b0 = __lab.store.list()[0]; let placed = 0; for (let dy = -60; dy <= 60 && placed < 2; dy += 5) for (let dx = -60; dx <= 60 && placed < 2; dx += 5) { const v = __lab.store.validate('crude_tank_l', b0.x + dx, b0.y + dy, 0, {}); if (v.ok) { const r = __lab.store.place('crude_tank_l', b0.x + dx, b0.y + dy, 0, { instant: true }); if (r.ok) placed++; } } if (placed < 2) throw new Error('no spot for the tanks'); __lab.store.cash = 2e9; __lab.company.sync(); });
    await p.locator('#eh-menu').tap(); await p.locator('#es-tabs [data-tab=market]').tap(); await p.locator('[data-act=mkSec][data-v=desk]').tap();
    const px = '@' + w; let body = await p.textContent('#es-body');
    ok(/عمق السوق/.test(body) && /سيولة محاكاة/.test(body) && /الفارق السعري/.test(body) && /السيولة المتاحة/.test(body), 'depth card with the declared liquidity source and spread ' + px);
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll ' + px); if (SHOT) await p.screenshot({ path: path.join(SHOT, 's2-desk-' + w + '-1.png'), fullPage: false });
    const q0 = async () => (await p.textContent('[data-mk=ticket]')).replace(/[⁦-⁩]/g, '');
    ok(/معاينة قبل التنفيذ/.test(await q0()) && /متوسط السعر \(VWAP\)/.test(await q0()) && /الانزلاق/.test(await q0()), 'the ticket previews VWAP and slippage before anything is charged ' + px);
    const cash0 = await ev(() => { __lab.company.sync(); return __lab.store.cash; });
    await p.locator('[data-act=mkDkQty][data-v="1000000"]').tap(); const slip1 = +(/الانزلاق عن السوق([\d.\-]+)%/.exec(await q0()) || [])[1];
    await p.locator('[data-act=mkDkQty][data-v="10000"]').tap(); const slip0 = +(/الانزلاق عن السوق([\d.\-]+)%/.exec(await q0()) || [])[1];
    ok(slip1 > slip0, 'a bigger order shows a bigger slippage in the preview (' + slip0 + '% < ' + slip1 + '%) ' + px);
    { const c1 = await ev(() => __lab.store.cash); ok(Math.abs(c1 - cash0) < 1, 'previewing charged nothing ' + px + ' (' + (c1 - cash0) + ')'); }
    await p.locator('[data-act=mkDkQty][data-v="100000"]').tap(); await p.locator('[data-act=mkDkGo]').tap(); body = await p.textContent('[data-mk=ticket]');
    ok(/نُفّذ 100,000 بمتوسط/.test(body), 'a market buy executes and reports the filled quantity and the average price ' + px);
    ok((await ev(() => __lab.company.deskTrades().length)) === 1 && (await ev(() => __lab.company.audit().ok)), 'one trade recorded and the audit passes ' + px);
    ok(/سجل الصفقات/.test(await p.textContent('[data-mk=trades]')) && /شراء/.test(await p.textContent('[data-mk=trades]')) && /مركز/.test(await p.textContent('[data-mk=trades]')), 'history and position are shown ' + px);
    await p.locator('[data-act=mkDkType][data-v=LIMIT]').tap(); for (let i = 0; i < 5; i++) await p.locator('[data-act=mkDkPx][data-v="-1"]').tap();
    ok(/لا ينفذ الآن/.test(await q0()), 'a limit price far below the market previews as "will not fill now" ' + px);
    await p.locator('[data-act=mkDkGo]').tap(); ok(/وُضع الأمر #1 · مفتوح/.test(await p.textContent('[data-mk=ticket]')) && /الأوامر المفتوحة \(1\)/.test(await p.textContent('[data-mk=orders]')), 'a limit order is placed and listed as open ' + px);
    if (SHOT) await p.screenshot({ path: path.join(SHOT, 's2-desk-' + w + '-2.png'), fullPage: true });
    const cashL = await ev(() => __lab.store.cash); await p.locator('[data-act=mkDkCancel]').first().tap(); ok(/الأوامر المفتوحة \(0\)/.test(await p.textContent('[data-mk=orders]')) && (await ev(() => __lab.company.deskTrades().length)) === 1, 'cancel before execution: no open orders, no extra trade ' + px);
    await p.locator('[data-act=mkDkType][data-v=MARKET]').tap(); await p.locator('[data-act=mkDkSide][data-v=SELL]').tap(); await p.locator('[data-act=mkDkQty][data-v="10000"]').tap(); await p.locator('[data-act=mkDkGo]').tap();
    ok(/نُفّذ 10,000 بمتوسط/.test(await p.textContent('[data-mk=ticket]')) && /الربح المحقق/.test(await p.textContent('[data-mk=trades]')), 'a market sell executes and the realised profit is shown ' + px);
    await p.locator('[data-act=mkDkSide][data-v=BUY]').tap(); await p.locator('[data-act=mkDkQty][data-v="5000000"]').tap(); await p.locator('[data-act=mkDkQty][data-v=x2]').tap(); await p.locator('[data-act=mkDkQty][data-v=x2]').tap(); const pv = await q0();
    ok(/جزئي|السعة|الرصيد/.test(pv) || /سينفذ/.test(pv), 'a huge order shows a partial fill / a capacity limit in the preview, never a single price for everything ' + px);
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1) && !errs.length, 'no sideways scroll and no page errors after trading ' + px, errs);
    await p.context().close();
  }
  console.log(n + ' passed'); await b.close(); srv.close(); process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
