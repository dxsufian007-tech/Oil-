/* Oli - perf-bench-browser.js  (the real game page, phone viewport, CPU throttled like a phone)
 * Builds N buildings in production clusters joined by real pipes (wells -> junction -> pump -> crude tank -> valve -> refinery -> product tanks), on the real map with the
 * central network installed, then for every speed (x1 x2 x5 x10) and action (still / pan) measures: frames per second, frame time p50/p95/max, the share of frames over
 * 33 ms (visible stutter), the longest main-thread block, the time spent in the economy per real second, and the game hours really simulated per real second.
 *   node perf-bench-browser.js out.json [500,1000,3000,5000]     env: THR (CPU slowdown, default 4)  SECS (default 6)  SPEEDS ("1,2,5,10")  ACTS ("still,pan")
 * Building placement in the benchmark skips only terrain / sector checks (so thousands of buildings fit); occupancy and the central network are respected.
 */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const root = process.env.ROOT || __dirname, OUT = process.argv[2], NS = (process.argv[3] || '500,1000,3000,5000').split(',').map(Number), THR = +process.env.THR || 4, SECS = +process.env.SECS || 6;
const SPEEDS = (process.env.SPEEDS || '1,2,5,10').split(',').map(Number), ACTS = (process.env.ACTS || 'still,pan').split(',');
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(root, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : f.endsWith('.webp') ? 'image/webp' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream' }); r.end(d); }); });
const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; };
srv.listen(0, async () => {
  const b = await chromium.launch({ args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] }), results = [];
  for (const N of NS) {
    const ctx = await b.newContext({ viewport: { width: 412, height: 866 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }), p = await ctx.newPage(), cdp = await ctx.newCDPSession(p), errs = []; p.on('pageerror', e => errs.push(String(e)));
    await p.goto('http://localhost:' + srv.address().port + '/?unlock=all'); await p.waitForFunction(() => window.__lab && __lab.restored && __wp.idle(), null, { timeout: 120000 });
    const t0 = Date.now();
    const sc = await p.evaluate(N => {
      const L = __lab, st = L.store, I = L.I, ts = L.ts, D = L.B.DEFS; L.company.speed = 0; st.cash = 1e15; L.company.sync();
      const v0 = st.validate.bind(st), tile0 = ts.tile; ts.tile = () => ({ terrain: 'FLAT_DESERT', slope: 0 });
      st.validate = (d, x, y, r, o) => { const v = v0(d, x, y, r, o); if (v.ok || !/terrain|slope|sector|water|notLoaded|Zone|zone|field|Field|reserve|wadi|plateau/i.test(String(v.reason))) return v; return { ok: true, r: 0, cost: D[d].cost }; };
      const put = (d, x, y) => { const v = st.place(d, x, y, 0, { instant: true }); return v.ok ? v.building : null; }, conn = (a, b) => a && b ? I.layConnect(st, L.pipes, ts, a.id, b.id, { allowOneWay: true }) : null;
      const pipe = (a, ap, b, bp) => a && b ? I.layPipe(st, L.pipes, ts, { b: a.id, port: ap }, { b: b.id, port: bp }, 16) : null;
      const X0 = 420, Y0 = 260, CW = 46, CH = 30, cols = 24; let n = 0, k = 0;
      while (n < N && k < 2000) { const ox = X0 + (k % cols) * CW, oy = Y0 + Math.floor(k / cols) * CH; k++;
        const w = [0, 4, 8, 12, 16].map(d => put('oil_well', ox, oy + 2 + d)), j = put('junction', ox + 6, oy + 6), pu = put('pump_station_s', ox + 10, oy + 6), t = put('crude_tank_m', ox + 16, oy + 6), v = put('valve', ox + 23, oy + 7);
        pipe(w[0], 'OIL_OUT_E', j, 'PORT_N'); pipe(w[1], 'OIL_OUT_E', j, 'PORT_W'); pipe(w[2], 'OIL_OUT_E', j, 'PORT_S'); pipe(j, 'PORT_E', pu, 'INPUT'); pipe(pu, 'OUTPUT', t, 'INPUT_W'); pipe(w[3], 'OIL_OUT_E', t, 'INPUT_S'); pipe(w[4], 'OIL_OUT_E', t, 'INPUT_N'); conn(t, v);
        if (k % 3 === 0) { const r = put('refinery_s', ox + 27, oy + 4); conn(v, r); conn(r, put('gasoline_tank_s', ox + 37, oy + 1)); conn(r, put('diesel_tank_s', ox + 37, oy + 6)); conn(r, put('jet_tank_s', ox + 37, oy + 11)); conn(r, put('gas_sphere_s', ox + 29, oy + 14)); }
        else conn(v, put('crude_tank_m', ox + 27, oy + 6));
        n = st.items.size; }
      st.validate = v0; ts.tile = tile0;
      for (const b of st.list()) { L.sim.ensure(b); if (D[b.d].type === 'well') b.s.started = true; }
      for (const q of ['CRUDE', 'GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS']) L.company.setMode(q, 'WAIT'); L.company.sync();
      L.__cx = X0 + 6 * CW; L.__cy = Y0 + 4 * CH; return { buildings: st.items.size, lines: L.pipes.lines.size, central: !!L.pipes.central };
    }, N);
    const buildMs = Date.now() - t0;
    await p.evaluate(() => { __lab.company.advanceHours(6); }); await cdp.send('Emulation.setCPUThrottlingRate', { rate: THR }); await p.waitForTimeout(1500);
    if (process.env.AUDIT_H) {    // books check over a long game time with no rendering in the way: the same scene, advanceHours in 240 h steps, audit() after each step
      const rows = await p.evaluate(H => { const L = __lab, co = L.company, out = []; co.speed = 0; let bad = 0; for (let h = 0; h < H; h += 240) { co.advanceHours(240); const a = co.audit(); if (!a.ok || h % 2400 === 0) out.push({ hours: co.hours, ok: a.ok, errors: a.errors, cash: L.store.cash, entries: a.entries, mats: Object.assign({}, co.mats), autoBuy: (co.autoBuy && co.autoBuy.log || []).length }); if (!a.ok && ++bad >= 3) break; } return out; }, +process.env.AUDIT_H);
      for (const r of rows) console.log('AUDIT ' + JSON.stringify(r).slice(0, 700)); results.push({ audit: rows, N: sc.buildings }); await ctx.close(); continue; }
    if (process.env.SOAK_MIN) {   // continuous run: speed x10, the map moving, one sample a minute (fps over 5 s, heap, game hours really simulated, the longest block)
      const mins = +process.env.SOAK_MIN, samples = []; await p.evaluate(() => { const L = __lab; L.company.speed = 10; let a = 0; window.__iv = setInterval(() => { a += .05; __wp.goto(L.__cx + Math.cos(a) * 30, L.__cy + Math.sin(a) * 30, .7); }, 33); window.__lt = 0; try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.duration > __lt) __lt = e.duration; }).observe({ entryTypes: ['longtask'] }); } catch (_) { } });
      let hPrev = await p.evaluate(() => __lab.company.hours), tPrev = Date.now();
      for (let m = 1; m <= mins; m++) { await p.waitForTimeout(Math.max(0, 60000 - 5200)); const fr = await p.evaluate(() => new Promise(res => { const d = []; let last = performance.now(), t0 = last; const f = t => { d.push(t - last); last = t; if (t - t0 < 5000) requestAnimationFrame(f); else res(d); }; requestAnimationFrame(f); }));
        const x = await p.evaluate(() => { if (window.gc) gc(); const r = { heap: performance.memory.usedJSHeapSize, hours: __lab.company.hours, lt: window.__lt, n: __lab.store.items.size, audit: __lab.company.audit().ok }; window.__lt = 0; return r; }), now = Date.now();
        const row = { minute: m, fps: +(fr.length / (fr.reduce((a, v) => a + v, 0) / 1000)).toFixed(1), heapMB: +(x.heap / 1048576).toFixed(1), gameHoursPerSec: +((x.hours - hPrev) / ((now - tPrev) / 1000)).toFixed(2), longestBlockMs: Math.round(x.lt), buildings: x.n, booksBalance: x.audit };
        hPrev = x.hours; tPrev = now; samples.push(row); console.log('SOAK ' + JSON.stringify(row)); }
      results.push({ soak: samples, N: sc.buildings }); await ctx.close(); continue; }
    for (const speed of SPEEDS) for (const act of ACTS) {
      await p.evaluate(([speed, act]) => { const L = __lab; L.company.speed = speed; clearInterval(window.__iv); let a = 0; __wp.goto(L.__cx, L.__cy, .7); if (act === 'pan') window.__iv = setInterval(() => { a += .08; __wp.goto(L.__cx + Math.cos(a) * 30, L.__cy + Math.sin(a) * 30, .7); }, 33);
        const C = L.company; if (!C.__w) { C.__w = 1; window.__tm = { run: 0, runs: 0, maxRun: 0 }; const r0 = C.run.bind(C); C.run = function (...x) { const t = performance.now(); const o = r0(...x); const d = performance.now() - t; __tm.run += d; __tm.runs++; if (d > __tm.maxRun) __tm.maxRun = d; return o; }; } }, [speed, act]);
      await p.waitForTimeout(2500); await p.evaluate(() => { if (window.gc) gc(); __tm.run = 0; __tm.runs = 0; __tm.maxRun = 0; window.__lt = 0; window.__lts = 0; try { if (!window.__po) { window.__po = new PerformanceObserver(l => { for (const e of l.getEntries()) { __lts += e.duration; if (e.duration > __lt) __lt = e.duration; } }); __po.observe({ entryTypes: ['longtask'] }); } } catch (_) { } });
      const T0 = await p.evaluate(() => JSON.parse(JSON.stringify(__wp.stats.t || {})));
      const h0 = await p.evaluate(() => __lab.company.hours + __lab.company.acc);
      if (process.env.PROFILE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
      const fr = await p.evaluate(ms => new Promise(res => { const d = []; let last = performance.now(), t0 = last; const f = t => { d.push(t - last); last = t; if (t - t0 < ms) requestAnimationFrame(f); else res(d); }; requestAnimationFrame(f); }), SECS * 1000);
      const s1 = await p.evaluate(() => ({ tm: Object.assign({}, __tm), lt: window.__lt || 0, heap: performance.memory.usedJSHeapSize, hours: __lab.company.hours + __lab.company.acc, backlog: __lab.company.acc }));
      const dur = fr.reduce((a, x) => a + x, 0) / 1000, ft = fr.slice(1), gh = (s1.hours - h0) / dur;
      const T1 = await p.evaluate(() => JSON.parse(JSON.stringify(__wp.stats.t || {}))), layers = {}; for (const k in T1) layers[k] = +(((T1[k] || 0) - (T0[k] || 0)) / dur).toFixed(0);
      let prof = null; if (process.env.PROFILE) { const { profile } = await cdp.send('Profiler.stop'), byId = new Map(profile.nodes.map(n => [n.id, n])), self = new Map(); let tot = 0;
        profile.samples.forEach((id, i) => { const n = byId.get(id), d = profile.timeDeltas[i] || 0, k = n.callFrame.functionName + ' ' + (n.callFrame.url.split('/').pop() || '') + ':' + (n.callFrame.lineNumber + 1); tot += d; self.set(k, (self.get(k) || 0) + d); });
        prof = [...self].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => (v / tot * 100).toFixed(1) + '% ' + k); }
      const row = { N: sc.buildings, lines: sc.lines, speed, act, thr: THR, fps: +(fr.length / dur).toFixed(1), p50: +pct(ft, 50).toFixed(1), p95: +pct(ft, 95).toFixed(1), max: +Math.max(...ft).toFixed(0), slow33: +(ft.filter(x => x > 33.4).length / ft.length * 100).toFixed(1),
        econMsPerSec: +(s1.tm.run / dur).toFixed(0), econMaxMs: +s1.tm.maxRun.toFixed(0), longestTask: +s1.lt.toFixed(0), gameHoursPerSec: +gh.toFixed(2), wantedHoursPerSec: 2 * speed, backlogH: +s1.backlog.toFixed(1), heapMB: +(s1.heap / 1048576).toFixed(0) };
      row.drawMsPerSec = layers;
      if (prof) row.profile = prof;
      results.push(row); console.log(`N=${row.N} x${speed} ${act.padEnd(5)} fps ${row.fps} p95 ${row.p95} max ${row.max} slow>33 ${row.slow33}% | econ ${row.econMsPerSec} ms/s (max ${row.econMaxMs}) | game h/s ${row.gameHoursPerSec} of ${row.wantedHoursPerSec} | heap ${row.heapMB} MB | draw ms/s ${JSON.stringify(layers)}`); if (prof) console.log('   ' + prof.join('\n   '));
    }
    await p.evaluate(() => { clearInterval(window.__iv); __lab.company.speed = 0; }); results.push({ scene: Object.assign({ N, buildMs }, sc), errors: errs }); await ctx.close();
  }
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(results, null, 1)); await b.close(); srv.close();
});
