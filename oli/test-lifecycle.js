/* Android lifecycle: rotate the screen, go to the background and come back (also after a long absence), close and reopen: no errors, nothing lost */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'); let ok = 0, bad = 0; const t = (n, c) => { if (c) ok++; else { bad++; console.log('FAIL', n); } };
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); }); });
srv.listen(0, async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 412, height: 866 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }); await ctx.addInitScript(() => { window.OLI_DEMO = true; });
  const url = 'http://localhost:' + srv.address().port + '/', errs = []; let p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(url);
  await p.waitForFunction(() => window.__lab && __lab.restored && __wp.idle(), null, { timeout: 120000 });
  // a small game
  const st0 = await p.evaluate(() => { const L = __lab; L.reset(); L.company.setSpeed(1); L.store.cash = 5e7; const f = L.fieldSites()[0]; __wp.goto(f.x, f.y, .6); return { f: [Math.round(f.x), Math.round(f.y)] }; });
  await p.waitForFunction(([x, y]) => __lab.store.validate('crude_tank_l', x, y, 0, { ignoreCash: true }).reason !== 'notLoaded', st0.f, { timeout: 60000 });
  const made = await p.evaluate(([cx, cy]) => { const L = __lab, st = L.store; let n = 0; for (let k = 0; k < 400 && n < 3; k++) { const x = cx - 40 + (k % 20) * 4, y = cy - 30 + Math.floor(k / 20) * 5; if (st.validate('crude_tank_s', x, y, 0, { ignoreCash: true }).ok && st.place('crude_tank_s', x, y, 0, { instant: true, ignoreCash: true }).ok) n++; } L.save(); return n; }, st0.f);
  t('built a few buildings', made === 3);
  // 1) rotation
  await p.setViewportSize({ width: 866, height: 412 }); await p.waitForTimeout(800);
  t('landscape: canvas follows the window', await p.evaluate(() => { const c = document.getElementById('c'); return c.width === Math.round(innerWidth * __wp.dpr()) && innerWidth > innerHeight; }));
  const d0 = await p.evaluate(() => __wp.stats.draws); await p.evaluate(() => __wp.markDirty()); await p.waitForTimeout(500); t('landscape: still drawing', await p.evaluate(() => __wp.stats.draws) > d0);
  await p.setViewportSize({ width: 412, height: 866 }); await p.waitForTimeout(800); t('back to portrait', await p.evaluate(() => innerHeight > innerWidth && document.getElementById('c').height === Math.round(innerHeight * __wp.dpr())));
  // 2) background and back, a short while (nothing to report)
  const h0 = await p.evaluate(() => __lab.company.hours);
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  const saved1 = await p.evaluate(() => localStorage.getItem('oli-lab-v2') && localStorage.getItem('oli-lab-v2').length); t('hidden: the game saved itself', saved1 > 200);
  await p.waitForTimeout(1500); await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }); await p.waitForTimeout(800);
  t('short background: game keeps running', await p.evaluate(() => __lab.company.hours) >= h0);
  // 3) a long absence while in the background: the catch-up runs in slices, with the progress box, then reports
  await p.evaluate(() => { __lab.company.setSpeed(1); __lab.save(); window.__realNow = Date.now.bind(Date); });
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); const D = window.__realNow; Date.now = () => D() + 6 * 3600e3; });
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  const sawBox = await p.evaluate(() => { const bx = document.getElementById('cu-box'); return !!bx; }); t('long absence: progress box shown', sawBox);
  await p.waitForFunction(() => { const bx = document.getElementById('cu-box'); return bx && bx.style.display === 'none'; }, null, { timeout: 60000 }); t('long absence: finished', true);
  t('long absence: time advanced', await p.evaluate(() => __lab.company.hours) > h0 + 20);
  t('long absence: report available', await p.evaluate(() => !!(__lab.company.away && __lab.company.away.ok)));
  // 4) close and reopen: the same game comes back
  const before = await p.evaluate(() => ({ b: __lab.store.list().length, cash: Math.round(__lab.store.cash) }));
  await p.evaluate(() => { __lab.save(); }); await p.close(); p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(url); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 120000 });
  await p.waitForFunction(() => { const bx = document.getElementById('cu-box'); return !bx || bx.style.display === 'none'; }, null, { timeout: 60000 });
  const after = await p.evaluate(() => ({ b: __lab.store.list().length })); t('reopen: same buildings', after.b === before.b);
  t('no page errors during the whole run', errs.length === 0); if (errs.length) console.log(errs.slice(0, 3));
  await b.close(); srv.close(); console.log('LIFECYCLE TESTS:', ok, 'passed,', bad, 'failed'); process.exit(bad ? 1 : 0);
});
