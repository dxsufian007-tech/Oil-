// Strategic Reserve - stage 1 screens in a real browser (phone viewport): the zone on the map, a tap opens it, two separate gauges, expansion, save/reload.
//   NODE_PATH=/opt/npm-tools/node_modules node test-reserve-ui.js [shots-dir]
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const shots = process.argv[2] && path.resolve(process.argv[2]); if (shots) fs.mkdirSync(shots, { recursive: true });
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 412, height: 866 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true }), p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errs.push(m.text()); });
  const url = 'http://localhost:' + srv.address().port + '/?lab=1', shot = async nm => { if (shots) await p.screenshot({ path: path.join(shots, nm + '.png') }); }, tap = async sel => { await p.locator(sel).first().tap(); await p.waitForTimeout(150); };
  const body = () => p.evaluate(() => document.getElementById('es-body').innerText), co = (f, a) => p.evaluate(f, a);
  await p.goto(url); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 }); await p.evaluate(() => { localStorage.clear(); __lab.reset(); });
  console.log('THE ZONE ON THE MAP');
  const zn = await co(() => { const z = __wp.world.reserveZoneOfWorld(); return z && { x: z.x, y: z.y, w: z.w, h: z.h, name: z.name }; }); ok(zn && zn.name === 'منطقة الاحتياطي الاستراتيجي', 'the world has the one fixed reserve zone: ' + JSON.stringify(zn));
  await co(([x, y]) => { __wp.goto(x, y, .6); }, [zn.x + zn.w / 2, zn.y + zn.h / 2]); await p.waitForTimeout(1200); await shot('reserve-map');
  await p.touchscreen.tap(206, 433); await p.waitForTimeout(400);
  ok(await p.locator('#eco-sheet.open').count() === 1 && (await co(() => document.querySelector('#es-tabs .on').dataset.tab)) === 'reserve', 'a tap on the zone\'s ground opens the Strategic Reserve screen');
  let t = await body(); await shot('reserve-screen'); ok(/منطقة الاحتياطي الاستراتيجي/.test(t) && /امتلاء الاحتياطي الاستراتيجي/.test(t) && /امتلاء المخزون التجاري/.test(t), 'the screen shows the reserve gauge and the commercial gauge as two separate cards');
  ok(/المساحة المفتوحة/.test(t) && /20×14/.test(t) && new RegExp(zn.w + '×' + zn.h).test(t), 'it shows the open area (20×14) and the maximum area of the whole zone (' + zn.w + '×' + zn.h + ')');
  const tabs = await co(() => [...document.querySelectorAll('#es-tabs button')].map(x => x.textContent)); ok(tabs.includes('الاحتياطي'), 'the tab list has an Arabic "الاحتياطي" tab');
  console.log('TWO SEPARATE GAUGES');
  const ids = await co(([zx, zy]) => { const S = __lab.store, CO = __lab.company, lv = CO.reserve.lv; const z = __wp.world.reserveZoneOfWorld(), A = z.levels[lv];
    const rt = S.place('crude_tank_s', A.x + 2, A.y + 2, 0, { instant: true }), ct = (() => { for (let r = 3; r < 60; r += 3) for (const [dx, dy] of [[-r, 0], [r, 0], [0, -r], [0, r], [-r, r], [r, r]]) { const hr = __wp.world.homeRegionOfWorld(), cx = hr.x0 + 150 + dx * 2, cy = hr.y0 + 150 + dy * 2; if (S.validate('crude_tank_s', cx, cy, 0).ok) return S.place('crude_tank_s', cx, cy, 0, { instant: true }); } return { ok: false, reason: 'noSpot' }; })(); return { rt: rt.ok && rt.building.id, ct: ct.ok && ct.building.id, why: [rt.reason, ct.reason] }; }, [zn.x, zn.y]);
  ok(ids.rt && ids.ct, 'a reserve tank (inside the zone) and a commercial tank (outside) were built: ' + JSON.stringify(ids));
  await co(({ rt, ct }) => { __lab.company.sync(); __lab.sim.ensure(__lab.store.get(rt)).vol = 3000; __lab.sim.ensure(__lab.store.get(ct)).vol = 7500; }, ids);
  await co(() => __lab.EU.render()); t = await body();
  const f = await co(() => __lab.company.fills()); ok(Math.abs(f.reserve.fill - 0.3) < 1e-9 && Math.abs(f.commercial.fill - 0.75) < 1e-9, 'engine: reserve 3,000/10,000 = 30%, commercial 7,500/10,000 = 75%');
  ok(/30%/.test(t) && /75%/.test(t), 'the reserve screen shows 30% (reserve) and 75% (commercial) side by side');
  await co(() => __lab.EU.open('storage')); await p.waitForTimeout(200); const ts = await body(); ok(/75%/.test(ts) && !/30%/.test(ts.split('أنواع المخازن')[0]), 'the commercial screen shows 75% and its gauge does not include the reserve tank');
  await shot('storage-screen');
  console.log('EXPANSION AND SAVING');
  await co(() => __lab.EU.open('reserve')); await p.waitForTimeout(150); const c0 = await co(() => __lab.store.cash); await tap('[data-act=rvexp]'); const c1 = await co(() => __lab.store.cash), lv = await co(() => __lab.company.reserve.lv);
  ok(lv === 1 && Math.abs(c0 - c1 - 4e6) < 4e4, 'tapping "توسيع المنطقة" opens the next ring: level 1, cash −$4M (the running clock may add a few daily costs)'); t = await body(); ok(/24×17/.test(t), 'the screen shows the new open area 24×17');
  await co(() => __lab.save()); await p.reload(); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 }); await p.waitForTimeout(800);
  const after = await co(() => ({ lv: __lab.company.reserve.lv, f: __lab.company.fills(), n: __lab.company.reserveTanks().length, rs: __lab.store.list().filter(x => x.rs).length }));
  ok(after.lv === 1 && after.n === 1 && after.rs === 1 && Math.abs(after.f.reserve.fill - 0.3) < 1e-9 && Math.abs(after.f.commercial.fill - 0.75) < 1e-3, 'after a real reload: level, reserve tank, and both gauges are exactly the same: ' + JSON.stringify(after));
  console.log('STAGE 2: BUY, SELL, RELEASE, LOG (five sections of the reserve screen)');
  await co(() => __lab.EU.open('reserve')); await p.waitForTimeout(200); await shot('reserve-stage2');
  const sec = async k => { await tap('[data-act=rvsec][data-v=' + k + ']'); await p.waitForTimeout(80); return body(); };
  t = await body(); ok(/تكاليف الاحتياطي اليومية/.test(t) && /توسعة المنطقة/.test(t), 'overview: costs and expansion');
  t = await sec('tr'); ok(/شراء إلى الاحتياطي/.test(t) && /بيع يدوي من الاحتياطي/.test(t), 'buy and sell section: purchase form and manual sale');
  const rv0 = await co(() => ({ cash: __lab.store.cash, vol: __lab.company.reserveStock('CRUDE'), com: __lab.company.fills().commercial.volume }));
  await co(() => { const z = __wp.world.reserveZoneOfWorld(), A = z.levels[__lab.company.reserve.lv]; __wp.goto(A.x + A.w / 2, A.y + A.h / 2, .6); }); await p.waitForTimeout(2500);
  await co(() => { const S = __lab.store, z = __wp.world.reserveZoneOfWorld(), A = z.levels[__lab.company.reserve.lv]; __lab.company.injectEquity(5e7, 't'); let done = false; for (let y = A.y; y < A.y + A.h && !done; y += 2) for (let x = A.x; x < A.x + A.w && !done; x += 2) if (S.validate('crude_tank_l', x, y, 0).ok) { const r = S.place('crude_tank_l', x, y, 0, { instant: true }); done = r.ok; } });   // the buy list now starts at 100,000 bbl: it needs room
  await p.waitForTimeout(200); const rvPre = await co(() => __lab.store.cash); await tap('[data-act=rvbuy]'); const rv1 = await co(() => ({ cash: __lab.store.cash, vol: __lab.company.reserveStock('CRUDE'), com: __lab.company.fills().commercial.volume, ok: __lab.company.audit().ok }));
  ok(rv1.vol - rv0.vol === 100000 && rv1.cash < rvPre && rv1.com === rv0.com && rv1.ok, 'tapping buy adds 100,000 barrels to the reserve only, pays cash, the commercial store is unchanged, books balance');
  await tap('[data-act=rvsell]'); const rv2 = await co(() => ({ cash: __lab.store.cash, vol: __lab.company.reserveStock('CRUDE'), ok: __lab.company.audit().ok }));
  ok(rv1.vol - rv2.vol === 100000 && rv2.cash > rv1.cash && rv2.ok, 'tapping manual sale sells 100,000 barrels from the reserve for cash');
  t = await sec('rl'); ok(/سحب بأمرك/.test(t) && await p.locator('[data-act=rvrel]').first().isDisabled(), 'release section: the release button is disabled while no pipe is connected to the outlet');
  t = await sec('mk'); ok(/أثر الشركة على السوق العالمي/.test(t) && /حصتك من الإنتاج العالمي/.test(t) && /قيمة الاحتياطي/.test(t) && /بسعر السوق اليوم/.test(t), 'market section: share of world production and supply, other producers\' answer, reserve at market value');
  t = await sec('lg'); ok(/سجل عمليات الاحتياطي/.test(t) && /شراء/.test(t) && /بيع/.test(t) && /100,000/.test(t), 'log section: the purchase and the sale are listed');
  for (const k of ['ov', 'tr', 'rl', 'mk', 'lg']) { await sec(k); t = await co(() => { const c = document.getElementById('es-body').cloneNode(true); c.querySelectorAll('.nm').forEach(x => x.remove()); return c.innerText; }); const latin = (t.match(/[A-Za-z]{2,}/g) || []).filter(w => !/^(bbl|USD)$/i.test(w)); ok(latin.length === 0, 'no Latin words in section ' + k + ' (building names aside): ' + latin.slice(0, 5).join(',')); }
  ok(errs.length === 0, 'no page errors: ' + errs.slice(0, 3).join(' | '));
  await b.close(); srv.close(); console.log('\nRESERVE UI TESTS: ' + n + ' passed');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
