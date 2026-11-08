'use strict';
/* EMULATED Android profile (NOT a real device): mobile viewport 412x915 @2 DPR + touch (isMobile emulation is avoided: in headless software rendering it adds a large artificial cost), CPU throttled via CDP. Runs the in-page benchmark (the "الأداء" tab).
   node perf-android-emu.js <html> <out.json>   (software-rendered headless Chromium: the numbers are pessimistic for GPU and optimistic for nothing) */
const { chromium } = require('playwright'), fs = require('fs');
const [, , file, outF] = process.argv;
(async () => {
  const b = await chromium.launch({ args: ['--enable-precise-memory-info'] }), R = { note: 'EMULATED mobile profile, headless software rendering. Real Android numbers must come from the in-page benchmark on the phone.', runs: {} };
  for (const rate of [1, 4, 6]) {
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, hasTouch: true }), p = await ctx.newPage(), c = await ctx.newCDPSession(p);
    await c.send('Emulation.setCPUThrottlingRate', { rate });
    await p.goto('file://' + file); await p.waitForFunction(() => window.__proto && __proto.ready(), null, { timeout: 280000 });
    R.runs['cpu_x' + rate] = await p.evaluate(() => __proto.bench(null, { scale: 1 }));
    await ctx.close();
  }
  await b.close(); fs.writeFileSync(outF, JSON.stringify(R, null, 1));
  for (const [k, r] of Object.entries(R.runs)) console.log(k, JSON.stringify(r.summary), 'heap', r.heap_start_mb, '→', r.heap_end_mb, 'cache', r.cache_blocks, r.cache_mb_estimate + 'MB');
})().catch(e => { console.error(e); process.exit(1) });
