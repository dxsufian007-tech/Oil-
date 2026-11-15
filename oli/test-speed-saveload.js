/* (split from test-speed-oldsave.js to keep every test file under the 2-minute limit) Repeated save -> reload keeps the speed; a new-format save is not an old save.
 * Speeds on the screen: a NEW game starts at x1 (1 game hour per real second); an OLD save keeps the speed it was saved with (its real rate does not change) until the player's first press on the speed controls, which goes to x1; then x1 / x2 / x5.
 * The real speed: the clock advances the hours per second of the label.   NODE_PATH=/opt/npm-tools/node_modules node test-speed-oldsave.js */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
(async () => {
  const b = await chromium.launch(), errs = [], ctx = await b.newContext({ viewport: { width: 412, height: 866 }, hasTouch: true, isMobile: true });
  const open = async () => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto('http://localhost:' + srv.address().port + '/?lab=1&lang=en'); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 }); await p.waitForFunction(() => { const x = document.getElementById('cu-box'); return !x || getComputedStyle(x).display === 'none'; }, null, { timeout: 90000 }); await p.waitForTimeout(400); return p; };
  const base = null;
  /* 4. repeated save -> reload: the speed, the last speed and the hours never change; a NEW save is not an old save (the first press is the normal cycle) */
  for (const start of [0.5, 1, 2.5]) {
    const ctx4 = await b.newContext({ viewport: { width: 412, height: 866 }, hasTouch: true, isMobile: true }); const q = await ctx4.newPage(); q.on('pageerror', e => errs.push(e.message));
    await q.goto('http://localhost:' + srv.address().port + '/?lab=1&lang=en'); await q.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 });
    await q.evaluate(sp => { localStorage.clear(); __lab.reset(); __lab.company.setSpeed(sp); __lab.company.setSpeed(0); __lab.save(); }, start); const trail = [];
    for (let i = 0; i < 5; i++) { await q.reload(); await q.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 }); await q.waitForTimeout(600); trail.push(await q.evaluate(() => [__lab.company.speed, __lab.company.lastSpeed, __lab.company.hours, __lab.store.cash])); await q.evaluate(() => __lab.save()); }
    ok(trail.every(t => t[0] === 0 && t[1] === start && t[2] === trail[0][2] && t[3] === trail[0][3]), 'a paused game last at ' + start + ': 5 save/reload cycles keep speed 0, last speed ' + start + ', the hours and the cash (' + JSON.stringify(trail[4]) + ')');
    await q.evaluate(() => __lab.company.resume()); const sp0 = await q.evaluate(() => __lab.company.speed); await q.locator('#eh-speed').tap(); await q.waitForTimeout(200); const sp1 = await q.evaluate(() => __lab.company.speed), OFF = [0.5, 1, 2.5];
    ok(sp0 === start && sp1 === OFF[(OFF.indexOf(start) + 1) % 3], 'a NEW-format save (speed ' + start + '): the first press is the normal cycle (' + sp0 + ' -> ' + sp1 + '), not "go to x1"'); await ctx4.close();
  }
  ok(errs.length === 0, 'no page errors: ' + errs.join(' | ')); console.log('PASS ' + n); await b.close(); srv.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
