/* the performance panel: absent for normal players, present only in the test build; it measures without touching the save or the rules */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
let ok = 0, bad = 0; const t = (n, c) => { if (c) ok++; else { bad++; console.log('FAIL', n); } };
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); }); });
srv.listen(0, async () => {
  const b = await chromium.launch({ args: ['--enable-precise-memory-info'] }), url = 'http://localhost:' + srv.address().port + '/', errs = [];
  // 1) a normal player: no panel, no hooks, even if the script were present
  { const ctx = await b.newContext({ viewport: { width: 412, height: 866 } }); await ctx.addInitScript(() => { window.OLI_DEMO = true; }); const p = await ctx.newPage(); await p.goto(url); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 120000 }); await p.addScriptTag({ path: path.join(__dirname, 'perf-panel.js') }); await p.waitForTimeout(1500);
    t('normal player: no PERF button', await p.evaluate(() => !document.getElementById('pf-btn'))); t('normal player: no perf hooks', await p.evaluate(() => !window.__perfT && !window.__perf)); await ctx.close(); }
  // 2) the test build: a short scenario
  const ctx = await b.newContext({ viewport: { width: 412, height: 866 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }); await ctx.addInitScript(() => { window.OLI_DEMO = true; window.OLI_PERF = true; });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(url + '?legacy=1'); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 120000 }); await p.addScriptTag({ path: path.join(__dirname, 'perf-panel.js') });
  await p.waitForFunction(() => document.getElementById('pf-btn'), null, { timeout: 30000 }); t('test build: PERF button', true);
  // a real save exists before the test
  const before = await p.evaluate(() => { __lab.reset && 0; localStorage.setItem('oli-lab-v2', 'SENTINEL-SAVE'); return localStorage.getItem('oli-lab-v2'); });
  await p.evaluate(() => { window.__done = false; __perf.runScenario('quick', { say(t) { window.__say = t; }, text() { }, done() { } }).then(() => { window.__done = true; }); });
  await p.waitForFunction(() => window.__done, null, { timeout: 600000, polling: 2000 });
  const rep = await p.evaluate(() => JSON.parse(JSON.stringify(__perf.report()))), after = await p.evaluate(() => localStorage.getItem('oli-lab-v2'));
  t('save untouched by the test', after === before); t('9 phases', rep.results.length === 9); t('no page errors', errs.length === 0);
  t('scene has pumps and tanks', rep.scene && rep.scene.pumps >= 1 && rep.scene.tanks >= 20);
  for (const r of rep.results) { t(r.id + ' has frames', r.frames > 20); t(r.id + ' P95>=avg', r.frameMs.p95 >= r.frameMs.avg * .5); t(r.id + ' timeline', r.timeline.length >= 3); t(r.id + ' memory', r.memory.unavailable || r.memory.endMB > 0); t(r.id + ' verdict', typeof r.verdict === 'string'); t(r.id + ' sim timing present', r.sim.calls > 0); t(r.id + ' draw parts', r.draw.parts && 'afterOverlays' in r.draw.parts); }
  t('speeds recorded x1/x5/x10', [1, 5, 10].every(s => rep.results.some(r => r.speed === s)));
  const txt = await p.evaluate(() => __perf.textSummary(__perf.report())); t('text summary', /P95/.test(txt) && /scenario/.test(txt));
  // export fallback path (no Capacitor): produces both files' content and keeps them for the page
  await p.evaluate(() => __perf.exportFiles({ say() { }, text() { } })); const ex = await p.evaluate(() => window.__perfLast && JSON.parse(window.__perfLast.json).results.length); t('export produced the report', ex === 9);
  // leak analysis maths: a rising floor is flagged, a flat one is not
  const lk = await p.evaluate(() => { const mk = f => ({ timeline: Array.from({ length: 400 }, (_, i) => ({ t: i, heapMB: f(i) + 2 * Math.abs(Math.sin(i / 3)) })) }); return [__perf.leak(mk(i => 20 + i * 0.05)), __perf.leak(mk(() => 20))]; });
  t('leak detector flags a rise', /تسرب/.test(lk[0].verdict) && lk[0].slopeMBperMin > 2); t('leak detector accepts flat', /مستقر/.test(lk[1].verdict));
  await b.close(); srv.close(); console.log('PERF PANEL TESTS:', ok, 'passed,', bad, 'failed'); process.exit(bad ? 1 : 0);
});
