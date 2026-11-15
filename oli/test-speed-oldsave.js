/* Speeds on the screen: a NEW game starts at x1 (1 game hour per real second); an OLD save keeps the speed it was saved with (its real rate does not change) until the player's first press on the speed controls, which goes to x1; then x1 / x2 / x5.
 * The real speed: the clock advances the hours per second of the label.   NODE_PATH=/opt/npm-tools/node_modules node test-speed-oldsave.js */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
(async () => {
  const b = await chromium.launch(), errs = [], ctx = await b.newContext({ viewport: { width: 412, height: 866 }, hasTouch: true, isMobile: true });
  const open = async () => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto('http://localhost:' + srv.address().port + '/?lab=1&lang=en'); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 }); await p.waitForFunction(() => { const x = document.getElementById('cu-box'); return !x || getComputedStyle(x).display === 'none'; }, null, { timeout: 90000 }); await p.waitForTimeout(400); return p; };
  let p = await open(); const ev = (f, a) => p.evaluate(f, a), tap = async s => { await p.locator(s).tap(); await p.waitForTimeout(150); };
  /* 1. a new game starts at x1 and really runs 1 game hour per real second */
  await ev(() => { localStorage.clear(); __lab.reset(); __lab.EU.hud(); }); await p.waitForTimeout(400);
  ok((await ev(() => __lab.company.speed)) === 0.5 && (await p.innerText('#eh-speed')) === '×1', 'a new game starts at x1 (internal 0.5, button says ×1)');
  const h0 = await ev(() => __lab.company.hours); await p.waitForTimeout(12000); const h1 = await ev(() => __lab.company.hours);
  ok(Math.abs((h1 - h0) - 12) <= 2, 'a new game at x1 runs 1 game hour per real second (' + (h1 - h0) + ' h in 12 s)');
  /* 2. old saves: every old speed is kept exactly at load, until the first press */
  await ev(() => { __lab.company.setSpeed(0.5); __lab.save && __lab.save(); }); const base = JSON.parse(await ev(() => localStorage.getItem('oli-lab-v2'))); await p.close();
  for (const sv of [0.5, 1, 2, 5, 10, 0]) {
    const sav = JSON.parse(JSON.stringify(base)); sav.eco.speed = sv; sav.eco.lastSpeed = sv > 0 ? sv : 1; sav.eco.savedAt = Date.now(); delete sav.eco.speedRef;      // an OLD save: it has no speedRef
    const ctx2 = await b.newContext({ viewport: { width: 412, height: 866 }, hasTouch: true, isMobile: true }); await ctx2.addInitScript(s => { try { if (!window.__seeded) { localStorage.setItem('oli-lab-v2', s); window.__seeded = 1; } } catch (e) { } }, JSON.stringify(sav));
    const q = await ctx2.newPage(); q.on('pageerror', e => errs.push(e.message)); await q.goto('http://localhost:' + srv.address().port + '/?lab=1&lang=en'); await q.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 }); await q.waitForTimeout(1500);
    const lab = f => q.evaluate(f), want = sv === 0 ? 'متوقف' : '×' + +(sv * 2).toFixed(2);
    ok((await lab(() => __lab.company.speed)) === sv, 'old save with speed ' + sv + ': loaded with exactly that speed');
    await q.waitForTimeout(3000); ok((await lab(() => __lab.company.speed)) === sv && (await q.innerText('#eh-speed')) === want, '  ... and it did not change by itself after 3 s (label ' + want + ')');
    const OFF = [0.5, 1, 2.5], cur0 = sv === 0 ? 1 : sv, first = cur0 === 0.5 ? 1 : 0.5;       // the first press after loading a save goes to x1 (if it is already x1 it goes to x2)
    await q.locator('#eh-speed').tap(); await q.waitForTimeout(200);
    ok((await lab(() => __lab.company.speed)) === first, '  ... first press on the speed button: ' + (cur0 === 0.5 ? 'already x1: goes to x2' : 'goes to x1') + ' (internal ' + first + ')');
    const lab3 = ['×1', '×2', '×5'], st = OFF.indexOf(first), seq = [], exp = []; for (let i = 0; i < 3; i++) { await q.locator('#eh-speed').tap(); await q.waitForTimeout(150); seq.push(await q.innerText('#eh-speed')); exp.push(lab3[(st + 1 + i) % 3]); }
    ok(seq.join() === exp.join(), '  ... then the cycle x1 -> x2 -> x5 -> x1 goes on (' + seq + ')');
    await ctx2.close();
  }
  /* 3. the label shown while an old save loads is never a wrong speed: sampled every 15 ms from the first frame */
  for (const sv of [5, 10, 0.5]) {
    const sav = JSON.parse(JSON.stringify(base)); sav.eco.speed = sv; sav.eco.lastSpeed = sv; sav.eco.savedAt = Date.now(); delete sav.eco.speedRef;
    const ctx3 = await b.newContext({ viewport: { width: 412, height: 866 }, hasTouch: true, isMobile: true });
    await ctx3.addInitScript(s => { try { if (!window.__seeded) { localStorage.setItem('oli-lab-v2', s); window.__seeded = 1; } } catch (e) { } window.__lbl = []; setInterval(() => { const e = document.getElementById('eh-speed'); if (e) window.__lbl.push(e.textContent); }, 15); }, JSON.stringify(sav));
    const q = await ctx3.newPage(); await q.goto('http://localhost:' + srv.address().port + '/?lab=1&lang=en'); await q.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 }); await q.waitForTimeout(2500);
    const seen = [...new Set(await q.evaluate(() => window.__lbl))], want = '×' + +(sv * 2).toFixed(2);
    ok(seen.every(x => x === want || x === '…'), 'old save speed ' + sv + ': labels seen while loading = ' + JSON.stringify(seen) + ' (expected ' + want + (seen.includes('…') ? '; … = nothing shown before the game is loaded' : '') + ')'); await ctx3.close();
  }
  ok(errs.length === 0, 'no page errors: ' + errs.join(' | ')); console.log('PASS ' + n); await b.close(); srv.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
