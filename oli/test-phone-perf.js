/* Stage 8, the game on a phone-class device: a big company on the real page, the eight map layers, x10 time, memory and long tasks, with a Pixel 7 profile, touch and a 4x slower CPU.
 * This is an EMULATED phone in headless Chromium: it is NOT a real device test.   NODE_PATH=/opt/npm-tools/node_modules node test-phone-perf.js [shotsDir] */
const { chromium, devices } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const shots = process.argv[2] && path.resolve(process.argv[2]); if (shots) fs.mkdirSync(shots, { recursive: true });
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext(Object.assign({}, devices['Pixel 7'])), p = await ctx.newPage(), errs = [], cdp = await ctx.newCDPSession(p);
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); });
  const ev = (f, a) => p.evaluate(f, a), shot = async nm => { if (shots) await p.screenshot({ path: path.join(shots, nm + '.png') }); };
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); await cdp.send('Performance.enable');
  const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); const m = (await cdp.send('Performance.getMetrics')).metrics; return m.find(x => x.name === 'JSHeapUsedSize').value / 1048576; };
  await p.goto('http://localhost:' + srv.address().port + '/?lab=1&lang=en'); await p.waitForFunction(() => window.__lab && __lab.restored && window.__layers, null, { timeout: 120000 });
  await ev(() => { localStorage.clear(); __lab.reset(); __lab.store.cash = 5e10; __lab.updateCash(); __lab.company.setSpeed(0); }); await p.waitForTimeout(400); await p.waitForFunction(() => __wp.idle(), null, { timeout: 120000 });
  const demo = await ev(async () => await __lab.buildDemo()); ok(demo.ok, 'the demo oil chain is built on the real page (' + demo.total + ' buildings)');
  await ev(() => { __lab.store.cash = 5e10; __lab.company.sync(); __lab.updateCash(); });
  // a big company: more than 250 buildings, placed in clusters around the field and the refinery
  const kinds = ['crude_tank_m', 'pump_station_s', 'junction', 'crude_tank_l', 'pump_station_l', 'valve'];
  const centre = await ev(() => { const s = __wp.world.regionSites(__wp.world.regions.find(r => r.starter).id)[0]; return { x: s.x, y: s.y }; });
  const reg = await ev(() => { const r = __wp.world.regions.find(r => r.starter); return { x0: r.x0, y0: r.y0, w: r.w, h: r.h }; });
  let placed = 0; for (let c = 0; c < 14 && placed < 260; c++) { const cx = reg.x0 + 30 + (c * 97) % (reg.w - 60), cy = reg.y0 + 30 + (c * 61) % (reg.h - 60); await ev(o => __wp.goto(o.x, o.y, 0.45), { x: cx, y: cy }); await p.waitForFunction(() => __wp.idle(), null, { timeout: 120000 }); await p.waitForTimeout(250);
    for (let att = 0; att < 4; att++) { await p.waitForTimeout(500 + att * 700); const k = await ev(o => { let k = 0, seed = o.cx * 7919 + o.cy; const L = __lab, kinds = o.kinds; for (let i = 0; i < 500 && k < 30; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; const x = o.cx + (seed % 100) - 50; seed = (seed * 1103515245 + 12345) & 0x7fffffff; const y = o.cy + (seed % 100) - 50, d = kinds[i % kinds.length], sn = L.store.snap(d, x, y, 0, { radius: 8, ignoreCash: true }); if (sn && L.store.place(d, sn.x, sn.y, sn.r, { instant: true }).ok) k++; } return k; }, { cx, cy, kinds }); placed += k; if (k >= 15) break; } }
  const total = await ev(() => __lab.store.list().length); ok(total >= 250, 'a big company is on the map: ' + total + ' buildings, ' + (await ev(() => __lab.pipes.lines.size)) + ' pipelines');
  await ev(() => { for (const b of __lab.store.list()) __lab.sim.ensure(b); });
  // drawing cost on a slowed-down phone CPU, at three zoom levels, plain and with all eight layers on
  const dense = await ev(() => { const L = __lab.store.list(); let best = null, bn = -1; for (const b of L) { let k = 0; for (const o of L) if (Math.abs(o.x - b.x) < 30 && Math.abs(o.y - b.y) < 30) k++; if (k > bn) { bn = k; best = { x: b.x, y: b.y, n: k }; } } return best; });
  const inView = async z => await ev(o => { const vb = __wp.view ? __wp.view() : null; return o; }, { z }); void inView;
  console.log('  densest spot: ' + dense.n + ' buildings within 30 tiles');
  const drawMs = async (z, label) => { await ev(o => __wp.goto(o.x, o.y, o.z), { x: dense.x, y: dense.y, z }); await p.waitForFunction(() => __wp.idle(), null, { timeout: 120000 }); await p.waitForTimeout(300); return await ev(() => { const t0 = performance.now(); for (let i = 0; i < 20; i++) { __wp.markDirty && __wp.markDirty(); __wp.draw(); } return (performance.now() - t0) / 20; }); };
  const plain = {}; for (const [z, nm] of [[0.15, 'far'], [0.45, 'mid'], [1.0, 'near']]) plain[nm] = await drawMs(z, nm);
  await ev(() => { for (const id of ['TERRAIN', 'INFRA', 'GEOLOGY', 'EXPLORATION', 'FIELDS', 'PRODUCTION', 'PIPELINES', 'LAND']) __layers.layers.on.add(id); __layers.layers.on.size; }); ok(await ev(() => __layers.layers.on.size) === 8, 'all eight map layers are on at once');
  const withL = {}; for (const [z, nm] of [[0.15, 'far'], [0.45, 'mid'], [1.0, 'near']]) withL[nm] = await drawMs(z, nm); await shot('01-eight-layers');
  console.log('  draw ms per frame at 4x slower CPU: plain ' + JSON.stringify(Object.fromEntries(Object.entries(plain).map(([k, v]) => [k, Math.round(v)]))) + ', eight layers ' + JSON.stringify(Object.fromEntries(Object.entries(withL).map(([k, v]) => [k, Math.round(v)]))));
  ok(Math.max(...Object.values(plain)) < 150, 'drawing the big company is under 150 ms a frame even on a 4x slower CPU (worst ' + Math.round(Math.max(...Object.values(plain))) + ' ms)');
  ok(Math.max(...Object.values(withL)) < 250, 'with all eight layers on it stays under 250 ms a frame (worst ' + Math.round(Math.max(...Object.values(withL))) + ' ms)');
  // x10 for a while: time must advance, the page must not freeze, memory must not climb
  const mem0 = await heap(); await ev(() => { window.__long = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long.push(e.duration); }).observe({ entryTypes: ['longtask'] }); } catch (_) { } });
  const h0 = await ev(() => __lab.company.hours); await ev(() => { __lab.company.setSpeed(10); __lab.EU.hud(); }); await p.waitForTimeout(12000); const h1 = await ev(() => __lab.company.hours);
  const lt = await ev(() => window.__long || []); const maxLT = lt.length ? Math.max(...lt) : 0;
  ok(h1 - h0 > 20, 'at x10 on the slow phone profile the game advanced ' + Math.round(h1 - h0) + ' game hours in 12 s (the page did not freeze)');
  ok(maxLT < 2500, 'longest blocking task ' + Math.round(maxLT) + ' ms (' + lt.length + ' long tasks in 12 s); budget 2500 ms');
  await ev(() => { __lab.company.setSpeed(0); }); const frozen = await ev(() => __lab.company.hours); await p.waitForTimeout(1500); ok((await ev(() => __lab.company.hours)) === frozen, 'pause stops the clock on the phone profile too');
  // toggle the layers in a loop with real taps on the menu, then check memory
  await p.locator('#lyBtn').tap(); for (let r = 0; r < 3; r++) for (const id of ['TERRAIN', 'GEOLOGY', 'PIPELINES', 'PRODUCTION']) { await p.locator('#lyPanel [data-ly=' + id + ']').tap(); } await p.locator('#lyBtn').tap(); await shot('02-after-taps');
  await ev(() => { __lab.company.setSpeed(10); }); await p.waitForTimeout(8000); await ev(() => { __lab.company.setSpeed(0); __lab.save(); }); const mem1 = await heap();
  ok(mem1 - mem0 < 60, 'memory: ' + mem0.toFixed(1) + ' MB before, ' + mem1.toFixed(1) + ' MB after 20 s at x10 and 12 layer toggles (growth under 60 MB)');
  const sz = await ev(() => localStorage.getItem('oli-lab-v2').length); ok(sz < 4.5 * 1048576, 'the save of this company is ' + (sz / 1048576).toFixed(2) + ' MB (the browser limit is about 5 MB)');
  ok(await ev(() => __lab.company.audit().ok), 'the books audit passes after the whole run');
  // reload: everything comes back
  const before = await ev(() => ({ n: __lab.store.list().length, h: __lab.company.hours, lines: __lab.pipes.lines.size })); await p.reload(); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 120000 }); await p.waitForTimeout(600);
  const after = await ev(() => ({ n: __lab.store.list().length, h: __lab.company.hours, lines: __lab.pipes.lines.size }));
  ok(after.n === before.n && after.lines === before.lines && Math.abs(after.h - before.h) < 1e-9, 'after a reload every building, every pipeline and the clock are back (' + after.n + ' buildings)');
  ok(errs.length === 0, 'no page errors during the whole run: ' + errs.join(' | ')); console.log('PASS ' + n); await b.close(); srv.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
