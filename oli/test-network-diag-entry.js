/* NETWORK DIAGNOSTICS: the player's way in, in the NORMAL game (no lab flag, dev toolbar hidden): Company tab -> «فاحص الشبكة».   NODE_PATH=/opt/npm-tools/node_modules node test-network-diag-entry.js */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
(async () => {
  const b = await chromium.launch(), p = await (await b.newContext({ viewport: { width: 412, height: 866 }, hasTouch: true, isMobile: true })).newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); const ev = (f, a) => p.evaluate(f, a), port = srv.address().port;
  await p.goto('http://localhost:' + port + '/?lang=en'); await p.waitForFunction(() => window.__lab && __lab.restored && window.__netdiag, null, { timeout: 90000 });
  await p.waitForTimeout(1500); if (await ev(() => !!window.__homeOpen)) { await p.locator('#h-cont').tap(); await p.waitForFunction(() => !window.__homeOpen, null, { timeout: 15000 }); }
  await ev(() => { __lab.company.speed = 0; });
  ok(await ev(() => getComputedStyle(document.getElementById('ndBtn')).display === 'none' || document.getElementById('ndBtn').getBoundingClientRect().width === 0), 'the dev toolbar button is hidden in the normal game (so the Company tab entry is the way in)');
  await p.locator('#eh-menu').tap(); await p.waitForSelector('#eco-sheet.open'); await p.locator('#es-tabs [data-tab=company]').tap(); await p.waitForSelector('#es-netdiag', { timeout: 10000 });
  ok(await p.locator('#es-netdiag').isVisible(), 'the Company tab offers «فاحص الشبكة»');
  await p.locator('#es-netdiag').tap(); await p.waitForSelector('#ndPanel .nd-sum', { timeout: 20000 });
  ok(await ev(() => !document.querySelector('#eco-sheet.open') && getComputedStyle(document.getElementById('ndPanel')).display === 'block'), 'tapping it closes the sheet, opens the panel and scans');
  ok(/سلامة الشبكة/.test(await p.textContent('#ndPanel')) && /العناصر المفحوصة/.test(await p.textContent('#ndPanel')), 'the panel shows the scan summary');
  await p.locator('#ndPanel [data-nd=close]').tap(); ok(await ev(() => getComputedStyle(document.getElementById('ndPanel')).display === 'none'), 'the panel closes');
  ok(!errs.length, 'no page errors: ' + errs.join(' | ')); console.log('PASS ' + n); await b.close(); srv.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
