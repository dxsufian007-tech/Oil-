(function () {
  const out = document.getElementById('out'), ctl = document.getElementById('ctl'), log = s => { out.textContent += s + '\n'; };
  const B = OliBuildings, I = OliIndustry, E = OliEconomy, C = OliCentral, world = OliWorld.createWorld({ seed: 20260101 }), saveTxt = document.getElementById('save').textContent;
  const CFG = {
    'S6 (fullTankSkip=1)': { hopShare: 1, pcSparse: 1, trDefault: 0, rcvSkip: 1, hopFreezeSkip: 1, fts: 1 },
    'S6 off (fullTankSkip=0)': { hopShare: 1, pcSparse: 1, trDefault: 0, rcvSkip: 1, hopFreezeSkip: 1, fts: 0 },
    'original engine (all off)': { hopShare: 0, pcSparse: 0, trDefault: 0, rcvSkip: 0, hopFreezeSkip: 0, fts: 0 } };
  const heap = () => performance.memory ? performance.memory.usedJSHeapSize / 1048576 : NaN, sleep = ms => new Promise(r => setTimeout(r, ms));
  function boot(cfg) { // same boot as perf-scale5000/gen-scene.js boot() (the real save, read-only copy parsed from the page)
    const CN = C.CentralNet; for (const k in cfg) if (k !== 'fts') CN[k] = cfg[k]; I.Sim.fullTankSkip = cfg.fts;
    const d = JSON.parse(saveTxt), ts = B.fromWorld(world); if (d.wd) { world.restoreProgress(d.wd.p); world.restoreReserve(d.wd.r); world.restoreZones(d.wd.z); }
    const store = B.BuildingStore.fromJSON(ts, d.store, { cash: d.cash }).store; store.cash = 1e15; const net = I.PipeNet.fromJSON(ts.W, d.net), sim = new I.Sim(store, net), co = new E.Company(store, net, sim, { now: () => 1e12 }); co.fromJSON(d.eco); co.sync(); co.speed = 0;
    return { store, co };
  }
  const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }, mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  async function runAll(HRS, REPS) {
    out.textContent = ''; log('UA: ' + navigator.userAgent); log('cores: ' + navigator.hardwareConcurrency + '  deviceMemory(GB, rounded): ' + (navigator.deviceMemory || 'n/a') + '  heap API: ' + (performance.memory ? 'yes' : 'NO'));
    const names = Object.keys(CFG), res = {}; for (const n of names) res[n] = { med: [], mean: [], p95: [], max: [], min: [], heap: [], dheap: [], longest: [] }; let bld = 0;
    for (let r = 0; r < REPS; r++) for (const n of names) {
      await sleep(400); const g = boot(CFG[n]); bld = g.store.list().length; for (let h = 0; h < 6; h++) g.co.advanceHours(1); await sleep(50); const h0 = heap(), ts = [];
      for (let h = 0; h < HRS; h++) { const a = performance.now(); g.co.advanceHours(1); ts.push(performance.now() - a); }
      const x = res[n]; x.med.push(q(ts, .5)); x.mean.push(mean(ts)); x.p95.push(q(ts, .95)); x.max.push(Math.max(...ts)); x.min.push(Math.min(...ts)); x.heap.push(heap()); x.dheap.push(heap() - h0);
      log('rep ' + (r + 1) + '/' + REPS + '  ' + n + ': mean ' + mean(ts).toFixed(1) + ' ms/h  median ' + q(ts, .5).toFixed(1) + '  min ' + Math.min(...ts).toFixed(1) + '  max ' + Math.max(...ts).toFixed(1));
    }
    log('\nbuildings in save: ' + bld + '   hours/run: ' + HRS + '   reps: ' + REPS + '   (6 warm-up hours not counted; configs interleaved)\n');
    const f = a => a.map(v => v.toFixed(1)).join(' '), md = a => q(a, .5);
    for (const n of names) { const x = res[n]; log('== ' + n + '\n  median of medians ' + md(x.med).toFixed(1) + ' ms/h | mean ' + md(x.mean).toFixed(1) + ' | p95 ' + md(x.p95).toFixed(1) + ' | BEST (min) ' + Math.min(...x.min).toFixed(1) + ' | WORST (max) ' + Math.max(...x.max).toFixed(1) + '\n  per-rep medians: ' + f(x.med) + '\n  JS heap MB (median end) ' + md(x.heap).toFixed(1) + ' | growth over run ' + md(x.dheap).toFixed(2)); }
    const a = md(res[names[0]].med), b = md(res[names[1]].med), o = md(res[names[2]].med);
    log('\nS6 on vs S6 off: ' + (100 * (a / b - 1)).toFixed(1) + '%   S6 on vs original: ' + (100 * (a / o - 1)).toFixed(1) + '%');
    log('Budget per game hour (frame share 0.78): X1 780 ms, X2 390 ms, X5 156 ms. S6 median ' + a.toFixed(1) + ' ms/h -> X1 ' + (780 / a).toFixed(1) + 'x headroom, X2 ' + (390 / a).toFixed(1) + 'x, X5 ' + (156 / a).toFixed(1) + 'x.');
    log('NOTE: GC time is not exposed to a web page; only JS heap (Chrome) is reported. This is the browser, not the game WebView.');
  }
  for (const [t, h, r] of [['Quick (20h x 3)', 20, 3], ['Standard (40h x 5)', 40, 5]]) { const b = document.createElement('button'); b.textContent = t; b.onclick = () => { ctl.querySelectorAll('button').forEach(x => x.disabled = true); runAll(h, r).catch(e => log('ERROR ' + e + '\n' + (e.stack || ''))).then(() => ctl.querySelectorAll('button').forEach(x => x.disabled = false)); }; ctl.appendChild(b); }
  out.textContent = 'ready. Close other apps, plug in the charger, keep the screen on, then press a button. (X1/X2/X5 are shown as budgets, not played.)';
})();
