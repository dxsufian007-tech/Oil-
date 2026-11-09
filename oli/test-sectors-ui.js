/* The real page: sector borders and names are drawn (no error at any zoom), the build bar tells the player the sector, the rule and the reason.
 *   node oli/test-sectors-ui.js   (SHOTS=dir to keep screenshots) */
const { chromium } = require('/opt/npm-tools/node_modules/playwright'), http = require('http'), fs = require('fs'), path = require('path');
const SH = process.env.SHOTS || null, DIR = path.join(__dirname, 'www');
let pass = 0, fail = 0; const ok = (c, n, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' -> ' + JSON.stringify(x))); } };
if (!fs.existsSync(path.join(DIR, 'index.html'))) { require('child_process').execSync('node build-www-map.js', { cwd: __dirname, env: Object.assign({}, process.env, { OLI_DEMO: '1' }) }); }
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(DIR, u === '/' ? 'index.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : f.endsWith('.png') ? 'image/png' : 'application/octet-stream' }); r.end(d); }); });
srv.listen(0, async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 412, height: 866 }, deviceScaleFactor: 1.5, hasTouch: true, isMobile: true }), p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errs.push(m.text()); });
  await p.addInitScript(() => { window.OLI_DEMO = true; });
  await p.goto('http://localhost:' + srv.address().port + '/?lab=1'); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 });
  await p.evaluate(() => { localStorage.clear(); __lab.reset(); __lab.company.speed = 0; __lab.store.cash = 1e10; });
  const shot = async n => { if (SH) { fs.mkdirSync(SH, { recursive: true }); await p.screenshot({ path: path.join(SH, n + '.png') }); } };
  const go = async (x, y, z, w) => { await p.evaluate(([x, y, z]) => __wp.goto(x, y, z), [x, y, z]); await p.waitForTimeout(w || 2500); };
  console.log('1. the sectors are drawn at every zoom');
  ok(await p.evaluate(() => __wp.world.sectors.length === 17), '1a the game world has the 17 sectors');
  for (const [n, x, y, z] of [['far', 960, 640, .012], ['medium', 1100, 500, .25], ['close', 1200, 700, .6]]) { await go(x, y, z, n === 'far' ? 6000 : 3000); await shot('sector-' + n); }
  ok(errs.length === 0, '1b no page error while drawing the sector layer at far / medium / close zoom', errs.slice(0, 3));
  console.log('2. the build bar: sector, perks, rule and the reason');
  const bar = async (def, x, y) => { await go(x, y, .7, 2500); await p.evaluate(d => { __lab.startBuild(d); }, def); await p.waitForTimeout(700); return p.evaluate(() => { const e = document.getElementById('buildbar'); return e ? e.innerText.replace(/\s+/g, ' ') : ''; }); };
  const a1 = await bar('refinery_s', 1200, 640); ok(/A\d/.test(a1) && /D/.test(a1) && /غير مسموح/.test(a1), '2a a refinery in the extraction sector: refused, names the sector and says it belongs in D', a1); await shot('bar-refinery-in-A'); await p.evaluate(() => __lab.cancelAll());
  const a2 = await bar('crude_tank_s', 1200, 640); ok(/قطاع A/.test(a2) && /استخراج النفط/.test(a2), '2b a small crude tank in A: the bar names sector A and shows what the sector gives', a2); await shot('bar-tank-in-A'); await p.evaluate(() => __lab.cancelAll());
  const a3 = await bar('oil_well', 150, 150); ok(/غير مسموح/.test(a3) && /A1.*A7|A1–A7|استخراج/.test(a3), '2c an oil well in a storage sector is refused and points to the A sectors', a3); await p.evaluate(() => __lab.cancelAll());
  console.log('3. what the player cannot do is not saved as a building');
  ok(await p.evaluate(() => { const L = __lab, n = L.store.list().length; const v = L.store.place('refinery_s', 1200, 640, 0, { instant: true }); return !v.ok && v.reason === 'sectorForbidden' && L.store.list().length === n; }), '3a place() refuses the same way, nothing is built');
  ok(errs.length === 0, '3b no page error', errs.slice(0, 3));
  await b.close(); srv.close(); console.log('\nSECTORS UI TESTS: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
});
