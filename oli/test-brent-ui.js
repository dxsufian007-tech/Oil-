/* The Brent candlestick screen (Market tab) and the player's map-layers button, in a real browser.   NODE_PATH=/opt/npm-tools/node_modules node test-brent-ui.js */
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
  let body = await p.textContent('#es-body');
  ok(await p.locator('[data-brent=main] svg[data-brent-chart]').count() === 1, 'the Market tab shows the candlestick chart for crude');
  ok(/2000-01-04/.test(body) && /الدورة 1/.test(body) && /\$23\.95/.test(body), 'it shows the market date (2000-01-04), the cycle and the price used in trading ($23.95)');
  ok(/غير متوفر في المصدر الرسمي/.test(body), 'volume is shown as not available in the source (not invented)');
  const gameDate = await ev(() => __lab.company.clock().text.slice(0, 10)); ok(body.includes(gameDate), 'the game date is shown next to the market date: ' + gameDate);
  for (const [fr, lab] of [['W', 'أسبوعي'], ['M', 'شهري'], ['Y', 'سنوي'], ['D', 'يومي']]) { await p.locator('[data-act=bframe][data-v=' + fr + ']').tap(); body = await p.textContent('[data-brent=main]'); ok(body.includes(lab + ' ·'), 'frame ' + lab + ' selected'); }
  await p.locator('[data-act=bmode][data-v=browse]').tap(); await p.locator('[data-act=bframe][data-v=Y]').tap();
  const n0 = await p.locator('[data-brent-chart] rect[data-act=bsel]').count(); ok(n0 === 27, 'browsing the whole record: 27 yearly candles (2000-2026), got ' + n0);
  await p.locator('[data-act=bsel][data-v="2008"]').first().dispatchEvent('click'); body = await p.textContent('[data-brent=detail]'); ok(/143\.95/.test(body) && /33\.73/.test(body), 'tapping the 2008 candle shows High 143.95 and Low 33.73');
  await p.locator('[data-act=bframe][data-v=M]').tap(); await p.locator('[data-act=byear][data-v="2020"]').tap(); const m20 = await p.locator('[data-brent-chart] rect[data-act=bsel]').count(); ok(m20 === 12, 'year chip 2020 in monthly view: 12 monthly candles');
  if (process.env.SHOT) { await p.locator('[data-act=bmode][data-v=browse]').tap(); await ev(() => document.querySelector('[data-brent-chart]').scrollIntoView({ block: 'center' })); await p.waitForTimeout(300); await p.screenshot({ path: process.env.SHOT }); await p.locator('[data-act=byear][data-v="2020"]').tap(); }
  await p.locator('[data-act=bsel][data-v="2020-04"]').first().dispatchEvent('click'); body = await p.textContent('[data-brent=detail]'); ok(/2020-04/.test(body) && /الأدنى/.test(body), 'the April 2020 candle opens its details');
  await p.locator('[data-act=bnav][data-v=prev]').tap(); ok(await p.locator('[data-brent-chart] rect[data-act=bsel]').count() > 0, 'navigation back works');
  await p.locator('[data-act="bcmp+"][data-v=a]').tap(); body = await p.textContent('[data-brent=compare]'); ok(/2009/.test(body) && /2020/.test(body) && /التغير/.test(body), 'the comparison panel moves a period (2009 vs 2020) and lists change / high / low / average');
  // the chart follows the central clock
  await ev(() => { __lab.company.advanceHours(24 * 40); }); await p.locator('[data-act=bmode][data-v=live]').tap(); body = await p.textContent('[data-brent=main]');
  const bd = await ev(() => __lab.company.market.brent); ok(body.includes(bd.date) && bd.pos === 39, 'after 40 game days the chart shows market day ' + bd.date);
  ok(await ev(() => __lab.company.market.price.CRUDE) === bd.ref && body.includes(bd.ref.toFixed(2)), 'the displayed price equals the market price used by the economy');
  // the sell screen shows the same number
  await p.locator('#es-tabs [data-tab=sell]').tap(); body = await p.textContent('#es-body'); ok(body.includes(bd.ref.toFixed(2)), 'the Sell screen shows the same crude price');
  ok(errs.length === 0, 'no page errors: ' + errs.join(' | '));
  // the player's game (no developer bar): the map layers button is visible and opens the menu
  const q = await (await b.newContext({ viewport: { width: 412, height: 800 }, hasTouch: true, isMobile: true })).newPage(); const e2 = []; q.on('pageerror', e => e2.push(e.message));
  await q.addInitScript(() => { window.OLI_DEMO = true; }); await q.goto('http://localhost:' + port + '/?lang=en'); await q.waitForFunction(() => window.__lab && document.getElementById('lyFab'), null, { timeout: 90000 }); await q.waitForTimeout(2500);
  ok(await q.locator('#lyFab').isVisible(), 'the map layers button is visible in the player game'); await q.locator('#lyFab').tap(); await q.waitForTimeout(400);
  ok(await q.locator('#lyPanel').isVisible() && await q.locator('#lyPanel .ly').count() === 8, 'it opens the layers menu with the 8 layers'); await q.locator('#lyPanel .ly').nth(5).tap(); await q.waitForTimeout(300);
  ok(await q.evaluate(() => document.querySelectorAll('#lyPanel .ly.on').length) === 1, 'a layer can be switched on from the player game'); ok(e2.length === 0, 'no page errors in the player game: ' + e2.join('|'));
  console.log('PASS ' + n); await b.close(); srv.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
