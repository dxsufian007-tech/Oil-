// End-of-day diagnosis in the browser (READ-ONLY instrumentation injected from outside).  env ROOT THR SECS SPEED
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const root = process.env.ROOT, THR = +process.env.THR || 16, SECS = +process.env.SECS || 90, SPEED = +process.env.SPEED || 1, OUT = process.argv[2];
const SAVE = (() => { const d = JSON.parse(fs.readFileSync((process.env.SAVE||'/home/claude/dxsufian007-tech/oil-/oli/local-saves/realsave.json'), 'utf8')); d.eco.savedAt = Date.now(); return JSON.stringify(d); })();
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(root, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); }); });
srv.listen(0, async () => {
  const b = await chromium.launch({ args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const ctx = await b.newContext({ viewport: { width: 412, height: 866 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }), p = await ctx.newPage(), cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: THR });
  await p.addInitScript(() => { window.__perfT = new Proxy({ save: 0, saveN: 0, ui: 0, uiN: 0, tick: 0, tickN: 0 }, { set(t, k, v) { if (k === 'save') (window.__E_saves = window.__E_saves || []).push([performance.now(), v - t.save]); t[k] = v; return true; } }); });
  await p.addInitScript(([v, d]) => { if (v) window.__saveVerify = true; if (d === '0') window.__asDefer = false; }, [process.env.VERIFY, process.env.DEFER]);
  await p.addInitScript(s => { try { if (!localStorage.getItem('oli-lab-v2')) localStorage.setItem('oli-lab-v2', s); } catch (_) { } }, SAVE);
  await p.goto('http://localhost:' + srv.address().port + '/?lab=1'); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 180000 });
  await p.waitForFunction(() => { const b = document.getElementById('cu-box'); return !b || b.style.display === 'none' || __lab.restored.job === null; }, null, { timeout: 180000 }).catch(() => {});
  await p.evaluate(() => {
    const L = __lab, C = L.company; window.__E = { days: [], slices: [], settles: [], saves: [], frames: [], lt: [], ops: [] };
    const now = () => performance.now(), P = Object.getPrototypeOf(C);
    const nd = C._newDay; C._newDay = function (...a) { const t = now(); try { return nd.apply(this, a); } finally { __E.days.push({ t, ms: now() - t, day: this.dayIdx }); } };
    for (const nm of ['_monthEnd', '_finLog', '_refreshOffers', '_deskDay', '_autoReserveDay', '_bankDaily', '_notify', '_finance', '_auto', 'computeStaff']) { const f = C[nm]; if (typeof f !== 'function') continue; C[nm] = function (...a) { const t = now(); try { return f.apply(this, a); } finally { __E.ops.push([nm, t, now() - t]); } }; }
    const run = C.run.bind(C); C.run = function (...a) { const d0 = this.dayIdx, t = now(); const r = run(...a); __E.slices.push({ t, ms: now() - t, hrs: r, dayEnd: this.dayIdx > d0 }); return r; };
    const st = C.settle && C.settle.bind(C); if (st) C.settle = function (...a) { const open = !!this._hg, t = now(); const r = st(...a); const ms = now() - t; if (ms > 0.5 || open) __E.settles.push({ t, ms, open }); return r; };
    const si = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { const t = now(); try { return si.call(this, k, v); } finally { __E.saves.push({ t, ms: now() - t, k, len: (v || '').length }); } };
    const js=JSON.stringify.bind(JSON); JSON.stringify=function(...a){ const t=now(); const r=js(...a); const ms=now()-t; if(r&&r.length>200000)__E.saves.push({t,ms,k:'JSON.stringify',len:r.length}); return r; };
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) __E.lt.push({ t: e.startTime, ms: e.duration }); }).observe({ entryTypes: ['longtask'] }); } catch (_) { }
    let last = now(); const f = t => { __E.frames.push([t, t - last]); last = t; requestAnimationFrame(f); }; requestAnimationFrame(f);
    const w = cs => cs; const c0 = [...L.store.items.values()].find(b => /well/.test(b.d)) || [...L.store.items.values()][0]; __wp.goto(c0.x, c0.y, .7);
  });
  const sp = SPEED; await p.evaluate(s => { __lab.company.speed = s; }, sp); await p.waitForTimeout(SECS * 1000);
  const R = await p.evaluate(() => { __lab.company.speed = 0; return { E: Object.assign(__E, { saveTotals: window.__E_saves || [], err: window.__saveError || null }), dayIdx: __lab.company.dayIdx, t: performance.now() }; });
  fs.writeFileSync(OUT, JSON.stringify(R)); await b.close(); srv.close();
  const E = R.E, f = x => +x.toFixed(1), pct = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(q / 100 * s.length))] : NaN; };
  console.log('days seen', E.days.length, '| _newDay ms', E.days.map(d => f(d.ms)).join(','));
  const sl = E.slices.filter(s => s.hrs > 0 || s.ms > 1), ds = E.slices.filter(s => s.dayEnd), ns = E.slices.filter(s => !s.dayEnd);
  console.log('slices (run calls) normal: n', ns.length, 'mean', f(ns.reduce((a, s) => a + s.ms, 0) / (ns.length || 1)), 'p95', f(pct(ns.map(s => s.ms), 95)), 'max', f(Math.max(0, ...ns.map(s => s.ms))), '| with day-end: n', ds.length, ds.map(s => f(s.ms)).join(','));
  // frames around a day end
  const win = (t, a, b) => E.frames.filter(([ft]) => ft >= t - a && ft <= t + b).map(x => x[1]);
  const near = []; for (const d of E.days) near.push(...win(d.t, 0, 150)); const all = E.frames.map(x => x[1]);
  console.log('frame ms overall: p50', f(pct(all, 50)), 'p95', f(pct(all, 95)), 'max', f(Math.max(...all)), '| frames within 150 ms after a day end: n', near.length, 'max', f(Math.max(0, ...near)), 'mean', f(near.reduce((a, x) => a + x, 0) / (near.length || 1)));
  console.log('longtasks: n', E.lt.length, 'max', f(Math.max(0, ...E.lt.map(x => x.ms))), '| those overlapping a day end:', E.lt.filter(x => E.days.some(d => d.t >= x.t - 5 && d.t <= x.t + x.ms + 5)).map(x => f(x.ms)).join(','));
  console.log('settle calls that closed an open hour: n', E.settles.filter(s => s.open).length, 'ms', E.settles.filter(s => s.open).map(s => f(s.ms)).join(','));
  const grp={}; for(const s of E.saves){(grp[s.k]=grp[s.k]||[]).push(s.ms);} console.log('save parts: '+Object.entries(grp).map(([k,a])=>k+' n='+a.length+' mean '+f(a.reduce((x,y)=>x+y,0)/a.length)+' max '+f(Math.max(...a))).join(' | '));
  console.log('SAVE total ms per autosave (whole save() call): n', E.saveTotals.length, E.saveTotals.map(x => f(x[1])).join(','), '| saveError', E.err);
  console.log('localStorage.setItem (autosave write): n', E.saves.length, 'ms', E.saves.map(s => f(s.ms)).join(','), 'bytes', E.saves.length ? E.saves[0].len : 0);
  const per = {}; for (const [n, t, ms] of E.ops) { (per[n] = per[n] || []).push(ms); } console.log('ops in the browser (ms): ' + Object.entries(per).map(([n, a]) => n + ' n=' + a.length + ' max ' + f(Math.max(...a))).join(' | '));
});
