/* The two financial screens (performance chart, cash flow) in a real browser.   NODE_PATH=/opt/npm-tools/node_modules node test-banking-ui.js */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
(async () => {
  const b = await chromium.launch(), p = await (await b.newContext({ viewport: { width: 412, height: 866 }, hasTouch: true, isMobile: true })).newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message)); const ev = (f, a) => p.evaluate(f, a), port = srv.address().port;
  await p.goto('http://localhost:' + port + '/?lab=1&lang=en'); await p.waitForFunction(() => window.__lab && __lab.restored && window.__layers, null, { timeout: 90000 });
  await ev(() => { localStorage.clear(); __lab.reset(); __lab.company.speed = 0; }); await p.waitForTimeout(350); await p.waitForFunction(() => __wp.idle(), null, { timeout: 90000 });
  const fits = () => ev(() => { const e = document.getElementById('es-body'); return e.scrollWidth <= e.clientWidth + 1; });
  await p.locator('#eh-menu').tap(); await p.locator('#es-tabs [data-tab=company]').tap();
  ok(await p.locator('[data-act=screen][data-v=bank]').count() === 1, 'the Company tab offers the BANKING & CAPITAL MARKETS section');
  await p.locator('[data-act=screen][data-v=bank]').tap(); let body = await p.textContent('#es-body');
  ok(/BANKING & CAPITAL MARKETS/.test(body) && /سعر الأساس/.test(body) && /4\.00%/.test(body) && /المصرف التجاري|التجاري/.test(body), 'it opens on the overview: Base Rate 4.00% and the three banks');
  ok(await p.locator('[data-act=bkTab]').count() === 5 && await fits(), 'five tabs; no horizontal scroll on a 412 px phone');
  await p.locator('[data-act=bkTab][data-v=loans]').tap(); ok(/لا توجد قروض مصرفية/.test(await p.textContent('#es-body')), 'a new game: the loans tab says there are no loans (no invented data)');
  await ev(() => { const c = __lab.company; c.injectEquity(5e9, 'test'); c.advanceHours(24 * 40); window.__r = c.takeBankLoan('COMMERCIAL', 'WORKING_CAPITAL', 1e8, 24, { purpose: 'ui test' }); const gb = c.bank.bonds.listed().find(x => x.issuer === 'CORP_A'); window.__b = c.buyBond(gb.id, 20000); window.__i = c.issueBond(60, 30e6); __lab.EU.render(); });
  ok(await ev(() => __r.ok && __b.ok && __i.ok), 'real loan, bond purchase and bond issue made through the engines');
  body = await p.textContent('#es-body'); const bal = await ev(() => Math.round(__r.loan.bal).toLocaleString('en-US')); ok(body.includes(bal) && /قرض/.test(body) || body.includes(bal), 'the loan tab shows the loan with its real balance ' + bal);
  ok(await fits(), 'no horizontal scroll (loans)');
  const s0 = await ev(() => JSON.stringify(__lab.company.toJSON()));
  for (const t of ['credit', 'bonds', 'log', 'overview']) { await p.locator('[data-act=bkTab][data-v=' + t + ']').tap(); ok(await fits(), 'no horizontal scroll (' + t + ')'); }
  await p.locator('[data-act=bkTab][data-v=overview]').tap(); if (process.env.SHOTS) await p.screenshot({ path: '/tmp/bank-overview.png' });
  await p.locator('[data-act=bkTab][data-v=bonds]').tap(); if (process.env.SHOTS) await p.screenshot({ path: '/tmp/bank-bonds.png' }); body = await p.textContent('#es-body'); ok(/سوق السندات/.test(body) && /الخليج للبتروكيماويات/.test(body) && /حيازة/.test(body) && /سندي #1/.test(body), 'the bond tab: live market, my holding and my own bond');
  const rows = await p.locator('#es-body table tr').count(); ok(rows === 19, 'the market table has the 18 real bonds (+ header): ' + rows);
  await p.locator('[data-act=bkTab][data-v=log]').tap(); body = await p.textContent('#es-body'); ok(/عملية/.test(body) && /فتح قرض/.test(body) && /شراء سند/.test(body), 'the permanent record shows the loan and the bond operations');
  ok(await ev(() => JSON.stringify(__lab.company.toJSON())) === s0, 'opening and tapping every tab changed nothing in the company (money, books, banks, bonds)');
  const buttons = await ev(() => [...document.querySelectorAll('#es-body [data-act]')].map(e => e.dataset.act)); ok(buttons.every(a => ['bkTab', 'bkMore', 'screen'].includes(a)), 'no fake buttons: only tabs, "show more" and back: ' + [...new Set(buttons)].join(','));
  await p.locator('#es-body [data-act=screen]').first().tap(); ok(await p.locator('[data-act=screen][data-v=bank]').count() === 1, 'the back button returns to the Company tab');
  await p.screenshot({ path: '/tmp/bank-ui.png' });
  ok(errs.length === 0, 'no page errors: ' + errs.join(' | '));
  console.log('PASS ' + n); await b.close(); srv.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
