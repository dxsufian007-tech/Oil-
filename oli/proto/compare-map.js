'use strict';
/* Screenshots + performance of the CURRENT map (world-preview.html, the game's map engine) and the NEW prototype, same views.
   node compare-map.js <outdir>      needs Playwright; run it alone (timings are only meaningful on a quiet machine). */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const OUT = process.argv[2] || path.join(os.tmpdir(), 'cmp'); fs.mkdirSync(OUT, { recursive: true });
const root = path.join(__dirname, '..'), srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(root, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); }); });
const src = fs.readFileSync(path.join(__dirname, 'map-v2-prototype.html'), 'utf8'), pf = path.join(OUT, 'proto.html');
fs.writeFileSync(pf, '<!doctype html><html lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + src + '</body></html>');
const heap = async (cdp) => { const m = (await cdp.send('Performance.getMetrics')).metrics; const g = n => (m.find(x => x.name === n) || {}).value || 0; return { jsHeapMB: +(g('JSHeapUsedSize') / 1048576).toFixed(1), nodes: g('Nodes') }; };
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const b = await chromium.launch({ args: ['--enable-precise-memory-info'] }), res = { env: os.cpus()[0].model + ' x' + os.cpus().length, node: process.version, maps: {} };
  const W = 1100, H = 700;
  /* views are given in tiles of each map's own coordinates; C3 is at 640,640 in both; same zoom numbers */
  const VIEWS = [['1_overview', 'FIT'], ['2_regions', .035], ['3_medium', .3], ['4_close', 1]];
  for (const which of ['current', 'new']) {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 }), p = await ctx.newPage(), cdp = await ctx.newCDPSession(p); await cdp.send('Performance.enable'); const errs = []; p.on('pageerror', e => errs.push(String(e)));
    const t0 = Date.now(); const m = res.maps[which] = { views: {} };
    if (which === 'current') { await p.goto('http://localhost:' + port + '/?lab=1&lang=en'); await p.waitForFunction(() => window.__wp && window.__wp.genLeft() === 0, null, { timeout: 180000 }); m.loadMs = Date.now() - t0; }
    else { await p.goto('file://' + pf); await p.waitForFunction(() => window.__proto && window.__proto.stats.genMs > 0); m.loadMs = Date.now() - t0; await p.evaluate(() => document.getElementById('fold').click()); }
    m.heapAfterLoad = await heap(cdp);
    for (const [name, z] of VIEWS) {
      const cx = which === 'current' ? 960 : 1150, cy = which === 'current' ? 640 : 800;
      await p.evaluate(([w, cx, cy, z]) => { if (w === 'current') { const k = z === 'FIT' ? 0.0105 : z; __wp.goto(z === 'FIT' ? 960 : 800, z === 'FIT' ? 640 : 800, k); } else { __proto.goto(z === 'FIT' ? cx : 800, z === 'FIT' ? cy : 800, z === 'FIT' ? __proto.fit() : z, 0); } }, [which, cx, cy, z]);
      const w0 = Date.now(); if (which === 'current') await p.waitForFunction(() => window.__wp.idle() && window.__wp.hiLeft() === 0, null, { timeout: 60000 }).catch(() => { }); else await p.waitForFunction(() => window.__proto.missing() === 0, null, { timeout: 60000 }).then(() => p.waitForTimeout(200)); m.views[name] = { settleMs: Date.now() - w0 };
      /* frame cost: 40 forced redraws, mean ms */
      const fr = await p.evaluate(async (w) => { for (let i = 0; i < 8; i++) { if (w === 'new') __proto.drawNow(); else { __wp.markDirty(); __wp.draw(); } await new Promise(r => setTimeout(r, 120)); } const t = []; for (let i = 0; i < 40; i++) { const a = performance.now(); if (w === 'current') { __wp.markDirty(); __wp.draw(); } else { __proto.drawNow(); } document.getElementById('c').getContext('2d').getImageData(0, 0, 1, 1);   /* forces the raster, so the time is the real paint cost */ t.push(performance.now() - a); await new Promise(r => setTimeout(r, 5)); } t.sort((a, b) => a - b); return { median: +t[20].toFixed(2), mean: +(t.reduce((s, x) => s + x, 0) / t.length).toFixed(2), p95: +t[Math.floor(t.length * .95)].toFixed(2), max: +t[39].toFixed(2) }; }, which);
      m.views[name].frameMs = fr; m.views[name].heap = await heap(cdp);
      await p.screenshot({ path: path.join(OUT, which + '_' + name + '.png') });
    }
    if (which === 'new') m.chunk = await p.evaluate(() => ({ overviewMs: Math.round(__proto.stats.genMs), chunks: __proto.stats.chunks, msPerChunk: +(__proto.stats.chunkMs / Math.max(1, __proto.stats.chunks)).toFixed(1), cachedChunks: __proto.cacheSize(), cacheMB: +(__proto.cacheSize() * 128 * 2 * 128 * 2 * 4 / 1048576).toFixed(1) }));
    else m.chunk = await p.evaluate(() => ({ imgs: __wp.stats.imgs, regions: __wp.stats.regions, firstDrawMs: __wp.stats.firstDrawMs }));
    m.errors = errs; await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, 'perf.json'), JSON.stringify(res, null, 2)); console.log(JSON.stringify(res, null, 2)); await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
