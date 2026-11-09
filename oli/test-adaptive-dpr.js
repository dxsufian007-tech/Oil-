/* adaptive resolution: not judged while loading, and it recovers to full resolution when the map rests */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'); let ok = 0, bad = 0; const t = (n, c) => { if (c) ok++; else { bad++; console.log('FAIL', n); } };
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); }); });
srv.listen(0, async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 412, height: 866 }, deviceScaleFactor: 2 }); await ctx.addInitScript(() => { window.OLI_DEMO = true; }); const p = await ctx.newPage(); await p.goto('http://localhost:' + srv.address().port + '/');
  await p.waitForFunction(() => window.__lab && __lab.restored && __wp.idle(), null, { timeout: 120000 }); await p.waitForTimeout(11000);
  t('starts at full resolution', await p.evaluate(() => __wp.dpr()) === 2);
  await p.evaluate(() => __wp.setDpr(0.75)); await p.waitForTimeout(500); t('forced low', await p.evaluate(() => __wp.dpr()) < 1);
  await p.waitForTimeout(3500); const d1 = await p.evaluate(() => __wp.dpr()); t('recovers a step after 2.5 s of rest (' + d1 + ')', d1 > 0.9);
  await p.waitForTimeout(9000); t('back to full resolution', await p.evaluate(() => __wp.dpr()) === 2);
  await b.close(); srv.close(); console.log('ADAPTIVE DPR TESTS:', ok, 'passed,', bad, 'failed'); process.exit(bad ? 1 : 0);
});
