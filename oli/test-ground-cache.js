/* Oli - test-ground-cache.js  (the still-map ground cache: the picture is identical, it is used only while the camera rests, the simulation never invalidates it, anything else does)
 *   node test-ground-cache.js
 */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.webp') ? 'image/webp' : 'text/html' }); r.end(d); }); });
srv.listen(0, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 412, height: 866 }, deviceScaleFactor: 2, hasTouch: true }), errs = []; p.on('pageerror', e => errs.push(e.message));
  let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('ok ' + m); };
  try {
    await p.goto('http://localhost:' + srv.address().port + '/?unlock=all'); await p.waitForFunction(() => window.__lab && __lab.restored && __wp.idle(), null, { timeout: 120000 });
    await p.evaluate(() => { __lab.company.speed = 0; const f = (__lab.fieldSites && __lab.fieldSites()[0]) || null; __wp.goto(__wp.cam.x, __wp.cam.y, .7); });
    for (let i = 0; i < 80 && await p.evaluate(() => __wp.hiLeft()); i++) await p.waitForTimeout(150);
    await p.waitForTimeout(800);
    const r = await p.evaluate(async () => {
      const raf = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res))), cv = document.getElementById('c'), S = __wp.stats;
      __wp.markDirty(); await raf(); __wp.markDirty('sim'); await raf();                         // two frames at rest: the ground is stored
      const stores = S.groundStores, h0 = S.groundHits; __wp.markDirty('sim'); await raf(); const hit = S.groundHits > h0, A = cv.toDataURL();
      window.OLI_NOGROUNDCACHE = true; __wp.markDirty('sim'); await raf(); const B = cv.toDataURL(); window.OLI_NOGROUNDCACHE = false;
      const h1 = S.groundHits; __wp.markDirty(); await raf(); const afterGeneric = S.groundHits === h1;      // a non-simulation change (input, image, toggle) redraws the ground
      const h2 = S.groundHits; __wp.goto(__wp.cam.x + 3, __wp.cam.y, __wp.cam.z); await raf(); const afterMove = S.groundHits === h2;   // the camera moved: never the cached ground
      return { stores, hit, same: A === B, len: A.length, afterGeneric, afterMove };
    });
    ok(r.stores >= 1, 'the ground picture is kept once the camera rests (' + r.stores + ')');
    ok(r.hit, 'a redraw caused by the simulation copies the kept ground');
    ok(r.same && r.len > 1000, 'the picture drawn from the kept ground is identical, pixel for pixel, to a full redraw');
    ok(r.afterGeneric, 'any other change (input / image / toggle) draws the ground again');
    ok(r.afterMove, 'a moved camera never uses the kept ground');
    const sim = await p.evaluate(async () => { const co = __lab.company, h0 = co.hours; co.speed = 10; await new Promise(r => setTimeout(r, 3000)); co.speed = 0; return { hours: co.hours - h0, f: __wp.frames() }; });
    ok(sim.hours > 0 && sim.f > 0, 'the simulation still runs with the frame gate (' + sim.hours + ' game hours in 3 s at x10)');
    ok(!errs.length, 'no page errors ' + errs.join(' | '));
    console.log('PASS ' + n + ' checks');
  } catch (e) { console.log('FAIL', e.message, errs.join(' | ')); process.exitCode = 1; }
  await b.close(); srv.close();
});
