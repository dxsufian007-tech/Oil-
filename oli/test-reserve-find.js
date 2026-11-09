// Finding the reserve zone: a marker at far zoom, and the "show on the map" button.   NODE_PATH=/opt/npm-tools/node_modules node test-reserve-find.js [shots-dir]
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const shots = process.argv[2] && path.resolve(process.argv[2]); if (shots) fs.mkdirSync(shots, { recursive: true });
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 412, height: 866 }, hasTouch: true, isMobile: true }), p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:' + srv.address().port + '/'); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 }); await p.evaluate(() => { localStorage.clear(); __lab.reset(); });
  const z = await p.evaluate(() => { const z = __wp.world.reserveZoneOfWorld(); return { x: z.x, y: z.y, w: z.w, h: z.h }; });
  await p.evaluate(() => { __wp.setLevel && __wp.setLevel('FAR'); }); await p.waitForTimeout(800);
  if (shots) await p.screenshot({ path: path.join(shots, 'far.png') });
  await p.evaluate(() => __lab.EU.open('reserve')); await p.waitForTimeout(300);
  ok(await p.locator('[data-act=rvgo]').count() === 1, 'the reserve screen has a "show on the map" button');
  await p.locator('[data-act=rvgo]').first().tap(); await p.waitForTimeout(900);
  const view = await p.evaluate(() => { const c = __wp.centre ? __wp.centre() : null; return { open: document.getElementById('eco-sheet').classList.contains('open'), c }; });
  ok(!view.open, 'the screen closes');
  const near = await p.evaluate(zz => { const t = __wp.toTile(206, 433); return { x: t.x, y: t.y }; }, z);
  ok(Math.abs(near.x - (z.x + z.w / 2)) < z.w && Math.abs(near.y - (z.y + z.h / 2)) < z.h, 'the map now looks at the zone: centre tile ' + Math.round(near.x) + ',' + Math.round(near.y) + ' vs zone ' + (z.x + z.w / 2) + ',' + (z.y + z.h / 2));
  if (shots) await p.screenshot({ path: path.join(shots, 'zone.png') });
  ok(!errs.length, 'no page errors: ' + errs.join('|')); console.log('RESERVE FIND TESTS PASSED (' + n + ' checks)'); await b.close(); srv.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
