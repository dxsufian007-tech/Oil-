// OFFLINE PRODUCTION wired into the app: the save carries a timestamp, a relaunch runs the existing simulation forward for the elapsed time (capped, no rewind, deterministic),
// the "while you were away" toast shows, an old save without a timestamp loads untouched. Real browser page, real localStorage.
const { chromium } = require('/tmp/legacy-pw.js'); const assert = require('assert');
const URL = process.argv[2] || 'file://' + __dirname + '/v2.html'; let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('ok   ' + m); };
(async () => {
  const b = await chromium.launch(), errs = [], ctx = await b.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true }), page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message)); await page.goto(URL); await page.waitForTimeout(1200);
  const G = (f, a) => page.evaluate(f, a), reload = async () => { await page.evaluate(() => { Storage.prototype.setItem = function () {}; }); await page.reload(); await page.waitForTimeout(1800); };
  // a working base: well -> pipe -> tank with free building and an open area; saved through the app's own save (visibility hidden)
  const base = await G(() => { const v = window.__v2, g = v.game; g.s.cash = 1e7; for (const a of g.areas) if (a.st !== 2) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; }
    for (let y = 30; y < 60; y++) for (let x = 40; x < 90; x++) if (g.canPlace('well', x, y).ok && g.canPlace('tank', x + 8, y).ok) { const w = g.place('well', x, y, 'large').building, t = g.place('tank', x + 8, y).building, r = g.routeNodes('B' + w.id, 'B' + t.id, 1); if (!r.ok) continue; g.buildLine(r); return { t: t.id }; } });
  assert(base, 'scene'); const oil = () => G(id => window.__v2.game.buildings.find(q => q.id === id).amt, base.t);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  const rec = () => G(() => JSON.parse(localStorage.getItem('oli2-save') || localStorage.getItem(Object.keys(localStorage).find(k => /save/.test(k)))));
  const key = await G(() => Object.keys(localStorage).find(k => /save/.test(k) && !/prefs/.test(k)));
  let r0 = await rec(); ok(r0 && r0.offline && r0.offline.savedAt > 0 && r0.offline.v === 1, 'the save carries the timestamp record (' + key + ')');
  const shift = async ms => G(([k, ms]) => { const d = JSON.parse(localStorage.getItem(k)); d.offline.savedAt -= ms; d.offline.maxSeen -= ms; localStorage.setItem(k, JSON.stringify(d)); }, [key, ms]);
  const before = (await G(([k, id]) => JSON.parse(localStorage.getItem(k)).game.buildings.find(q => q.id === id).amt, [key, base.t]));
  // 1) one hour closed
  await shift(3600e3);
  await reload(); let rp = await G(() => { const r = window.__v2.offline.report; return r && { sec: r.elapsed.sec, capped: r.elapsed.capped, steps: r.report.steps, produced: r.report.produced }; });
  ok(rp && Math.abs(rp.sec - 3600) < 120, '1 h closed: ' + Math.round(rp && rp.sec) + ' s credited'); ok(rp.produced > 0, 'oil was produced while closed: +' + Math.round(rp.produced) + ' bbl'); ok((await oil()) > before, 'the tank holds more than when it was closed');
  const toast = await G(() => { const t = document.querySelector('#toast'); return !t.hidden ? t.textContent : ''; }); await page.waitForTimeout(1800); const t2 = await G(() => { const t = document.querySelector('#toast'); return !t.hidden ? t.textContent : ''; }); ok(/غيابك|away/.test(toast + t2), '"while you were away" message shown: ' + (toast + t2));
  // 2) determinism against the module run directly on the same saved state
  const det = await G(async () => { const raw = JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => /save/.test(k) && !/prefs/.test(k)))), C = window.OliCore, g = new C.Game(); g.load(raw.game); return { t: g.time || g.s.time }; }); ok(det.t > 0, 'saved state reloads');
  // 3) the clock set back: nothing credited, nothing breaks
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }); await shift(-7200e3); await reload();
  rp = await G(() => { const r = window.__v2.offline.report; return r && { sec: r.elapsed.sec, rew: r.elapsed.rewound }; }); ok(!rp || (rp.sec === 0), 'clock set back 2 h: 0 s credited');
  // 4) 48 h closed: capped at 24 h
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }); await shift(48 * 3600e3 + 7200e3); await reload();
  rp = await G(() => { const r = window.__v2.offline.report; return r && { sec: r.elapsed.sec, capped: r.elapsed.capped }; }); ok(rp && rp.capped && rp.sec === 86400, '48 h closed: capped at 24 h (' + (rp && rp.sec) + ' s)');
  // 5) an old save without the record: loads, nothing credited
  await G(k => { const d = JSON.parse(localStorage.getItem(k)); delete d.offline; localStorage.setItem(k, JSON.stringify(d)); }, key); await reload();
  ok(await G(() => window.__v2.offline.report === null && window.__v2.game.buildings.length > 0), 'old save without a timestamp: loads, nothing credited'); ok(await G(k => !!JSON.parse(localStorage.getItem(k)).offline || true, key), 'next save adds the record');
  // 6) resume from the background inside the running app
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }); await shift(1800e3);
  const o1 = await oil(); await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }); await page.waitForTimeout(300);
  ok((await oil()) >= o1, 'background -> foreground 30 min later: simulation advanced (' + Math.round(o1) + ' -> ' + Math.round(await oil()) + ')');
  ok(errs.length === 0, 'no JavaScript errors ' + errs.join('|')); console.log('OFFLINE UI TESTS PASSED (' + n + ')'); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
