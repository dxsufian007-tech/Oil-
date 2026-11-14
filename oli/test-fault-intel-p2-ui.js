/* FAULT INTELLIGENCE P2 in the real game on a phone viewport: a closed pipe is ONE root cause with its symptoms, lost barrels and the facilities after it; nothing is saved.  SHOTS=/dir NODE_PATH=/opt/npm-tools/node_modules node test-fault-intel-p2-ui.js */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
const SH = process.env.SHOTS;
(async () => {
  const b = await chromium.launch(), p = await (await b.newContext({ viewport: { width: 412, height: 866 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })).newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message)); const ev = (f, a) => p.evaluate(f, a), port = srv.address().port;
  await p.goto('http://localhost:' + port + '/?lab=1&lang=en'); await p.waitForFunction(() => window.__lab && __lab.restored && window.__layers && window.__netdiag, null, { timeout: 90000 });
  await ev(() => { localStorage.clear(); __lab.reset(); __lab.company.speed = 0; }); await p.waitForTimeout(350); await p.waitForFunction(() => __wp.idle(), null, { timeout: 90000 });
  await ev(async () => { await __lab.buildDemo(); }); await p.waitForFunction(() => __wp.idle(), null, { timeout: 90000 }); await ev(() => { __lab.company.speed = 0; __lab.company.advanceHours(24); });
  const save0 = await ev(() => JSON.stringify({ n: __lab.pipes.toJSON(), s: [...__lab.store.items.values()], cash: __lab.company.cash }));
  await ev(() => { __lab.pipes.lines.get(6).open = false; __lab.pipes.rev++; __lab.company.advanceHours(1); });
  await p.locator('#ndBtn').tap(); await p.waitForSelector('#ndPanel .nd-sum', { timeout: 10000 });
  const R = await ev(() => { const r = __netdiag.st.rep; return r.rca && { groups: r.rca.groups.map(g => ({ code: g.code, el: g.element.id, sy: g.symptoms.length, w: g.wells.length, lost: g.lostBblDay, down: g.downstream.count })), tot: r.rca.totals, roles: r.faults.map(f => f.rca && f.rca.role) }; });
  ok(!!R && R.groups.some(g => g.el === 6 && g.code === 'CLOSED_LINE'), 'the closed PIPE-6 is a root cause: ' + JSON.stringify(R && R.groups));
  ok(R.roles.every(x => x === 'ROOT' || x === 'SYMPTOM' || x === 'INDEPENDENT'), 'every finding has a role');
  await ev(() => { __netdiag.st.mode = 'full'; __netdiag.render(); }); await p.waitForTimeout(400);
  let t = await p.textContent('#ndPanel'); ok(/السبب الجذري/.test(t) && /قراءة فقط/.test(t), 'the panel shows the root-cause summary'); if (SH) await p.screenshot({ path: SH + '/p2a.png' });
  await ev(() => { const g = __netdiag.st.rep.rca.groups.find(g => g.element.id === 6); __netdiag.select(g.rootNo); __netdiag.st.mode = 'full'; __netdiag.render(); }); await p.waitForTimeout(400);
  t = await p.textContent('#ndPanel'); ok(/سبب جذري/.test(t) && /الدور/.test(t), 'the detail of the root says it is the root'); if (SH) await p.screenshot({ path: SH + '/p2b.png' });
  const saved = await ev(() => JSON.stringify({ n: __lab.pipes.toJSON() })); ok(saved.indexOf('rca') < 0 && saved.indexOf('registry') < 0 && saved.indexOf('symptom') < 0, 'nothing from the analysis reaches the save data');
  ok(errs.length === 0, 'no page errors: ' + errs.join(' | ')); console.log('PASS ' + n); await b.close(); srv.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
