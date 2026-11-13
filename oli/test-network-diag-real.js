/* NETWORK DIAGNOSTICS on a REAL save, in the real page.   SAVE=/path/realsave.json SHOTS=/dir NODE_PATH=/opt/npm-tools/node_modules node test-network-diag-real.js   (skips when no SAVE is given) */
if (!process.env.SAVE) { console.log('skipped: no SAVE'); process.exit(0); }
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); }, SH = process.env.SHOTS || '/tmp/shots';
(async () => {
  const save = fs.readFileSync(process.env.SAVE, 'utf8'), b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 412, height: 866 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }), errs = [];
  await ctx.addInitScript(s => { try { if (!localStorage.getItem('oli-lab-v2') || !window.__seeded) { localStorage.setItem('oli-lab-v2', s); } } catch (e) { } }, save);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); const ev = (f, a) => p.evaluate(f, a), port = srv.address().port;
  await p.goto('http://localhost:' + port + '/?lab=1&lang=en'); await p.waitForFunction(() => window.__lab && __lab.restored && window.__layers && window.__netdiag, null, { timeout: 120000 });
  await p.waitForFunction(() => { const x = document.getElementById('cu-box'); return !x || x.style.display === 'none'; }, null, { timeout: 240000 }); await p.waitForTimeout(1500); if (await p.locator('#eco-away.open button').count()) await p.locator('#eco-away.open button').first().tap(); await p.waitForFunction(() => !document.querySelector('#eco-away.open'), null, { timeout: 15000 }); await ev(() => { __lab.company.speed = 0; }); await p.waitForFunction(() => __wp.idle(), null, { timeout: 120000 }); await p.waitForTimeout(1500);
  const st0 = await ev(() => ({ b: __lab.store.items.size, l: __lab.pipes.lines.size, cen: __lab.pipes.central ? __lab.pipes.central.cen.size : 0 })); ok(st0.b === 244 && st0.l === 234, 'the real save is loaded in the page: 244 buildings, 234 pipes, Central tiles ' + st0.cen);
  const snap = () => ev(() => JSON.stringify({ n: __lab.pipes.toJSON(), s: __lab.store.toJSON({ live: true }), cash: __lab.store.cash, h: __lab.company.hours }));
  await ev(() => { __lab.company.advanceHours(2); }); await p.waitForTimeout(500);
  const before = await snap(); await p.locator('#ndBtn').tap(); await p.waitForSelector('#ndPanel .nd-sum', { timeout: 20000 });
  const rep = await ev(() => { const r = __netdiag.st.rep; return { stats: r.stats, ms: __netdiag.st.ms, notes: r.notes, f: r.faults.map(f => ({ no: f.no, code: f.code, sev: f.severity, conf: f.confirmed, id: f.element.id, type: f.element.type, x: f.x, y: f.y, zone: f.zone, label: f.element.label })) }; });
  console.log('  stats', JSON.stringify(rep.stats), 'ms', Math.round(rep.ms));
  ok(await snap() === before, 'the scan changed nothing (network, buildings, cash, hours identical)');
  const by = c => rep.f.filter(f => f.code === c); ok(rep.stats.critical === 0 && !rep.f.some(f => f.sev === 'CRITICAL'), 'no CRITICAL fault on the sound real network');
  ok(!rep.f.some(f => f.code === 'DEAD_END' || f.code === 'NO_SUPPLY' || f.code === 'OPEN_END' || f.code === 'ISOLATED'), 'no false dead-end / no-supply / open-end / isolated on connected elements (Central stations count as hand-off points)');
  const eng = await ev(() => { let h = 0, o = 0; for (const L of __lab.pipes.lines.values()) { if (L.hiP) h++; if (L.over) o++; } return { h, o }; }); console.log('  engine flags', JSON.stringify(eng), 'diag', by('HIGH_PRESSURE').length, by('OVER_CAPACITY').length); ok(by('HIGH_PRESSURE').length === eng.h && by('OVER_CAPACITY').length === eng.o, 'pressure / capacity findings equal the engine own flags one-to-one');
  await p.screenshot({ path: SH + '/01-panel-real.png' });
  const pick = async code => { const f = rep.f.find(x => x.code === code); await ev(no => __netdiag.select(no), f.no); await p.waitForTimeout(700); const c = await ev(() => ({ x: __wp.cam.x, y: __wp.cam.y, sel: __netdiag.st.sel })); return { f, c, d: Math.hypot(c.x - (f.x + .5), c.y - (f.y + .5)) }; };
  for (const [code, shot] of [['PATH_BLOCKED', '02-locate-path-blocked'], ['HIGH_PRESSURE', '03-locate-high-pressure'], ['OVER_CAPACITY', '04-locate-over-capacity'], ['CLOSED_LINE', '05-locate-closed-line'], ['TANK_FULL', '06-locate-tank-full']]) {
    const r = await pick(code); ok(r.c.sel === r.f.no && r.d < 6, code + ': tapping fault #' + r.f.no + ' jumps the map to (' + r.f.x + ',' + r.f.y + ') on ' + r.f.label); await p.screenshot({ path: SH + '/' + shot + '.png' }); await ev(() => { __netdiag.st.open = false; __netdiag.render(); }); await p.waitForTimeout(2500); await p.screenshot({ path: SH + '/' + shot + '-map.png' }); await ev(() => { __netdiag.st.open = true; __netdiag.render(); }); }
  ok(await snap() === before, 'locating faults changed nothing either');
  ok(!errs.length, 'no page errors: ' + errs.join(' | ')); console.log('PASS ' + n); await b.close(); srv.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
