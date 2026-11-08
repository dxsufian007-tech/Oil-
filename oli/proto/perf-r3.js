'use strict';
/* Performance before/after for the map prototype (desktop headless Chromium with software rendering: NOT a substitute for an Android test).
   node perf-r3.js <before.html> <after.html> [out.json]
   Measures: time to a usable first view, per-frame draw cost at four zoom levels (median of 40 forced frames), and smoothness of a real-time zoom animation from the full
   view down to the close view starting with an empty block cache (frame gaps and long tasks), plus JS heap. */
const { chromium } = require('playwright'), fs = require('fs');
const [, , beforeF, afterF, outF] = process.argv;
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }, pq = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))] };
async function run(file) {
  const b = await chromium.launch({ args: ['--enable-precise-memory-info'] }), page = await b.newPage({ viewport: { width: 1100, height: 700 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => { window.__lt = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push(e.duration) }).observe({ entryTypes: ['longtask'] }) } catch (e) { } });
  const t0 = Date.now(); await page.goto('file://' + file);
  await page.waitForFunction(() => window.__proto && (window.__proto.ready ? window.__proto.ready() : true), null, { timeout: 120000 }); await page.evaluate(() => document.getElementById('fold').click());
  await page.waitForFunction(() => window.__proto.frames.n > 0); const ready = Date.now() - t0;
  const out = { ready_ms: ready, frames: {} };
  const settle = async () => { await page.waitForFunction(() => __proto.missing() === 0, null, { timeout: 180000 }); await page.waitForTimeout(250) };
  /* A. smoothness first, from a cold cache */
  await page.evaluate(() => { __proto.goto(1150, 800, __proto.fit(), 0) }); await page.waitForTimeout(500);
  const anim = await page.evaluate(() => new Promise(res => { window.__lt.length = 0; const gaps = []; let last = performance.now(); const start = last; __proto.goto(1180, 560, 1.0, 2500);
    (function f(now) { const t = performance.now(); gaps.push(t - last); last = t; if (t - start < 3400) requestAnimationFrame(f); else res({ gaps, lt: window.__lt.slice() }) })(performance.now()) }));
  out.zoom_anim = { frames: anim.gaps.length, max_gap_ms: Math.max(...anim.gaps), p95_gap_ms: pq(anim.gaps, .95), over_50ms: anim.gaps.filter(g => g > 50).length, over_100ms: anim.gaps.filter(g => g > 100).length, longtasks: anim.lt.length, longest_task_ms: anim.lt.length ? Math.max(...anim.lt) : 0 };
  await settle();
  /* B. pan at the medium zoom with a partly cold cache */
  const pan = await page.evaluate(() => new Promise(res => { window.__lt.length = 0; const gaps = []; let last = performance.now(), i = 0; const start = last; __proto.goto(1000, 300, .4, 0);
    (function f() { const t = performance.now(); gaps.push(t - last); last = t; i++; __proto.cam.x += 3.2; __proto.cam.y += 2.4; __proto.draw(); if (t - start < 3000) requestAnimationFrame(f); else res({ gaps, lt: window.__lt.slice() }) })() }));
  out.pan = { frames: pan.gaps.length, max_gap_ms: Math.max(...pan.gaps), p95_gap_ms: pq(pan.gaps, .95), over_50ms: pan.gaps.filter(g => g > 50).length, longtasks: pan.lt.length, longest_task_ms: pan.lt.length ? Math.max(...pan.lt) : 0 };
  await settle();
  /* C. steady draw cost, forced frames */
  const scenes = { 'نظرة كاملة': [1150, 800, 'fit'], 'مناطق (0.12)': [1000, 700, .12], 'متوسط (0.35)': [1000, 400, .35], 'قريب (1.0)': [1180, 560, 1.0] };
  for (const [name, [x, y, z]] of Object.entries(scenes)) {
    await page.evaluate(([x, y, z]) => __proto.goto(x, y, z === 'fit' ? __proto.fit() : z, 0), [x, y, z]); await settle();
    const ms = await page.evaluate(() => { const a = []; const c = document.getElementById('c').getContext('2d'); for (let i = 0; i < 60; i++) { const t = performance.now(); __proto.drawNow(); c.getImageData(0, 0, 1, 1); a.push(performance.now() - t) } return a.slice(20) });
    out.frames[name] = { median_ms: +med(ms).toFixed(2), p95_ms: +pq(ms, .95).toFixed(2), max_ms: +Math.max(...ms).toFixed(2) };
  }
  out.heap_mb = await page.evaluate(() => performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null);
  out.stats = await page.evaluate(() => { const S = __proto.stats; return { mode: S.mode || 'main thread', overview_ms: S.genMs, chunks_made: S.chunks, chunk_ms_each: S.chunks ? S.chunkMs / S.chunks : null, cache_blocks: __proto.cacheSize() } });
  await b.close(); return out;
}
(async () => {
  const before = await run(beforeF), after = await run(afterF), R = { note: 'desktop headless Chromium, software rendering; not an Android measurement', before, after };
  if (outF) fs.writeFileSync(outF, JSON.stringify(R, null, 2)); console.log(JSON.stringify(R, null, 2));
})().catch(e => { console.error(e); process.exit(1) });
