// Save safety: a rolling backup, a visible save error, and a load that never leaves a half-loaded game.   NODE_PATH=/opt/npm-tools/node_modules node test-save-safety.js
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 412, height: 866 }, hasTouch: true, isMobile: true }), p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message)); const url = 'http://localhost:' + srv.address().port + '/', boot = async () => { await p.goto(url); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 }); };
  await boot(); await p.evaluate(() => { localStorage.clear(); __lab.reset(); __lab.company.injectEquity(5e7, 't'); const z = __wp.world.reserveZoneOfWorld(); const l0 = z.levels[0]; __wp.goto(l0.x + 10, l0.y + 7, .6); });
  await p.waitForTimeout(1200);
  for (let i = 0; i < 2; i++) { await p.evaluate(() => __lab.startBuild('crude_tank_s')); await p.waitForTimeout(250); await p.locator('#bBuild').tap(); await p.waitForTimeout(400); }
  const n1 = await p.evaluate(() => __lab.store.list().filter(x => x.rs).length); ok(n1 === 2, 'two reserve tanks built through the real build button');
  await p.evaluate(() => { __lab.save(); }); await p.waitForTimeout(100);
  await p.evaluate(() => { window.__bak = null; });
  // the backup appears on the next save after a minute: simulate by calling save with an old backup clock
  const bak = await p.evaluate(() => { const real = Date.now; Date.now = () => real() + 61000; __lab.save(); Date.now = real; return !!localStorage.getItem('oli-lab-v2-bak'); }); ok(bak, 'a rolling backup of the previous save is written');
  // 1. the main save is corrupted -> the backup is restored
  await p.evaluate(() => { window.__noSave = true; localStorage.setItem('oli-lab-v2', '{broken'); }); await boot();
  let st = await p.evaluate(() => ({ n: __lab.store.list().filter(x => x.rs).length, r: __lab.restored })); ok(st.n >= 1 && st.r.fromBackup, 'a corrupted main save -> the backup is restored (' + st.n + ' reserve tanks)');
  // 2. a save that makes the load throw -> backup, and the game is not left half loaded
  await p.evaluate(() => { window.__noSave = true; const o = JSON.parse(localStorage.getItem('oli-lab-v2-bak')); localStorage.setItem('oli-lab-v2-bak', JSON.stringify(o)); o.store = 5; o.net = null; localStorage.setItem('oli-lab-v2', JSON.stringify(o)); }); await boot();
  st = await p.evaluate(() => ({ n: __lab.store.list().filter(x => x.rs).length, r: __lab.restored })); ok(st.r.from === 'save' && st.n >= 1, 'a save that throws while loading -> the backup is used, not a blank game');
  // 3. no usable save at all -> an ordinary new game, and restored is set
  await p.evaluate(() => { window.__noSave = true; localStorage.setItem('oli-lab-v2', '{broken'); localStorage.setItem('oli-lab-v2-bak', 'x'); }); await boot();
  st = await p.evaluate(() => ({ n: __lab.store.list().filter(b => b.d !== 'central_station').length, r: __lab.restored.from })); ok(st.n === 0 && st.r !== 'save', 'no usable save: a clean new game (restored is set: ' + st.r + ')');
  // 4. a failing write is shown on screen
  await p.evaluate(() => { window.__noSave = false; localStorage.clear(); __lab.company.injectEquity(1e6, 't'); const real = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new Error('quota'); }; __lab.save(); Storage.prototype.setItem = real; });
  const toast = await p.evaluate(() => document.body.innerText); ok(/تعذّر حفظ اللعبة/.test(toast), 'a failed save shows a message on screen');
  ok(!errs.length, 'no page errors: ' + errs.join('|')); console.log('SAVE SAFETY TESTS PASSED (' + n + ' checks)'); await b.close(); srv.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
