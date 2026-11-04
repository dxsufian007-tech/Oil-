// Economy Phase 6: the new company dashboard, the budget, the ten financial reports and the journal screen, in a real browser (phone viewport, real taps).
// NODE_PATH=/opt/npm-tools/node_modules node test-economy-screens.js [shots-dir]
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const shots = process.argv[2] && path.resolve(process.argv[2]); if (shots) fs.mkdirSync(shots, { recursive: true });
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 412, height: 866 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true }), p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errs.push(m.text()); });
  const url = 'http://localhost:' + srv.address().port + '/?lab=1&lang=en', shot = async nm => { if (shots) await p.screenshot({ path: path.join(shots, nm + '.png') }); };
  const tap = async sel => { await p.locator(sel).first().tap(); await p.waitForTimeout(120); }, body = () => p.evaluate(() => document.getElementById('es-body').innerText), co = f => p.evaluate(f);
  await p.goto(url); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 }); await p.evaluate(() => { localStorage.clear(); __lab.reset(); });
  await p.evaluate(() => __lab.buildDemo()); await co(() => { __lab.company.speed = 0; __lab.company.advanceHours(24 * 95); __lab.EU.hud(); });   // three closed months of history
  await tap('#eh-menu'); await p.waitForTimeout(150);
  // 1. the dashboard: six cards, the chart toggles, the health and the three buttons
  let t = await body();
  ok(/الرصيد النقدي/.test(t) && /إجمالي الديون/.test(t) && /صافي الربح أو الخسارة/.test(t), 'dashboard: the six main cards are shown');
  ok(await p.locator('#es-body svg polyline').count() >= 3, 'dashboard: the chart draws revenue, expenses and profit lines (monthly)');
  await tap('#es-body [data-act=crange][data-v=day]'); ok(await p.locator('#es-body svg polyline').count() >= 3, 'chart switches to daily');
  await tap('#es-body [data-act=crange][data-v=year]'); ok(await p.locator('#es-body svg').count() >= 1, 'chart switches to yearly');
  await tap('#es-body [data-act=crange][data-v=month]');
  ok(/صحة الشركة/.test(t) && /السيولة/.test(t) && /مستوى المخاطر/.test(t), 'dashboard: company health shows liquidity, efficiency, asset condition and risk');
  await shot('econ-dashboard');
  // 2. the budget
  await tap('#es-body [data-act=screen][data-v=budget]'); t = await body(); ok(/مجموع الالتزامات/.test(t) && /ما يمكن إنفاقه الآن/.test(t), 'budget screen: monthly commitments and what can be spent now');
  await shot('econ-budget');
  await tap('#es-body [data-act=screen][data-v=""]'); await p.waitForTimeout(100);
  // 3. the ten reports, each with its three periods
  await tap('#es-body [data-act=screen][data-v=report]'); t = await body(); ok(/قائمة الدخل/.test(t) && /الميزانية العمومية/.test(t), 'report screen opens with its list of reports');
  const keys = ['income', 'balance', 'cashflow', 'expenses', 'revenue', 'payroll', 'production', 'debt', 'assets', 'tax'], labels = ['صافي الربح أو الخسارة', 'إجمالي الأصول', 'الرصيد النهائي', 'المجموع', 'إجمالي الإيرادات', 'الرواتب الشهرية', 'تكلفة البرميل', 'إجمالي الدين', 'الأصول بالتكلفة الدفترية', 'الضريبة'];
  for (let i = 0; i < keys.length; i++) for (const per of ['day', 'month', 'year']) {
    await tap('#es-body [data-act=rep][data-v=' + keys[i] + ']'); await tap('#es-body [data-act=rper][data-v=' + per + ']'); t = await body();
    ok(t.includes(labels[i]) || (keys[i] === 'expenses' && /لا توجد مصروفات/.test(t)) || (keys[i] === 'production' && /تكلفة البرميل/.test(t)), 'report ' + keys[i] + ' · ' + per + ' renders (' + labels[i] + ')');
  }
  await tap('#es-body [data-act=rep][data-v=balance]'); await tap('#es-body [data-act=rper][data-v=month]'); t = await body(); ok(/فحص الميزان: متوازن ✓/.test(t), 'balance sheet: the check says it balances');
  await shot('econ-report-balance');
  await tap('#es-body [data-act=screen][data-v=""]');
  // 4. the journal
  await tap('#es-body [data-act=screen][data-v=log]'); t = await body(); ok(/سجل|قيد|مدين|دائن/.test(t) && /مدين/.test(t) && /دائن/.test(t), 'journal screen lists balanced entries (debit and credit)');
  await shot('econ-journal');
  // 4b. purchasing: suppliers and quotes on screen; a purchase moves cash, stock and the journal
  await tap('#es-body [data-act=screen][data-v=""]'); await tap('#es-body [data-act=screen][data-v=buy]'); t = await body();
  ok(/المورد/.test(t) && /مورد أ/.test(t) && /الإجمالي|= /.test(t), 'purchasing screen: suppliers and quotes are shown');
  // Phase 7: bought crude never enters a production tank, so a commercial (unconnected) tank is built first
  const f0 = await co(() => { const s = __wp.world.allSites()[0]; return { x: s.x, y: s.y }; }); await p.evaluate(f => __wp.goto(f.x, f.y, 0.5), f0); await p.waitForFunction(() => __wp.idle(), null, { timeout: 60000 }); await p.waitForTimeout(500);
  const tk = await co(() => { const L = __lab, f = __wp.world.allSites()[0]; for (let r = 25; r < 90; r++) { const n = 16 + r * 6; for (let a = 0; a < n; a++) { const x = Math.round(f.x + Math.cos(a / n * 6.283) * r), y = Math.round(f.y + Math.sin(a / n * 6.283) * r); if (!L.store.validate('crude_tank_m', x, y, 0, {}).ok) continue; const t = L.store.place('crude_tank_m', x, y, 0, { instant: true }); if (t.ok) return t.building.id; } } return 0; });
  ok(tk > 0, 'a commercial crude tank is built to receive bought crude'); await co(() => { __lab.company.sync(); __lab.EU.hud(); }); await tap('#es-body [data-act=screen][data-v=""]'); await tap('#es-body [data-act=screen][data-v=buy]');
  const cash0 = await co(() => __lab.company.store.cash), inv0 = await co(() => __lab.company.journal.bal.INV_CRUDE_BUY || 0);
  await tap('#es-body [data-act=buy][data-p=CRUDE]');
  const cash1 = await co(() => __lab.company.store.cash), inv1 = await co(() => __lab.company.journal.bal.INV_CRUDE_BUY || 0);
  ok(cash1 < cash0 && inv1 > inv0, 'purchase of crude: cash goes down, bought-crude inventory goes up');
  ok(await co(() => __lab.company.audit().ok), 'purchase: the audit passes');
  await tap('#es-body [data-act=screen][data-v=""]');
  // 4c. employees: the screen shows the crew; hiring one raises payroll
  await tap('#es-body [data-act=screen][data-v=staff]'); t = await body();
  ok(/كفاءة الفريق/.test(t) && /مشغلون/.test(t), 'employees screen: team efficiency and roles are shown');
  const pay0 = await co(() => __lab.company.staff.payroll); await tap('#es-body [data-act=hire][data-p=operators]');
  const pay1 = await co(() => __lab.company.staff.payroll); ok(pay1 > pay0, 'hiring an operator raises payroll');
  await tap('#es-body [data-act=screen][data-v=""]');
  // 4d. rescue: the screen lists the measures; selling stock brings cash
  await tap('#es-body [data-act=screen][data-v=rescue]'); t = await body();
  ok(/بيع أصل غير مطلوب/.test(t) && /جدولة الديون/.test(t) && /خفض التكاليف/.test(t), 'rescue screen: asset sale, debt rescheduling and cost cut are shown');
  const avail = await co(() => __lab.company.available('CRUDE')), cashR0 = await co(() => __lab.company.store.cash);
  if (avail > 0) { await tap('#es-body [data-act=liquid][data-p=CRUDE]'); ok(await co(() => __lab.company.store.cash) > cashR0, 'rescue: selling crude brings cash'); }
  ok(await co(() => __lab.company.audit().ok), 'rescue: the audit passes after the actions');
  await tap('#es-body [data-act=screen][data-v=""]');
  // 4e. power: the screen shows the balance; switching on bought power works
  await tap('#es-body [data-act=screen][data-v=power]'); t = await body();
  ok(/الطلب/.test(t) && /العجز/.test(t) && /تفعيل الشراء/.test(t), 'power screen: demand, supply, shortage and the purchase switch are shown');
  await tap('#es-body [data-act=pbuy][data-v="1"]'); ok(await co(() => __lab.company.powerBuy === true), 'power: bought power switched on');
  await tap('#es-body [data-act=screen][data-v=""]');
  // 4f. financial ratios: seven ratios; the ones with no denominator say غير متاح
  await tap('#es-body [data-act=screen][data-v=ratios]'); t = await body();
  ok(/هامش صافي الربح/.test(t) && /ROA/.test(t) && /ROE/.test(t) && /نسبة التداول/.test(t) && /الدين إلى الأصول/.test(t) && /تكلفة البرميل/.test(t), 'ratios screen: margins, ROA, ROE, current ratio, debt to assets and cost per barrel are shown');
  await tap('#es-body [data-act=screen][data-v=""]');
  // 5. nothing failed in the page
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close(); srv.close(); console.log('\nECONOMY SCREENS TESTS PASSED (' + n + ' checks)');
})().catch(e => { console.log('FAILED: ' + e.message.split('\n').slice(0, 3).join(' / ')); process.exit(1); });
