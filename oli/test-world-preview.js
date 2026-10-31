/* Playwright test of the world preview page (needs the playwright package). node test-world-preview.js [shotsDir] */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const shots = process.argv[2]; if (shots) fs.mkdirSync(shots, { recursive: true });
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); r.end(d); }); }).listen(0);
(async () => {
  const port = srv.address().port, b = await chromium.launch(), p = await b.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true }), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:' + port + '/'); await p.waitForFunction(() => window.__wp && window.__wp.genLeft() === 0, null, { timeout: 120000 });
  let n = 0; const ok = (c, m) => { assert(c, m); n++; }; const shot = async nm => { for (let i = 0; i < 80 && await p.evaluate(() => __wp.hiLeft()); i++) await p.waitForTimeout(150); if (shots) { await p.waitForTimeout(250); await p.screenshot({ path: path.join(shots, nm + '.png') }); } };
  ok(await p.evaluate(() => __wp.ready()) === 600, 'all 600 chunk bitmaps generated in the background');
  for (const [lv, z] of [['FAR', .0045], ['FAR', .03], ['MEDIUM', .35], ['CLOSE', 1]]) { await p.evaluate(([x, y, z]) => __wp.goto(x, y, z), [800, 800, z]); ok(await p.evaluate(() => __wp.level()) === lv, 'level ' + lv + ' at zoom ' + z); }
  // three levels via the buttons
  for (const lv of ['FAR', 'MEDIUM', 'CLOSE']) { await p.click('[data-z=' + lv + ']'); ok(await p.evaluate(() => __wp.level()) === lv, 'button ' + lv); }
  await p.evaluate(() => __wp.goto(960, 640, 0.0045)); await shot('01-far-world');
  await p.evaluate(() => __wp.goto(960, 640, 0.03)); await shot('02-far-regions');
  // medium on the starter region: fields in several discovery states
  await p.evaluate(() => { const w = __wp.world, r = w.regions.find(r => r.starter), k = w.regionSites(r.id).filter(s => w.stateOf(s.id) !== 'UNDISCOVERED'); let best = null; for (const a of k) for (const b of k) if (a !== b) { const sc = Math.hypot(a.x - b.x, a.y - b.y) - 4 * (k.filter(c => Math.hypot(c.x - (a.x + b.x) / 2, c.y - (a.y + b.y) / 2) < 60).length); if (!best || sc < best.sc) best = { sc, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; } __wp.goto(best.x, best.y, 0.2); }); await shot('03-medium-starter-region');
  // close on a drillable field, then inspect it by tapping
  const f = await p.evaluate(() => { const w = __wp.world, s = w.regionSites(__wp.world.regions.find(r => r.starter).id).filter(s => w.stateOf(s.id) === 'DRILLABLE')[0]; return { x: s.x, y: s.y, id: s.id }; });
  await p.evaluate(f => __wp.goto(f.x, f.y, 0.7), f); await p.waitForTimeout(100);
  await p.evaluate(f => { const sx = __wp.sx(f.x, f.y), sy = __wp.sy(f.x, f.y); __wp.tap(sx, sy); }, f);
  ok(await p.evaluate(() => __wp.ui.sel) === f.id, 'tapping a field selects it'); ok(/DRILLABLE/.test(await p.textContent('#info')) && /drilling estimate/.test(await p.textContent('#info')), 'info shows depth and the estimate'); await shot('04-close-field-selected');
  // an undiscovered field is invisible to the player and visible in the developer view
  const hid = await p.evaluate(() => { const w = __wp.world, s = w.allSites().find(s => s.kind === 'FIELD' && w.stateOf(s.id) === 'UNDISCOVERED'); return { x: s.x, y: s.y, id: s.id }; });
  await p.evaluate(h => __wp.goto(h.x, h.y, 0.5), hid); await p.evaluate(h => __wp.tap(__wp.sx(h.x, h.y), __wp.sy(h.x, h.y)), hid); ok(await p.evaluate(() => __wp.ui.sel) === null, 'undiscovered site cannot be selected by the player');
  await p.click('#tDev'); await p.evaluate(h => __wp.tap(__wp.sx(h.x, h.y), __wp.sy(h.x, h.y)), hid); ok(await p.evaluate(() => __wp.ui.sel) === hid.id, 'developer view can'); await shot('05-dev-geology'); await p.click('#tDev');
  // building probe: footprint to scale, refused on water
  const wt = await p.evaluate(() => { const w = __wp.world; for (let y = 0; y < 300; y++) for (let x = 0; x < 300; x++) if (w.tile(x, y).terrain === 'WATER_WADI') return { x, y }; });
  await p.evaluate(t => __wp.goto(t.x, t.y, 0.9), wt); await p.selectOption('#fac', 'tank'); await p.evaluate(t => __wp.tap(__wp.sx(t.x, t.y), __wp.sy(t.x, t.y)), wt); ok(/cannot build: water/.test(await p.textContent('#info')), 'water refuses a tank'); await shot('06-build-probe-water');
  await p.evaluate(() => { __wp.ui.heat = true; __wp.goto(960, 640, 0.05); }); await shot('07-oil-odds-dev'); await p.evaluate(() => { __wp.ui.heat = false; });
  await p.click('#tScale'); ok(await p.evaluate(() => __wp.ui.scale), 'scale chart on'); await p.evaluate(() => __wp.draw()); await shot('08-scale-chart'); await p.click('#tScale');
  const prod = await p.evaluate(() => __wp.world.allSites().filter(s => __wp.world.stateOf(s.id) === 'PRODUCING').length); ok(prod >= 2, 'producing fields exist in the demo state: ' + prod);
  await p.evaluate(() => { const w = __wp.world, s = w.allSites().find(s => w.stateOf(s.id) === 'PRODUCING'); __wp.goto(s.x, s.y, 0.7); }); await shot('09-producing-field');
  // pan + pinch-like zoom never throws and the frame stays cheap
  const ms = await p.evaluate(() => { __wp.goto(800, 800, 0.35); const t = performance.now(); for (let i = 0; i < 30; i++) { __wp.cam.x += 3; __wp.draw(); } const m = (performance.now() - t) / 30; __wp.goto(800, 800, 1); const t2 = performance.now(); for (let i = 0; i < 30; i++) { __wp.cam.x += 1; __wp.draw(); } const c = (performance.now() - t2) / 30; __wp.goto(960, 640, 0.0045); const t3 = performance.now(); for (let i = 0; i < 30; i++) __wp.draw(); return { medium: m, close: c, far: (performance.now() - t3) / 30 }; });
  console.log('draw ms per frame (desktop Chromium, software canvas):', JSON.stringify(ms)); ok(ms.medium < 40 && ms.close < 40 && ms.far < 40, 'frames stay cheap');
  const hiMs = await p.evaluate(() => ({ built: __wp.stats.hiBuilt, last: __wp.stats.lastHiMs })); console.log('detail images built', hiMs.built, 'last one', hiMs.last.toFixed(0), 'ms'); ok(hiMs.built > 0 && hiMs.last < 250, 'close-up images are built one at a time and each is quick');
  ok(errs.length === 0, 'no console errors: ' + errs.join('|')); console.log('WORLD PREVIEW TESTS PASSED (' + n + ' checks)'); await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
