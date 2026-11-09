/* The two financial screens (performance chart, cash flow) in a real browser.   NODE_PATH=/opt/npm-tools/node_modules node test-finance-ui.js */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
(async () => {
  const b = await chromium.launch(), p = await (await b.newContext({ viewport: { width: 412, height: 866 }, hasTouch: true, isMobile: true })).newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message)); const ev = (f, a) => p.evaluate(f, a), port = srv.address().port;
  await p.goto('http://localhost:' + port + '/?lab=1&lang=en'); await p.waitForFunction(() => window.__lab && __lab.restored && window.__layers, null, { timeout: 90000 });
  await ev(() => { localStorage.clear(); __lab.reset(); __lab.company.speed = 0; }); await p.waitForTimeout(350); await p.waitForFunction(() => __wp.idle(), null, { timeout: 90000 });
  await p.locator('#eh-menu').tap(); await p.locator('#es-tabs [data-tab=company]').tap();
  ok(await p.locator('[data-act=screen][data-v=perf]').count() === 1 && await p.locator('[data-act=screen][data-v=cash]').count() === 1, 'the Company tab offers two financial screens: performance and cash flow');
  await p.locator('[data-act=screen][data-v=perf]').tap(); let body = await p.textContent('#es-body');
  ok(/لا توجد أيام مغلقة/.test(body), 'a new game shows no invented data: "no closed days yet"');
  await ev(() => { __lab.company.advanceHours(24 * 430); __lab.EU.render(); });
  const tiles = await p.textContent('#es-body'); ok(['إجمالي الإيرادات', 'إجمالي المصروفات', 'صافي الربح / الخسارة', 'قيمة الأصول', 'إجمالي الديون'].every(t => tiles.includes(t)), 'the top shows revenue, expenses, net profit/loss, assets and debt');
  const box = await p.locator('svg[data-f-chart]').boundingBox(), bw = await ev(() => document.getElementById('es-body').clientWidth);
  ok(box.width >= bw - 24 && box.height >= 320, 'the chart is large: ' + Math.round(box.width) + ' x ' + Math.round(box.height) + ' px on a 412 px phone');
  ok(await p.locator('svg[data-f-chart] polyline').count() === 3, 'three separate lines: revenue, expenses, net profit');
  const cols = await ev(() => [...document.querySelectorAll('svg[data-f-chart] polyline')].map(e => e.getAttribute('stroke'))); ok(new Set(cols).size === 3, 'each line has its own colour: ' + cols.join(' '));
  const ax = await ev(() => [...document.querySelectorAll('svg[data-f-chart] text')].map(t => t.textContent)); ok(ax.some(t => /ألف|^\d/.test(t)) && ax.some(t => /يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر/.test(t)), 'the vertical axis shows dollar values, the horizontal axis shows months');
  await p.locator('rect[data-act=fsel]').nth(2).dispatchEvent('click'); body = await p.textContent('#es-body'); ok(/النقطة المختارة/.test(body) && /الإيرادات/.test(body) && /\$/.test(body), 'tapping a point shows its date and exact values');
  for (const [k, lab] of [['D', 'يومي'], ['Y', 'سنوي'], ['M', 'شهري']]) { await p.locator('[data-act=ffr][data-v=' + k + ']').tap(); const pts = await p.locator('rect[data-act=fsel]').count(); ok(pts > 0, lab + ' view: ' + pts + ' points'); }
  const yrs = await ev(() => __lab.company.finSeries('Y').map(x => x.year)); ok(yrs.length >= 2, 'two game years recorded: ' + yrs.join(','));
  await p.locator('[data-act=fyr][data-v="-1"]').tap(); ok(new RegExp(String(yrs[0])).test(await p.textContent('#es-body')), 'the year can be changed (' + yrs[0] + ')');
  await p.locator('[data-act=fyr][data-v="1"]').tap(); await p.locator('[data-act=fcmp]').tap(); ok(await p.locator('svg[data-f-chart] polyline[stroke-dasharray]').count() === 3 && /مقابل/.test(await p.textContent('#es-body')), 'comparison with the previous year: dashed lines and a summary');
  const fits = async () => ev(() => { const x = document.getElementById('es-body'); return x.scrollWidth <= x.clientWidth + 1; }); ok(await fits(), 'no horizontal scroll (performance)');
  const lat = (await p.textContent('#es-body')).replace(/[$0-9.,%+\-−–:\/() ←→]/g, ''); ok(!/[A-Za-z]{2,}/.test(lat), 'no Latin words on the performance screen');
  await p.locator('[data-act=screen][data-v=""]').tap().catch(() => { }); await ev(() => { document.querySelector('[data-act=screen][data-v=""]') && document.querySelector('[data-act=screen][data-v=""]').click(); });
  await p.locator('[data-act=screen][data-v=cash]').tap(); body = await p.textContent('#es-body'); ok(['رصيد البداية', 'الأموال الداخلة', 'الأموال الخارجة', 'الرصيد النهائي'].every(t => body.includes(t)), 'the cash flow screen shows opening balance, money in, money out and closing balance');
  const last = await ev(() => { const m = __lab.company.finSeries('M'); const q = m[m.length - 1]; return q; }); ok(body.includes(Math.round(last.cstart).toLocaleString('en-US')) && body.includes(Math.round(last.cend).toLocaleString('en-US')), 'the cash numbers are the real ledger numbers of the period');
  await p.locator('[data-act=fcs]').nth(2).tap(); ok(/\d+ يوم/.test(await p.textContent('#es-body')), 'tapping a period shows its cash flow'); ok(await fits(), 'no horizontal scroll (cash flow)');
  ok(errs.length === 0, 'no page errors: ' + errs.join(' | '));
  console.log('PASS ' + n); await b.close(); srv.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
