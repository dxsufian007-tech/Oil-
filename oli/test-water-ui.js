// Water system in the real game (browser simulation, NOT a real Android device): network look, tank card, group, sales UI + screenshots.
// NODE_PATH=/opt/npm-tools/node_modules node test-water-ui.js [outdir]
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const OUT = process.argv[2] || '/tmp/water-shots'; fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 412, height: 866 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }), p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:' + srv.address().port + '/?unlock=all'); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 });
  await p.evaluate(() => { localStorage.clear(); __lab.reset(); __lab.company.speed = 0; __lab.store.cash = 5e8; const z = __wp.world.reserveZoneOfWorld(); __wp.goto(z.x - 10, z.y + 10, .7); window.__z = z; }); await p.waitForTimeout(3000);
  const r = await p.evaluate(() => {
    const L = __lab, z = window.__z; let o = null;
    for (let dx = -70; dx <= 70 && !o; dx++) for (let dy = -30; dy <= 60 && !o; dy++) { const x = z.x + dx, y = z.y + dy; if ([['separator', 0, 0], ['crude_tank_m', 14, 0], ['water_pump_s', 0, 14], ['water_tank_m', 12, 14], ['water_tank_m', 17, 14], ['water_pump_s', 24, 14]].every(a => L.store.validate(a[0], x + a[1], y + a[2], 0, {}).ok)) o = { x, y }; }
    if (!o) return { err: 'no spot' };
    const put = (d, dx, dy) => { const v = L.store.place(d, o.x + dx, o.y + dy, 0, { instant: true }); if (!v.ok) throw new Error(d + ' ' + v.reason); return v.building; };
    const sep = put('separator', 0, 0), ot = put('crude_tank_m', 14, 0), pu = put('water_pump_s', 0, 14), w1 = put('water_tank_m', 12, 14), w2 = put('water_tank_m', 17, 14), lp = put('water_pump_s', 24, 14);
    const pipe = (a, ap, c, cp) => { const q = L.I.layPipe(L.store, L.pipes, L.ts, { b: a.id, port: ap }, { b: c.id, port: cp }, 16); if (q.ok === false) throw new Error('pipe ' + ap + ' ' + q.reason); };
    pipe(sep, 'OIL_OUT', ot, 'INPUT_W'); pipe(sep, 'WATER_OUT', pu, 'INPUT');
    const c = (a, d) => { const q = L.I.layConnect(L.store, L.pipes, L.ts, a.id, d.id, {}); if (!q.ok) throw new Error('connect ' + a.d + '>' + d.d + ' ' + q.reason); };
    c(pu, w1); L.I.autoLinkTank(L.store, L.pipes, L.ts, w2.id); c(w2, lp);
    L.sim.build(); window.__ids = { sep: sep.id, w1: w1.id, w2: w2.id, lp: lp.id, o };
    const s1 = L.sim.ensure(w1), s2 = L.sim.ensure(w2); s1.vol = 6000; s2.vol = 2000; L.sim.build();
    return { ids: window.__ids };
  });
  ok(!r.err, 'water network built in the real game ' + (r.err || ''));
  const o = r.ids.o; await p.evaluate(o => __wp.goto(o.x + 14, o.y + 10, .8), o); await p.waitForTimeout(1500);
  await p.screenshot({ path: OUT + '/1-network.png' });
  // tank card
  { const q = await p.evaluate(id => { const b = __lab.store.get(id); return [__wp.sx(b.x + 1.5, b.y + 1.5), __wp.sy(b.x + 1.5, b.y + 1.5)]; }, r.ids.w1); await p.touchscreen.tap(q[0], q[1]); await p.waitForTimeout(900); }
  const card = await p.evaluate(() => document.getElementById('info').innerText); ok(/Water|مياه|water/i.test(card), 'water tank card shows: ' + card.replace(/\s+/g, ' ').slice(0, 160));
  await p.screenshot({ path: OUT + '/2-tank-card.png' });
  // sales UI
  await p.evaluate(() => { document.getElementById('info').style.display = 'none'; __lab.EU.open('inventory'); }); await p.waitForTimeout(800);
  const sheet = await p.evaluate(() => document.getElementById('eco-sheet').innerText); ok(/مياه|Water/i.test(sheet), 'sales card present in Inventory');
  ok(await p.evaluate(() => !!document.querySelector('#es-body [data-act=wauto]') && !!document.getElementById('wr-in') && !!document.querySelector('#es-body [data-act=wrset]')), 'auto-sale switch and reserve field are in the water card');
  await p.evaluate(() => { document.getElementById('wr-in').value = '500'; document.querySelector('#es-body [data-act=wrset]').click(); document.querySelector('#es-body [data-act=wauto]').click(); });
  ok(await p.evaluate(() => /مفعّل/.test(document.getElementById('es-body').innerText) && document.getElementById('wr-in').value === '500'), 'switch ON and reserve 500 saved from the card');
  await p.screenshot({ path: OUT + '/3-sales-ui.png' });
  const sold = await p.evaluate(() => { const C = __lab.company, a = C.waterInfo(); const rr = C.sellWater(1000); return { a, rr, after: C.waterInfo(), cash: __lab.store.cash }; });
  ok(sold.rr && sold.rr.ok !== false, 'sale ok ' + JSON.stringify(sold.rr).slice(0, 120)); ok(Math.abs((sold.a.stock || sold.a.stored || 0) - (sold.after.stock || sold.after.stored || 0)) > 0, 'stock dropped after sale');
  await p.evaluate(() => __lab.EU.open('inventory')); await p.waitForTimeout(500); await p.screenshot({ path: OUT + '/4-after-sale.png' });
  ok(errs.length === 0, 'no page errors ' + errs.join('|')); console.log(n + ' checks'); await b.close(); srv.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
