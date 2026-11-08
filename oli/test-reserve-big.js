// A large Strategic Reserve zone (150+ tanks): the extra rings can be opened one by one, a tank in the outermost ring is allowed only once its ring is open, and it survives a reload.
//   NODE_PATH=/opt/npm-tools/node_modules node test-reserve-big.js
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 412, height: 866 }, hasTouch: true, isMobile: true }), p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message));
  const boot = async () => { await p.goto('http://localhost:' + srv.address().port + '/'); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 }); };
  await boot(); await p.evaluate(() => { localStorage.clear(); __lab.reset(); __lab.company.injectEquity(1e9, 't'); });
  const z = await p.evaluate(() => { const z = __wp.world.reserveZoneOfWorld(); return { levels: z.levels.length, last: z.levels[z.levels.length - 1], l4: z.levels[4] }; });
  ok(z.levels === 9 && z.last.w * z.last.h > z.l4.w * z.l4.h * 1.5, 'the zone has 9 levels and the last is much larger than the old 36x26: ' + JSON.stringify(z.last));
  await p.evaluate(zz => __wp.goto(zz.x + zz.w / 2, zz.y + zz.h / 2, .5), z.last); await p.waitForTimeout(2500); await p.waitForFunction(() => __wp.idle && __wp.idle(), null, { timeout: 60000 }); await p.waitForTimeout(500);
  const edge = { x: z.last.x + 1, y: z.last.y + 1 }; await p.evaluate(e => __wp.goto(e.x + 6, e.y + 6, .5), edge); await p.waitForFunction(() => __wp.idle && __wp.idle(), null, { timeout: 60000 }); await p.waitForTimeout(800);
  let r = await p.evaluate(e => { const v = __lab.store.place('crude_tank_s', e.x, e.y, 0, { instant: true }); return v.ok ? 'ok' : v.reason; }, edge); ok(r === 'reserveBounds', 'a tank in the outer ring is refused while that ring is closed (' + r + ')');
  let costs = []; for (let i = 0; i < 8; i++) { const c = await p.evaluate(() => { const c0 = __lab.store.cash, x = __lab.company.reserveExpand(); return x.ok ? c0 - __lab.store.cash : x.reason; }); costs.push(c); }
  ok(costs.every(c => typeof c === 'number' && c > 0), 'all eight rings open one after another, each costing money: ' + costs.map(c => Math.round(c / 1e6)).join(' / ') + ' M');
  ok((await p.evaluate(() => __lab.company.reserveExpand().reason)) === 'maxLevel', 'a ninth expansion is refused: the zone is fully open');
  r = await p.evaluate(e => { const v = __lab.store.place('crude_tank_s', e.x, e.y, 0, { instant: true }); return v.ok ? 'ok' : v.reason; }, edge); ok(r === 'ok', 'a tank in the outer ring is accepted once the ring is open');
  const many = await p.evaluate(() => { const z = __wp.world.reserveZoneOfWorld(), L = z.levels[z.levels.length - 1]; let c = 0; for (let y = L.y; y + 2 <= L.y + L.h; y += 3) for (let x = L.x; x + 2 <= L.x + L.w; x += 3) if (__lab.store.place('crude_tank_s', x, y, 0, { instant: true }).ok) c++; return c; });
  ok(many >= 150, 'the open zone takes ' + many + ' more small tanks');
  await p.evaluate(() => { __lab.save(); window.__noSave = false; }); await boot();
  const after = await p.evaluate(() => ({ lv: __lab.company.reserve.lv, rs: __lab.store.list().filter(x => x.rs).length, from: __lab.restored.from, dropped: __lab.restored.dropped }));
  ok(after.from === 'save' && after.lv === 8 && after.rs >= 150 && !after.dropped.length, 'after a reload: level 8 and all ' + after.rs + ' reserve tanks are back, none dropped');
  await p.evaluate(() => __lab.EU.open('reserve')); await p.waitForTimeout(300); const t = await p.evaluate(() => document.getElementById('es-body').innerText); ok(/منطقة الاحتياطي الاستراتيجي/.test(t), 'the reserve screen still opens with that many tanks');
  ok(!errs.length, 'no page errors: ' + errs.join('|')); console.log('BIG RESERVE TESTS PASSED (' + n + ' checks)'); await b.close(); srv.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
