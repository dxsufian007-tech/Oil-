/* The oil market screen (Brent | products) and the player's map-layers button, in a real browser.   NODE_PATH=/opt/npm-tools/node_modules node test-market-ui.js */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
(async () => {
  const b = await chromium.launch(), p = await (await b.newContext({ viewport: { width: 412, height: 866 }, hasTouch: true, isMobile: true })).newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); });
  const ev = (f, a) => p.evaluate(f, a), port = srv.address().port;
  await p.goto('http://localhost:' + port + '/?lab=1&lang=en'); await p.waitForFunction(() => window.__lab && __lab.restored && window.__layers, null, { timeout: 90000 });
  await ev(() => { localStorage.clear(); __lab.reset(); __lab.company.speed = 0; }); await p.waitForTimeout(350); await p.waitForFunction(() => __wp.idle(), null, { timeout: 90000 });
  await p.locator('#eh-menu').tap(); await p.locator('#es-tabs [data-tab=market]').tap();
  let body = await p.textContent('#es-body'); const px0 = await ev(() => __lab.company.market.price.CRUDE);
  ok(await p.locator('[data-mk=sec] button').count() === 2 && /سوق خام برنت/.test(body) && /سوق المنتجات النفطية/.test(body), 'the market screen offers two markets: Brent crude and oil products');
  ok(body.includes('$' + px0.toFixed(2)) && /خام برنت/.test(await p.textContent('[data-mk=price]')), 'the price card shows the name and the price used for trading ($' + px0.toFixed(2) + ')');
  ok(/\+|-/.test(await p.textContent('[data-mk=price]')) && /%/.test(await p.textContent('[data-mk=price]')), 'the price card shows the daily change, the percent change and the direction');
  ok(await p.locator('[data-mk=chart] svg[data-mk-chart]').count() === 1 && await p.locator('[data-mk-chart] rect[data-act=mkSel]').count() > 10, 'a large candlestick chart of the game\'s own price is shown');
  const nCandles = async () => p.locator('[data-mk-chart] rect[data-act=mkSel]').count(); const nd = await nCandles();
  for (const [fr, lab] of [['W', 'أسبوعي'], ['M', 'شهري'], ['Y', 'سنوي'], ['D', 'يومي']]) { await p.locator('[data-act=mkFrame][data-v=' + fr + ']').tap(); ok((await p.textContent('[data-mk=chart]')).includes(lab), 'the chart can show ' + lab + ' candles (' + await nCandles() + ')'); }
  await p.locator('[data-act=mkNav][data-v=old]').tap(); await p.locator('[data-act=mkNav][data-v=old]').tap(); const dets = await p.textContent('[data-mk=chart]'); ok(await nCandles() > 5, 'previous prices can be browsed (back)'); await p.locator('[data-act=mkNav][data-v=new]').tap();
  await p.locator('[data-act=mkSel]').nth(3).dispatchEvent('click'); ok(/فتح.*أعلى.*أدنى.*إغلاق/.test(await p.textContent('[data-mk=chart]')), 'tapping a candle shows its open / high / low / close');
  const items = await p.locator('[data-mk=news] > div').count(); ok(items <= 5, 'the news card shows only the last few items (' + (items - 1) + ') with an option for the full log');
  await ev(() => { __lab.company.market.engine.force('N018', __lab.company.market.engine.lastDay, 'x'); __lab.EU.render(); }); body = await p.textContent('[data-mk=news]'); ok(/إغلاق جزئي لمضيق/.test(body) && /▲/.test(body) && /نشط/.test(body) && /التأثير/.test(body), 'a news item shows a short title, a description, the effect, an arrow and its status');
  const px1 = await ev(() => __lab.company.market.price.CRUDE);
  ok(await p.locator('[data-mk=ind] > div > div').count() === 3 && /العرض/.test(await p.textContent('[data-mk=ind]')) && /الطلب/.test(await p.textContent('[data-mk=ind]')) && /المخزون العالمي/.test(await p.textContent('[data-mk=ind]')) && /(منخفض|طبيعي|مرتفع)/.test(await p.textContent('[data-mk=ind]')), 'three simple indicators: supply, demand, global stock (low / normal / high)');
  ok(await p.locator('[data-mk=trade] button').count() === 3 && /شراء النفط/.test(await p.textContent('[data-mk=trade]')) && /بيع النفط/.test(await p.textContent('[data-mk=trade]')) && /التخزين/.test(await p.textContent('[data-mk=trade]')), 'three trade buttons: buy oil, sell oil, storage');
  await p.locator('[data-act=mkLog]').tap(); ok(/إخفاء السجل/.test(await p.textContent('[data-mk=news]')), 'the full news log opens'); await p.locator('[data-act=mkLog]').tap();
  ok((await p.textContent('[data-mk=more]')).length < 60, 'the advanced details are hidden at first'); await p.locator('[data-act=mkMore]').tap(); body = await p.textContent('[data-mk=more]'); ok(/أوبك\+/.test(body) && /نفط محبوس/.test(body) && /ما الذي يحدد السعر/.test(body), 'the advanced details (producers, stock, hoarding, price drivers) are in a sub-section'); await p.locator('[data-act=mkMore]').tap();
  const fits = async () => ev(() => { const b = document.getElementById('es-body'); return b.scrollWidth <= b.clientWidth + 1; }); ok(await fits(), 'no horizontal scroll on a 412 px phone (Brent)');
  const txt = (await p.textContent('#es-body')).replace(/[$0-9.,%+\-–:\/() ]/g, ''); ok(!/[A-Za-z]{2,}/.test(txt), 'no Latin words on the market screen: ' + (txt.match(/[A-Za-z]{2,}/g) || []).slice(0, 5));
  // products market
  await p.locator('[data-act=mkSec][data-v=products]').tap(); const rows = await p.locator('[data-mk=plist] [data-act=mkProd]').count(); ok(rows === 5, 'the products market lists 5 products');
  const prices = await ev(() => [...document.querySelectorAll('[data-mk=plist] [data-act=mkProd] span[dir=ltr] > b')].map(e => +e.textContent.replace('$', ''))); ok(prices.every((v, i) => !i || prices[i - 1] >= v), 'products are ordered by price: ' + prices.join(' > '));
  ok(/(▲|▼|●)/.test(await p.textContent('[data-mk=plist]')) && /خبر/.test(await p.textContent('[data-mk=plist]')), 'each product shows its price, its trend and the news that moves it');
  await p.locator('[data-act=mkProd][data-v=JET_FUEL]').tap(); ok(/وقود الطائرات/.test(await p.textContent('[data-mk=price]')) && await p.locator('[data-mk=chart] svg').count() === 1, 'tapping a product opens its price card and candles'); const jp = await ev(() => __lab.company.market.price.JET_FUEL); ok((await p.textContent('[data-mk=price]')).includes('$' + jp.toFixed(2)), 'the product price shown is the trading price ($' + jp.toFixed(2) + ')');
  ok(await p.locator('[data-mk=pcost]').count() === 1 && /هامش فوق الخام/.test(await p.textContent('[data-mk=pcost]')), 'the product shows its margin over crude and its own stock'); ok(await fits(), 'no horizontal scroll (products)');
  await p.locator('[data-act=mkGo][data-v="sell:JET_FUEL"]').tap(); ok((await ev(() => __lab.EU.state().tab)) === 'sell', 'the product sell button opens the sell screen'); await p.locator('#es-tabs [data-tab=market]').tap();
  await p.locator('[data-act=mkSec][data-v=brent]').tap(); await p.locator('[data-act=mkGo][data-v=buy]').tap(); ok((await ev(() => __lab.EU.state().tab)) === 'storage', 'the buy button opens the oil trading screen'); await p.locator('#es-tabs [data-tab=market]').tap();
  // the chart follows the central clock
  const d0 = await ev(() => __lab.company.market.engine.lastDay); await ev(() => { __lab.company.advanceHours(24 * 40); __lab.EU.render(); }); const d1 = await ev(() => __lab.company.market.engine.lastDay); ok(d1 - d0 === 40, 'after 40 game days the engine moved exactly 40 days (' + d0 + ' -> ' + d1 + ')');
  const pxN = await ev(() => __lab.company.market.price.CRUDE); body = await p.textContent('[data-mk=price]'); ok(body.includes(pxN.toFixed(2)), 'the displayed price equals the market price used by the economy ($' + pxN.toFixed(2) + ')');
  const lastC = await ev(() => { const g = __lab.company.market.gc.CRUDE; return g[g.length - 1].c; }); ok(lastC === pxN, 'the last candle closes at the traded price');
  await p.locator('#es-tabs [data-tab=sell]').tap(); await p.locator('[data-act=sellp][data-p=CRUDE]').tap(); await p.waitForTimeout(200); body = await p.textContent('#es-body'); ok(body.includes((await ev(() => __lab.company.market.price.CRUDE)).toFixed(2)), 'the Sell screen shows the same crude price');
  await ev(() => { __lab.company.pause(); }); const h0 = await ev(() => __lab.company.market.hour); await p.waitForTimeout(700); ok((await ev(() => __lab.company.market.hour)) === h0, 'paused: the market does not move');
  ok(errs.length === 0, 'no page errors: ' + errs.join(' | '));
  // the player's game (no developer bar): the map layers button is visible and opens the menu
  const q = await (await b.newContext({ viewport: { width: 412, height: 800 }, hasTouch: true, isMobile: true })).newPage(); const e2 = []; q.on('pageerror', e => e2.push(e.message));
  await q.addInitScript(() => { window.OLI_DEMO = true; }); await q.goto('http://localhost:' + port + '/?lang=en'); await q.waitForFunction(() => window.__lab && document.getElementById('lyFab'), null, { timeout: 90000 }); await q.waitForTimeout(2500);
  ok(await q.locator('#lyFab').isVisible(), 'the map layers button is visible in the player game'); await q.locator('#lyFab').tap(); await q.waitForTimeout(400);
  ok(await q.locator('#lyPanel').isVisible() && await q.locator('#lyPanel .ly').count() === 8, 'it opens the layers menu with the 8 layers'); await q.locator('#lyPanel .ly').nth(5).tap(); await q.waitForTimeout(300);
  ok(await q.evaluate(() => document.querySelectorAll('#lyPanel .ly.on').length) === 1, 'a layer can be switched on from the player game'); ok(e2.length === 0, 'no page errors in the player game: ' + e2.join('|'));
  console.log('PASS ' + n); await b.close(); srv.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
