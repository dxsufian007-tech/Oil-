/* Pipe upgrade on the phone (412px): the button on the pipe card, the dialog (current / new / increase / cost / downtime / real limit), the confirmation, the refreshed card.
 *   NODE_PATH=/opt/npm-tools/node_modules node test-pipe-upgrade-ui.js [shotDir] */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'); let ok = 0, bad = 0; const t = (n, c, x) => { if (c) { ok++; console.log('  ok  ' + n); } else { bad++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x).slice(0, 400)); } };
const SHOT = process.argv[2] || null;
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : f.endsWith('.webp') ? 'image/webp' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream' }); r.end(d); }); });
srv.listen(0, async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 412, height: 866 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }), p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message));
  const shot = async nm => { if (SHOT) await p.screenshot({ path: path.join(SHOT, nm + '.png') }); }, idle = () => p.waitForFunction(() => __wp.idle && __wp.idle(), null, { timeout: 60000 }), ev = (f, a) => p.evaluate(f, a), tx = sel => ev(s => (document.querySelector(s) || {}).innerText || '', sel), clean = s => s.replace(/[⁦-⁩‎‏]/g, '');
  await p.goto('http://localhost:' + srv.address().port + '/?lab=1&lang=ar'); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 }); await ev(() => { localStorage.clear(); __lab.reset(); __lab.store.cash = 5e9; __lab.company.speed = 0; });
  t('demo chain built', (await ev(() => __lab.buildDemo())).ok);
  const pick = await ev(() => { let best = null; for (const L of __lab.pipes.lines.values()) { if (!L.a || !L.b || L.path.length < 8) continue; if (!best || L.path.length > best.len) best = { id: L.id, len: L.path.length, mid: L.path[Math.floor(L.path.length / 2)] }; } if (best) { const L = __lab.pipes.lines.get(best.id); L.dia = 8; __lab.pipes.rev++; } return best; });
  const scr = (x, y) => ev(a => { const r = document.querySelector('canvas').getBoundingClientRect(); return [r.left + __wp.sx(a[0] + .5, a[1] + .5), r.top + __wp.sy(a[0] + .5, a[1] + .5)]; }, [x, y]);
  await ev(m => __wp.goto(m[0], m[1], .9), pick.mid); await idle(); await p.waitForTimeout(500); let q = await scr(pick.mid[0], pick.mid[1]); await p.touchscreen.tap(q[0], q[1]); await p.waitForTimeout(400);
  const btn = await ev(() => { const e = document.getElementById('bPipeUp'); return e ? e.textContent : null; }); t('the pipe card has the button «ترقية الأنبوب 🔧»', btn === 'ترقية الأنبوب 🔧', btn); await shot('pu-1-card');
  const before = await ev(id => { const L = __lab.pipes.lines.get(id); return { path: JSON.stringify(L.path), a: JSON.stringify(L.a), b: JSON.stringify(L.b), cash: __lab.store.cash, tiles: L.path.length, prod: L.product }; }, pick.id);
  await p.locator('#bPipeUp').tap(); await p.waitForTimeout(300); let d = clean(await tx('#pipeUp'));
  t('the dialog shows the current diameter (8) and its capacity 30,000', /8 بوصة/.test(d) && /30,000/.test(d) && /الأنبوب الحالي/.test(d), d.slice(0, 200));
  t('it lists 8 / 16 / 36 with 30,000 / 100,000 / 300,000 bbl/day', /16 بوصة[\s\S]*100,000/.test(d) && /36 بوصة[\s\S]*300,000/.test(d));
  t('the current diameter is not selectable', await ev(() => [...document.querySelectorAll('#pipeUp button[disabled]')].length === 1));
  await p.locator('#pipeUp [data-pu="pick"][data-d="16"]').tap(); await p.waitForTimeout(250); d = clean(await tx('#pipeUp'));
  const cost16 = before.tiles * 28000;
  t('choosing 16 shows: from 8 to 16, capacity 30,000 → 100,000 (+70,000)', /من 8 إلى 16 بوصة/.test(d) && /30,000 ← 100,000/.test(d) && /\+70,000/.test(d), d.slice(0, 500));
  t('it shows the cost (tiles × $28,000) and the downtime (none) before confirming', d.indexOf('$' + cost16.toLocaleString('en-US')) >= 0 && /لا يوجد توقف/.test(d), cost16);
  t('it shows the expected REAL flow and says nominal capacity is not flow', /التدفق الفعلي المتوقع بعد الترقية/.test(d) && /السعة الاسمية ليست تدفقاً/.test(d));
  t('nothing changed yet (needs the player\'s confirmation)', await ev(id => +__lab.pipes.lines.get(id).dia === 8, pick.id));
  await ev(() => { const o = OliIndustry.upgradePipe; window.__rec = null; OliIndustry.upgradePipe = (...a) => { const c0 = __lab.store.cash, r = o(...a); window.__rec = { c0, c1: __lab.store.cash, r }; return r; }; }); await shot('pu-2-dialog-16');
  await p.locator('#pipeUp [data-pu="go"]').tap(); await p.waitForTimeout(400);
  const after = await ev(id => { const L = __lab.pipes.lines.get(id); return { dia: +L.dia, path: JSON.stringify(L.path), a: JSON.stringify(L.a), b: JSON.stringify(L.b), cash: __lab.store.cash, prod: L.product }; }, pick.id);
  t('after confirming: 16", cash down by exactly the price, path/ends/product unchanged', after.dia === 16 && (await ev(() => __rec.c0 - __rec.c1)) === cost16 && (await ev(() => __rec.r.cost)) === cost16 && after.path === before.path && after.a === before.a && after.b === before.b && after.prod === before.prod, [after.dia, cost16]);
  t('the dialog closed and the pipe card shows 16 بوصة and capacity 100,000', !(await ev(() => document.getElementById('pipeUp'))) && /16 بوصة/.test(clean(await tx('#info'))) && /100,000/.test(clean(await tx('#info'))), clean(await tx('#info')).slice(0, 300)); await shot('pu-3-after');
  await p.locator('#bPipeUp').tap(); await p.waitForTimeout(300); d = clean(await tx('#pipeUp'));
  t('second dialog: 8 and 16 are not selectable (only the bigger 36 is)', await ev(() => [...document.querySelectorAll('#pipeUp button[disabled]')].length === 2) && /أصغر من الحالي: غير متاح/.test(d) && /\(الحالي\)/.test(d));
  await p.locator('#pipeUp [data-pu="pick"][data-d="36"]').tap(); await p.waitForTimeout(250); await shot('pu-4-dialog-36'); await p.locator('#pipeUp [data-pu="x"]').first().tap(); await p.waitForTimeout(200);
  t('cancelling changes nothing', await ev(id => __lab.pipes.lines.get(id).dia === 16, pick.id) && !(await ev(() => document.getElementById('pipeUp'))));
  await ev(() => { __lab.store.cash = 1000; }); await p.locator('#bPipeUp').tap(); await p.waitForTimeout(250); await p.locator('#pipeUp [data-pu="pick"][data-d="36"]').tap(); await p.waitForTimeout(250); d = clean(await tx('#pipeUp'));
  t('without enough cash the confirm button is disabled and says so', await ev(() => document.querySelector('#pipeUp [data-pu="go"]').disabled) && /الرصيد لا يكفي/.test(d)); await shot('pu-5-nocash');
  t('the dialog fits 412px with no sideways scroll', await ev(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.getElementById('pipeUp').firstChild.getBoundingClientRect().width <= innerWidth + 1));
  t('no page errors', !errs.length, errs); console.log(ok + ' passed, ' + bad + ' failed'); await b.close(); srv.close(); process.exit(bad ? 1 : 0);
});
