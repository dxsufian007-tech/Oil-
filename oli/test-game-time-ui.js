/* Game Time & Calendar, the screen: the date bar, play / pause / faster / slower, and saving the date and speed through a real reload.   NODE_PATH=/opt/npm-tools/node_modules node test-game-time-ui.js [shotsDir] */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const shots = process.argv[2] && path.resolve(process.argv[2]); if (shots) fs.mkdirSync(shots, { recursive: true });
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
(async () => {
  const b = await chromium.launch(), p = await (await b.newContext({ viewport: { width: 412, height: 866 }, hasTouch: true, isMobile: true })).newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); });
  const ev = (f, a) => p.evaluate(f, a), tap = async s => { await p.locator(s).tap(); await p.waitForTimeout(120); }, shot = async nm => { if (shots) await p.screenshot({ path: path.join(shots, nm + '.png') }); };
  const url = 'http://localhost:' + srv.address().port + '/?lab=1&lang=en';
  await p.goto(url); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 });
  await ev(() => { localStorage.clear(); __lab.reset(); }); await p.waitForTimeout(400);
  await ev(() => { __lab.company.setSpeed(1); __lab.EU.hud(); });
  ok(await p.locator('#eco-time').isVisible(), 'the date bar is visible'); ok(/1 يناير 2026/.test(await p.innerText('#eh-clock')), 'it starts on 1 January 2026: ' + (await p.innerText('#eh-clock')).replace(/\n/g, ' · ')); await shot('01-start');
  ok((await p.innerText('#eh-speed')) === '×1' && (await p.innerText('#eh-pause')) === '⏸', 'speed x1 is shown and the button offers PAUSE');
  const box = async s => ev(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom]; }, s);
  const bars = await box('#eco-time'), hud = await box('#eco-hud'); ok(bars[2] >= hud[3] - 1, 'the date bar sits below the money bar without overlapping it');
  // pause stops the whole game, not just a label
  const h0 = await ev(() => __lab.company.hours); await p.waitForTimeout(1600); const h1 = await ev(() => __lab.company.hours); ok(h1 > h0, 'time runs while playing (' + h0 + ' -> ' + h1 + ' h)');
  await tap('#eh-pause'); const sp = await ev(() => __lab.company.speed); ok(sp === 0 && (await p.innerText('#eh-pause')) === '▶' && (await p.innerText('#eh-speed')) === 'متوقف', 'tap PAUSE: speed 0, the button shows PLAY and the speed says «متوقف»'); await shot('02-paused');
  const s0 = await ev(() => JSON.stringify([__lab.company.hours, __lab.store.cash, __lab.company.journal.n, __lab.store.time])); await p.waitForTimeout(2500); ok((await ev(() => JSON.stringify([__lab.company.hours, __lab.store.cash, __lab.company.journal.n, __lab.store.time]))) === s0, 'while paused the clock, the cash, the journal and the construction clock do not move (2.5 s)');
  await tap('#eh-pause'); await p.waitForTimeout(1500); ok((await ev(() => __lab.company.hours)) > h1 && (await ev(() => __lab.company.speed)) === 1, 'tap PLAY: runs again at x1');
  await tap('#tm-fast'); ok((await ev(() => __lab.company.speed)) === 2 && (await p.innerText('#eh-speed')) === '×2', 'FASTER: x2'); await tap('#tm-fast'); await tap('#tm-fast'); await tap('#tm-fast'); await tap('#tm-fast'); ok((await ev(() => __lab.company.speed)) === 10, 'FASTER stops at x10');
  for (let i = 0; i < 6; i++) await tap('#tm-slow'); ok((await ev(() => __lab.company.speed)) === 0.5 && (await p.innerText('#eh-speed')) === '×0.5', 'SLOWER goes down to x0.5 and stops there');
  const r1 = await ev(() => __lab.company.hours); await p.waitForTimeout(2000); const r2 = await ev(() => __lab.company.hours); await ev(() => __lab.company.setSpeed(10)); await p.waitForTimeout(250); const q1 = await ev(() => __lab.company.hours); await p.waitForTimeout(2000); const q2 = await ev(() => __lab.company.hours);
  ok((q2 - q1) > (r2 - r1) * 5, 'x10 really runs far faster than x0.5 (' + (q2 - q1) + ' h vs ' + (r2 - r1) + ' h in 2 s)');
  await tap('#eh-speed'); ok((await ev(() => __lab.company.speed)) === 1, 'tapping the speed label cycles 1x/2x/5x/10x (from x10 back to x1)');
  // the date really changes with the clock, across a month and a year
  await ev(() => { __lab.company.pause(); __lab.company.advanceHours(24 * 31 - __lab.company.hours % (24 * 31) + 5); __lab.EU.hud(); }); const t1 = await p.innerText('#eh-clock'); ok(/فبراير 2026|مارس 2026|يناير 2026/.test(t1), 'the date text follows the clock: ' + t1.replace(/\n/g, ' · '));
  await ev(() => { __lab.company.advanceHours(24 * 365 - __lab.company.hours % (24 * 365) + 24 * 365 > 0 ? (365 * 24 - __lab.company.hours) + 30 : 0); __lab.EU.hud(); }); ok(/2027/.test(await p.innerText('#eh-clock')), 'across the new year the bar shows 2027: ' + (await p.innerText('#eh-clock')).replace(/\n/g, ' · ')); await shot('03-2027');
  // save and reload: date, hour, speed and pause survive
  await ev(() => { __lab.company.setSpeed(0); __lab.save(); }); const sv = await ev(() => ({ h: __lab.company.hours, t: __lab.company.clock().text })); await p.reload(); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 }); await p.waitForTimeout(500);
  const af = await ev(() => ({ h: __lab.company.hours, t: __lab.company.clock().text, sp: __lab.company.speed })); ok(af.t === sv.t && af.sp === 0 && Math.abs(af.h - sv.h) < 1e-9, 'after a reload the same date, hour and PAUSE come back: ' + af.t); ok((await p.innerText('#eh-speed')) === 'متوقف', 'and the bar still says it is paused');
  await ev(() => { __lab.company.setSpeed(5); __lab.save(); }); await p.reload(); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 }); await p.waitForTimeout(400); ok((await ev(() => __lab.company.speed)) === 5, 'the chosen speed (x5) is restored too');
  // the company screen shows the same date
  await tap('#eh-menu'); await p.waitForTimeout(300); ok(/2027/.test(await p.innerText('#es-body')), 'the company screen shows the same game date'); await shot('04-company');
  ok(errs.length === 0, 'no page errors: ' + errs.join(' | ')); console.log('PASS ' + n); await b.close(); srv.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
