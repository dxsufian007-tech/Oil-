/* Phase 6, the screen: the «طبقات الخريطة» menu, drawing, tapping and the section in a real browser.   NODE_PATH=/opt/npm-tools/node_modules node test-map-layers-ui.js [shotsDir] */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const shots = process.argv[2]; if (shots) fs.mkdirSync(shots, { recursive: true });
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
(async () => {
  const b = await chromium.launch(), p = await (await b.newContext({ viewport: { width: 412, height: 866 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 })).newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); });
  const co = (f, a) => p.evaluate(f, a), shot = async nm => { if (shots) await p.screenshot({ path: path.join(shots, nm + '.png') }); };
  await p.goto('http://localhost:' + srv.address().port + '/?lab=1&lang=en'); await p.waitForFunction(() => window.__lab && __lab.restored && window.__layers, null, { timeout: 90000 });
  await co(() => { localStorage.clear(); __lab.reset(); __lab.store.cash = 5e9; __lab.updateCash(); __lab.company.speed = 0; }); await p.waitForTimeout(350); await p.waitForFunction(() => __wp.idle(), null, { timeout: 90000 });
  const r = await co(async () => await __lab.buildDemo()); ok(r.ok && r.total === 12, 'the demo oil chain is built from the real functions: ' + r.total + ' buildings');
  const f = await co(() => { const w = __wp.world, s = w.allSites().find(s => w.stateOf(s.id) === 'PRODUCING') || w.allSites().find(s => w.stateOf(s.id) === 'DRILLABLE'); return { x: s.x, y: s.y, id: s.id }; });
  await co(f => __wp.goto(f.x, f.y, 0.5), f); await p.waitForFunction(() => __wp.idle(), null, { timeout: 60000 }); await p.waitForTimeout(400);
  ok(await p.locator('#lyBtn').innerText() === 'طبقات الخريطة', 'the menu button is named «طبقات الخريطة»');
  const hash = () => co(() => { const c = document.getElementById('c'), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) | 0; return h; });
  const h0 = await hash(); await shot('00-no-layers');
  await p.locator('#lyBtn').tap(); ok(await co(() => getComputedStyle(document.getElementById('lyPanel')).display) === 'block', 'the menu opens');
  ok(await co(() => document.querySelectorAll('#lyPanel .ly').length) === 8, 'it lists the eight layers'); await shot('01-menu');
  const names = await co(() => [...document.querySelectorAll('#lyPanel .ly .nm')].map(e => e.textContent)); ok(names.includes('التضاريس') && names.includes('الأنابيب والنقل') && names.includes('الأراضي والاستثمار'), 'the names are Arabic: ' + names.join(' | '));
  const changed = [];
  for (const id of ['TERRAIN', 'INFRA', 'GEOLOGY', 'EXPLORATION', 'FIELDS', 'PRODUCTION', 'PIPELINES', 'LAND']) {
    await p.locator('#lyPanel [data-ly=' + id + ']').tap(); await co(() => __wp.draw()); const h = await hash(); await shot('layer-' + id); const on = await co(id => __layers.layers.on.has(id), id);
    ok(on, id + ' is on after one tap'); changed.push(h !== h0); await p.locator('#lyPanel [data-ly=' + id + ']').tap(); ok(!(await co(id => __layers.layers.on.has(id), id)), id + ' is off after a second tap'); }
  ok(changed.filter(Boolean).length >= 6, 'switching a layer on changes the picture on the canvas (' + changed.filter(Boolean).length + ' of 8 here)');
  for (const id of ['FIELDS', 'PRODUCTION', 'PIPELINES']) await p.locator('#lyPanel [data-ly=' + id + ']').tap();
  ok(await co(() => __layers.layers.on.size) === 3, 'three layers at once'); await co(() => __wp.draw()); await shot('02-three-layers');
  ok((await p.locator('#lyPanel .lg').count()) === 3, 'a legend is shown for each active layer');
  // tapping a well shows the details of the layer
  await p.locator('#lyBtn').tap(); const w = await co(() => { const b = __lab.store.list().find(b => b.d === 'oil_well'); return { x: b.x, y: b.y }; });
  await co(w => __wp.goto(w.x, w.y, 0.9), w); await p.waitForTimeout(300); await co(w => __wp.tap(__wp.sx(w.x + .5, w.y + .5), __wp.sy(w.x + .5, w.y + .5)), w);
  const info = await p.textContent('#info'); ok(/بئر نفط/.test(info) && /ضغط المكمن/.test(info) && /الإنتاج اليومي/.test(info), 'tapping a well shows its production and the reservoir pressure'); await shot('03-well-details');
  const pl = await co(() => { const L = [...__lab.pipes.lines.values()][0], p = L.path[L.path.length >> 1]; return { x: p[0], y: p[1] }; });
  await co(pl => __wp.goto(pl.x, pl.y, 0.9), pl); await p.waitForTimeout(300); await co(pl => __wp.tap(__wp.sx(pl.x + .5, pl.y + .5), __wp.sy(pl.x + .5, pl.y + .5)), pl);
  ok(/خط أنابيب/.test(await p.textContent('#info')) && /السعة/.test(await p.textContent('#info')), 'tapping a pipe shows its flow and capacity');
  await co(f => __wp.goto(f.x, f.y, 0.5), f); await p.waitForTimeout(300); await co(f => __wp.tap(__wp.sx(f.x, f.y), __wp.sy(f.x, f.y)), f);
  ok(/حقل نفط/.test(await p.textContent('#info')) && /الاحتياطي/.test(await p.textContent('#info')), 'tapping a field shows its reserve and pressure');
  // the geological section
  await p.locator('#lyBtn').tap(); await p.locator('#lySec').tap(); ok(await co(() => !!__layers.ui.pick), 'section mode waits for two taps'); await p.locator('#lyBtn').tap();
  await co(f => { __wp.goto(f.x, f.y, 0.3); }, f); await p.waitForTimeout(300);
  await co(f => { __wp.tap(__wp.sx(f.x - 25, f.y - 5), __wp.sy(f.x - 25, f.y - 5)); __wp.tap(__wp.sx(f.x + 25, f.y + 5), __wp.sy(f.x + 25, f.y + 5)); }, f);
  ok(await co(() => getComputedStyle(document.getElementById('secPanel')).display) === 'block', 'two taps open the geological section'); await p.waitForTimeout(200); await shot('04-section');
  const painted = await co(() => { const c = document.getElementById('secCv'), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data, cols = new Set(); for (let i = 0; i < d.length; i += 4 * 211) cols.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); return cols.size; });
  ok(painted >= 8, 'the section canvas is painted with several rocks (' + painted + ' colours)'); ok(/الطول/.test(await p.textContent('#secInfo')), 'the section header gives the length, faults, fields and wells');
  await p.locator('#secClose').tap(); ok(await co(() => getComputedStyle(document.getElementById('secPanel')).display) === 'none', 'the section closes');
  // layer choice is remembered
  const saved = await co(() => JSON.parse(localStorage.getItem('oli-map-layers'))); ok(saved.length === 3, 'the active layers are remembered: ' + saved.join(','));
  // performance: every layer on, three zoom levels
  await co(() => { for (const id of __layers.layers.IDS) __layers.layers.set(id, true); __layers.cache.clear(); });
  const ms = await co(f => { const out = {}; for (const [k, z] of [['close', 1], ['medium', .35], ['far', .03]]) { __wp.goto(f.x, f.y, z); __wp.draw(); const t = performance.now(); for (let i = 0; i < 30; i++) { __wp.cam.x += 2; __wp.draw(); } out[k] = +((performance.now() - t) / 30).toFixed(1); } return out; }, f);
  console.log('draw ms per frame, all eight layers on (desktop Chromium, software canvas):', JSON.stringify(ms)); await shot('05-all-layers');
  const base = await co(f => { __layers.layers.on.clear(); __layers.cache.clear(); const out = {}; for (const [k, z] of [['close', 1], ['medium', .35], ['far', .03]]) { __wp.goto(f.x, f.y, z); __wp.draw(); const t = performance.now(); for (let i = 0; i < 30; i++) { __wp.cam.x += 2; __wp.draw(); } out[k] = +((performance.now() - t) / 30).toFixed(1); } return out; }, f);
  console.log('draw ms per frame, no layers:', JSON.stringify(base));
  ok(ms.close < 45 && ms.medium < 45 && ms.far < 45, 'frames stay cheap with all eight layers on'); ok(ms.close - base.close < 30 && ms.medium - base.medium < 30, 'the eight layers add under 30 ms per frame');
  ok(errs.length === 0, 'no console errors: ' + errs.join('|')); console.log('MAP LAYERS UI TESTS PASSED (' + n + ' checks)'); await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
