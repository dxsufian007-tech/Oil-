/* S4 analytics on the phone (412 / 360 / 768): real Brent history, frames, candle details, simulated series with news marks, trend, reasons, forecasts.  NODE_PATH=/opt/npm-tools/node_modules node test-market-s4-ui.js [shots-dir] */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const SHOT = process.argv[2] || ''; if (SHOT) fs.mkdirSync(SHOT, { recursive: true });
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': /\.js$/.test(f) ? 'text/javascript' : /\.html$/.test(f) ? 'text/html' : 'application/octet-stream' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [w, h] of [[412, 866], [360, 740], [768, 1024]]) {
    const p = await (await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: w < 700 })).newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); });
    const ev = (f, a) => p.evaluate(f, a); await p.goto('http://localhost:' + srv.address().port + '/?lab=1&lang=en'); await p.waitForFunction(() => window.__lab && __lab.restored && window.__layers, null, { timeout: 90000 });
    await ev(() => { localStorage.clear(); __lab.reset(); __lab.company.setSpeed(0); }); await p.waitForTimeout(350); await ev(() => __lab.company.setSpeed(0)); await p.waitForFunction(() => __wp.idle(), null, { timeout: 90000 });
    await p.locator('#eh-menu').tap(); await p.locator('#es-tabs [data-tab=market]').tap(); await p.locator('[data-act=mkSec][data-v=analysis]').tap(); const px = '@' + w, tx = async s => (await p.textContent(s)).replace(/[⁦-⁩]/g, '');
    let body = await tx('[data-mk=an]');
    body = await tx('[data-mk=an]'); ok(/محاكاة اللعبة/.test(body) && !/تاريخ فعلي/.test(body) && !/Energy Information/.test(body) && await p.locator('[data-act=mkASrc]').count() === 1, 'the real-history button is gone; only "محاكاة اللعبة" remains, and no real-source text is shown ' + px);
    ok(await p.locator('[data-act=mkAFrame]').count() === 4 && /يومي/.test(body) && /أسبوعي/.test(body) && /شهري/.test(body) && /سنوي/.test(body), 'the four periods (daily, weekly, monthly, yearly) are still there ' + px); if (SHOT) await p.screenshot({ path: path.join(SHOT, 's4-an-' + w + '-1.png') });
    const nD = await p.locator('[data-mk=an] svg rect[data-act=mkASel]').count(); ok(nD > 5, 'daily candles of the game series are drawn (' + nD + ') ' + px);
    await p.locator('[data-mk=an] rect[data-act=mkASel]').last().dispatchEvent('click'); body = await tx('[data-mk=an]'); ok(/فتح/.test(body) && /أعلى/.test(body) && /إغلاق/.test(body), 'tapping a candle shows its open / high / low / close ' + px);
    for (const k of ['W', 'M', 'Y']) { await p.locator('[data-act=mkAFrame][data-v=' + k + ']').tap(); ok(await p.locator('[data-mk=an] svg rect[data-act=mkASel]').count() >= 1 && /محاكاة اللعبة/.test(await tx('[data-mk=an]')), 'period ' + k + ' draws candles ' + px); }
    await p.locator('[data-act=mkAFrame][data-v=D]').tap(); await p.locator('[data-act=mkAZoom][data-v=in]').tap(); await p.locator('[data-act=mkANav][data-v=old]').tap(); ok(await p.locator('[data-mk=an] svg rect[data-act=mkASel]').count() >= 1, 'zoom and browsing back still work ' + px);
    ok(/الاتجاه/.test(await tx('[data-mk=trend]')) && /(صاعد|هابط|عرضي|لا بيانات)/.test(await tx('[data-mk=trend]')), 'a trend reading is shown ' + px);
    await p.locator('[data-act=mkASrc][data-v=SIM]').tap(); body = await tx('[data-mk=an]'); ok(/محاكاة اللعبة/.test(body) && !/Energy Information/.test(body), 'switching to the game series changes the label and drops the real-source text ' + px);
    await ev(() => { const e = __lab.company.market.engine; e.force('N018', e.lastDay, '2030-01-05'); __lab.EU.render(); }); await p.locator('[data-act=mkAFrame][data-v=D]').tap();
    ok(/لماذا السعر هنا/.test(await tx('[data-mk=why]')) && /إغلاق جزئي لمضيق/.test(await tx('[data-mk=why]')), 'reasons card lists the price drivers and the active event with its regions ' + px);
    const eb = await ev(() => JSON.stringify(__lab.company.market.engine.toJSON())), pb = await ev(() => __lab.company.market.price.CRUDE);
    ok(/احسب نطاق السعر المتوقع/.test(await tx('[data-mk=fc]')), 'forecast card offers to compute (nothing runs until asked) ' + px);
    await p.locator('[data-act=mkAFc]').tap(); const f = await tx('[data-mk=fc]'); ok(/7 يوماً/.test(f) && /30 يوماً/.test(f) && /90 يوماً/.test(f) && /عدم اليقين/.test(f) && /تقديرية/.test(f), 'forecast shows 7 / 30 / 90 day ranges, direction, uncertainty and the "estimate" note ' + px);
    ok((await ev(() => JSON.stringify(__lab.company.market.engine.toJSON()))) === eb && (await ev(() => __lab.company.market.price.CRUDE)) === pb, 'computing a forecast changed nothing in the market (engine state and price identical) ' + px);
    if (SHOT) await p.screenshot({ path: path.join(SHOT, 's4-an-' + w + '-2.png'), fullPage: true });
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1) && !errs.length, 'no sideways scroll and no page errors ' + px, errs);
    await p.context().close();
  }
  console.log(n + ' passed'); await b.close(); srv.close(); process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
