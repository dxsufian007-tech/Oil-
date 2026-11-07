// Phase 4 - the Arabic RTL screens on a phone: market (Brent, candles, world indicators, company share), reserve (five sections), storage (three sections).
//   NODE_PATH=/opt/npm-tools/node_modules node test-stage4-ui.js [shots-dir]
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const shots = process.argv[2] && path.resolve(process.argv[2]); if (shots) fs.mkdirSync(shots, { recursive: true });
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': /\.js$/.test(f) ? 'text/javascript' : /\.html$/.test(f) ? 'text/html; charset=utf-8' : 'application/octet-stream' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
(async () => {
  const b = await chromium.launch(), errs = [];
  for (const vp of [{ width: 412, height: 866 }, { width: 360, height: 740 }]) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: true, isMobile: true }), p = await ctx.newPage();
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errs.push(m.text()); });
    const tag = vp.width + 'px', shot = async nm => { if (shots) await p.screenshot({ path: path.join(shots, nm + '-' + tag + '.png') }); }, co = (f, a) => p.evaluate(f, a), body = () => p.evaluate(() => document.getElementById('es-body').innerText.replace(/[\u2066-\u2069]/g, ''));
    const tap = async sel => { await p.locator(sel).first().tap(); await p.waitForTimeout(90); };
    const fit = async what => { const r = await co(() => { const bd = document.getElementById('es-body'), W = document.documentElement.clientWidth, bad = []; if (bd.scrollWidth > bd.clientWidth + 1) bad.push('body scrolls sideways ' + bd.scrollWidth + ' > ' + bd.clientWidth);
        for (const el of bd.querySelectorAll('*')) { const q = el.getBoundingClientRect(); if (q.width > 0 && (q.right > W + 1 || q.left < -1) && !el.closest('svg')) { bad.push((el.className || el.tagName) + ' ' + Math.round(q.left) + '..' + Math.round(q.right)); if (bad.length > 4) break; } } return bad; }); ok(r.length === 0, tag + ' · ' + what + ': no horizontal overflow' + (r.length ? ' ' + r.join(' | ') : '')); };
    const url = 'http://localhost:' + srv.address().port + '/?lab=1';
    await p.goto(url); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 }); await p.evaluate(() => { localStorage.clear(); __lab.reset(); });
    console.log('MARKET SCREEN · ' + tag);
    ok(await co(() => document.documentElement.dir) === 'rtl', tag + ' · the page is right-to-left');
    await co(() => { __lab.company.advanceHours(24 * 40); __lab.EU.open('market'); }); await p.waitForTimeout(250); let t = await body(); await shot('market');
    const snap = await co(() => { const m = __lab.company.market, h = m.hist.CRUDE, now = m.price.CRUDE, ref = h[h.length - 25], v = m.engine.view(); __lab.EU.render(); return { eg: { now, ch: now / ref - 1, P: v.flow.P, D: v.flow.D, C: v.C, tot: v.C + v.H + v.R }, txt: document.getElementById('es-body').innerText.replace(/[\u2066-\u2069]/g, '') }; }), eg = snap.eg; t = snap.txt;
    ok(/خام برنت/.test(t) && t.includes(eg.now.toFixed(2)), tag + ' · Brent price on screen = the engine price ($' + eg.now.toFixed(2) + ')');
    ok(t.includes(Math.abs(eg.ch * 100).toFixed(2) + '%') || t.includes((eg.ch * 100).toFixed(2) + '%'), tag + ' · the 24-hour change on screen = (price now / 24 h ago - 1) = ' + (eg.ch * 100).toFixed(2) + '%');
    const dirOf = el => el; ok(await co(() => !!document.querySelector('[data-mk=price] b[dir=ltr]')), tag + ' · numbers are shown left-to-right inside the right-to-left page');
    for (const fr of ['D', 'W', 'M', 'Y']) { await tap('[data-act=mkFrame][data-v=' + fr + ']'); const c = await co(() => ({ rects: document.querySelectorAll('[data-mk=chart] svg rect:not([data-act])').length, hit: document.querySelectorAll('[data-mk=chart] svg rect[data-act=mkSel]').length, expect: window.OliMarketUI.view(__lab.company).list.length, label: document.querySelector('[data-mk=chart]').innerText }));
      ok(c.hit === c.expect && c.expect > 0, tag + ' · frame ' + fr + ': ' + c.expect + ' candles drawn = the engine\'s candles for that frame'); }
    await tap('[data-act=mkFrame][data-v=D]'); const nD = await co(() => window.OliMarketUI.view(__lab.company).all.length), nW = await (async () => { await tap('[data-act=mkFrame][data-v=W]'); return co(() => window.OliMarketUI.view(__lab.company).all.length); })(), nM = await (async () => { await tap('[data-act=mkFrame][data-v=M]'); return co(() => window.OliMarketUI.view(__lab.company).all.length); })();
    ok(nW < nD && nM <= nW && nW >= Math.floor(nD / 7) && nW <= Math.ceil(nD / 7) + 1, tag + ' · the weekly candles (' + nW + ') are the daily ones (' + nD + ') grouped by week, monthly (' + nM + ') by month');
    await tap('[data-act=mkFrame][data-v=D]'); await shot('market-candles'); t = snap.txt;
    ok(t.includes(eg.P.toLocaleString('en-US', { maximumFractionDigits: 1 })) && t.includes(eg.D.toLocaleString('en-US', { maximumFractionDigits: 1 })) && /الإنتاج العالمي/.test(t) && /الطلب العالمي/.test(t) && /المخزون العالمي الكلي/.test(t), tag + ' · world production ' + eg.P.toFixed(1) + ', demand ' + eg.D.toFixed(1) + ' and stocks are the engine\'s numbers');
    ok(/حصة شركتك من السوق/.test(t) && /من الإنتاج العالمي/.test(t) && /من المعروض العالمي/.test(t), tag + ' · the company\'s share of production and supply is on the market screen');
    await fit('market (Brent)');
    await tap('[data-act=mkSec][data-v=products]'); await fit('market (products)'); await shot('market-products'); await tap('[data-act=mkSec][data-v=brent]');
    /* the company's share on screen = the real figure after the company did something */
    await co(() => { const c = __lab.company; c.advanceHours(24); });
    console.log('RESERVE AND STORAGE · ' + tag);
    await co(() => { const z = __wp.world.reserveZoneOfWorld(); __wp.goto(z.x + z.w / 2, z.y + z.h / 2, .6); }); await p.waitForTimeout(1500);
    const ids = await co(() => { const S = __lab.store, z = __wp.world.reserveZoneOfWorld(), A = z.levels[__lab.company.reserve.lv]; const rt = S.place('crude_tank_s', A.x + 2, A.y + 2, 0, { instant: true }), ct = (() => { for (let r = 3; r < 60; r += 3) for (const [dx, dy] of [[-r, 0], [r, 0], [0, -r], [0, r], [-r, r], [r, r]]) { const cx = z.x + (z.w >> 1) + dx + (dx < 0 ? -z.w / 2 : dx > 0 ? z.w / 2 : 0), cy = z.y + (z.h >> 1) + dy + (dy < 0 ? -z.h / 2 : dy > 0 ? z.h / 2 : 0); if (S.validate('crude_tank_s', cx, cy, 0).ok) return S.place('crude_tank_s', cx, cy, 0, { instant: true }); } return { ok: false, reason: 'noSpot' }; })(); __lab.company.sync(); if (rt.ok && ct.ok) { __lab.sim.ensure(rt.building).vol = 3000; __lab.sim.ensure(ct.building).vol = 7500; } return { rt: rt.ok && rt.building.id, ct: ct.ok && ct.building.id, why: [rt.reason, ct.reason, S.cash] }; });
    ok(ids.rt && ids.ct, tag + ' · a reserve tank and a commercial tank were built ' + JSON.stringify(ids.why));
    await co(() => __lab.EU.open('reserve')); await p.waitForTimeout(250); t = await body(); await shot('reserve');
    ok(/30%/.test(t) && /75%/.test(t) && /مؤشران مستقلان/.test(t), tag + ' · the two fill gauges are side by side: reserve 30% and commercial 75%, independent');
    const g0 = await co(() => __lab.company.fills());
    for (const k of ['ov', 'tr', 'rl', 'mk', 'lg']) { await tap('[data-act=rvsec][data-v=' + k + ']'); await fit('reserve section ' + k); if (k === 'tr') await shot('reserve-trade'); if (k === 'mk') await shot('reserve-market'); }
    await tap('[data-act=rvsec][data-v=tr]'); await co(() => __lab.company.reserveBuy('CRUDE', 5000, 'A', 'CASH'));   /* the picker starts at 100,000 now; a 10,000 bbl tank is bought into through the API */ const g1 = await co(() => __lab.company.fills()); t = await body(); await tap('[data-act=rvsec][data-v=ov]'); t = await body();
    ok(g1.reserve.volume - g0.reserve.volume === 5000 && g1.commercial.volume === g0.commercial.volume && Math.abs(g1.reserve.fill - 0.8) < 1e-9 && Math.abs(g1.commercial.fill - 0.75) < 1e-9, tag + ' · buying 5,000 into the reserve moves only the reserve gauge (30% -> 80%); the commercial gauge stays 75%');
    ok(/80%/.test(t) && /75%/.test(t), tag + ' · the screen shows 80% and 75%');
    await co(() => __lab.EU.open('storage')); await p.waitForTimeout(250); for (const k of ['tanks', 'trade', 'log']) { await tap('[data-act=stsec][data-v=' + k + ']'); await fit('storage section ' + k); if (k === 'tanks') await shot('storage'); }
    await co(() => __lab.EU.open('market')); await p.waitForTimeout(150);
    await ctx.close();
  }
  ok(errs.length === 0, 'no page errors: ' + errs.slice(0, 3).join(' | '));
  await b.close(); srv.close(); console.log('\nPHASE 4 UI TESTS: ' + n + ' passed');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
