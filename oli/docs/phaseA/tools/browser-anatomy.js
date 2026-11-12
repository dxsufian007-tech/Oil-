/* Phase A: the two diagnostic tests in the real game page (3000-building synthetic scene).   T=t1|t2 THR=<cpu slowdown> ROOT=<oli dir> NODE_PATH=<playwright> node browser-anatomy.js N */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const root = process.env.ROOT, N = +process.argv[2] || 3000, THR = +process.env.THR || 1;
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(root, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream' }); r.end(d); }); });
srv.listen(0, async () => { const b = await chromium.launch({ args: ['--enable-precise-memory-info'] }), errs = [];
  const ctx = await b.newContext({ viewport: { width: 412, height: 866 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }), p = await ctx.newPage(), cdp = await ctx.newCDPSession(p); p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto('http://localhost:' + srv.address().port + '/?unlock=all'); await p.waitForFunction(() => window.__lab && __lab.restored && __wp.idle(), null, { timeout: 120000 });
  const src = fs.readFileSync('/tmp/wt-b2/oli/perf-bench-browser.js', 'utf8'); const a = src.indexOf('const sc = await p.evaluate(N => {') + 'const sc = await p.evaluate('.length, bEnd = src.indexOf('}, N);', a); const fn = src.slice(a, bEnd + 1);
  await p.evaluate(new Function('return ' + fn)(), N); await p.evaluate(() => { __lab.company.advanceHours(6); __lab.company.speed = 1; });
  if (THR > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THR }); await p.waitForTimeout(3500);
  const before = await p.evaluate(() => ({ h: __lab.company.hours, cash: __lab.store.cash, n: __lab.store.items.size }));
  const res = {}; res[process.env.T] = await p.evaluate(t => OliLiveDiag.p0[t](), process.env.T); const panel = {};
  for (const k in res) console.log('\n#### ' + k + '\n' + res[k]); console.log('\nPANEL', JSON.stringify(panel), 'BEFORE', JSON.stringify(before), 'ERRORS', JSON.stringify(errs)); await b.close(); srv.close(); });
