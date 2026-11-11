const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const root = process.env.ROOT, N = +process.argv[2] || 3000, THR = +process.env.THR || 1;
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(root, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream' }); r.end(d); }); });
srv.listen(0, async () => { const b = await chromium.launch({ args: ['--enable-precise-memory-info'] }), errs = [];
  const ctx = await b.newContext({ viewport: { width: 412, height: 866 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }), p = await ctx.newPage(), cdp = await ctx.newCDPSession(p); p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.addInitScript(() => { let s = 12345; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; const D = Date.now; Date.now = () => 1700000000000; }); await p.goto('http://localhost:' + srv.address().port + '/?unlock=all'); await p.waitForFunction(() => window.__lab && __lab.restored && __wp.idle(), null, { timeout: 120000 });
  const src = fs.readFileSync('/tmp/wt-b2/oli/perf-bench-browser.js', 'utf8'); const a = src.indexOf('const sc = await p.evaluate(N => {') + 'const sc = await p.evaluate('.length, bEnd = src.indexOf('}, N);', a); const fn = src.slice(a, bEnd + 1);
  const fn2 = new Function('return ' + fn)();
  const runCase = async (mode) => { await p.evaluate(fn2, N); return p.evaluate(m => { const L = __lab, C = L.company; C.speed = 0; let rm = null;
      if (m !== 'off') { const hk = OliLiveDiag.pa.install; rm = m === 'count' ? hk(L, 'count') : (() => { const r = hk(L, 'timed'); for (const [k, s] of r.stats) { s.timed = true; if (/^Sim\.(split|offer|accept)$/.test(k)) s.flow = true; } return r; })(); }
      C.advanceHours(24);
      let tick = 0; C.speed = 1; C.acc = 0; for (let k = 0; k < 400; k++) C.run(k % 7 === 0 ? 1 : 0, 3, () => (tick += 1)); C.settle();
      const wrapped = Object.getPrototypeOf(C.sim).offer.toString().includes('s.calls'); if (rm) rm.remove(); const j = JSON.parse(JSON.stringify({ eco: C.toJSON(), store: L.store.toJSON({ live: true }), net: L.company.net.toJSON() })); const strip = o => { if (o && typeof o === 'object') { for (const k of ['lastSim', 'savedAt']) delete o[k]; for (const k in o) strip(o[k]); } return o; };
      return { h: C.hours, cash: L.store.cash, s: JSON.stringify(strip(j)), wrapped, after: Object.getPrototypeOf(C.sim).offer.toString().includes('s.calls') }; }, mode); };
  const o = await runCase(process.env.MODE); require('fs').writeFileSync('/tmp/same-'+process.env.MODE+process.env.TAG+'.json', o.s); console.log(process.env.MODE, 'h', o.h, 'cash', o.cash, 'sha', require('crypto').createHash('sha256').update(o.s).digest('hex').slice(0,16), 'len', o.s.length, 'wrapped', o.wrapped, 'after', o.after);
  const res={}, panel={};
   console.log("ERRORS", JSON.stringify(errs)); await b.close(); srv.close(); });
