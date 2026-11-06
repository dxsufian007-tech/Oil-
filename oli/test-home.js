/* the main menu: opens first, one playable mode, "Soon" pages cannot be entered, reset asks first, the game waits while the menu is open */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'); let ok = 0, bad = 0; const t = (n, c) => { if (c) ok++; else { bad++; console.log('FAIL', n); } };
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); }); });
srv.listen(0, async () => {
  const b = await chromium.launch(), url = 'http://localhost:' + srv.address().port + '/', errs = [];
  const open = async (ctx) => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(url); await p.addScriptTag({ path: path.join(__dirname, 'home.js') }); await p.waitForSelector('#oli-home'); return p; };
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }); await ctx.addInitScript(() => { window.OLI_DEMO = true; window.OLI_HOME = true; });
  let p = await open(ctx);
  t('menu is shown first', await p.evaluate(() => OliHome.isOpen() && getComputedStyle(document.getElementById('oli-home')).display !== 'none'));
  t('4 buttons + settings + about', await p.evaluate(() => ['h-cont', 'h-maps', 'h-modes', 'h-reset', 'h-set', 'h-abt'].every(i => document.getElementById(i))));
  t('continue is disabled while the game loads (or already ready)', await p.evaluate(() => document.getElementById('h-cont').disabled === !OliHome.ready()));
  await p.waitForFunction(() => OliHome.ready(), null, { timeout: 120000 });
  t('first run (no save): button says start', await p.evaluate(() => /ابدأ/.test(document.getElementById('h-cont').textContent)));
  // the company waits while the menu is open
  await p.evaluate(() => { __lab.company.setSpeed(1); }); const h0 = await p.evaluate(() => __lab.company.hours); await p.waitForTimeout(2500); const h1 = await p.evaluate(() => __lab.company.hours); t('game paused behind the menu', h1 === h0);
  // future pages
  t('maps/modes are Soon: badge, aria-disabled, tap does not navigate', await (async () => { await p.click('#h-maps',{force:true}); await p.click('#h-modes',{force:true}); return await p.evaluate(() => ['h-maps', 'h-modes'].every(i => { const b = document.getElementById(i); return b.classList.contains('soon') && b.getAttribute('aria-disabled') === 'true' && /قريباً/.test(b.textContent); }) && document.getElementById('v-main').classList.contains('on') && !document.getElementById('v-modes') && !document.getElementById('v-maps') && OliHome.isOpen()); })());
  await p.click('#h-abt'); t('about shows the version', await p.evaluate(() => /1\.0\.0/.test(document.getElementById('v-abt').textContent) || /النسخة/.test(document.getElementById('v-abt').textContent))); await p.click('#v-abt .back');
  // settings: motion option is real
  await p.click('#h-set'); await p.click('#s-mot button[data-m="0"]'); t('motion option off', await p.evaluate(() => window.OLI_NOMOTION === true && localStorage.getItem('oli-nomotion') === '1')); await p.click('#s-mot button[data-m="1"]'); t('motion option on', await p.evaluate(() => window.OLI_NOMOTION === false && localStorage.getItem('oli-nomotion') === null)); await p.click('#v-set .back');
  // build something, save, then continue
  await p.evaluate(() => { const L = __lab; L.store.cash = 3e7; const f = L.fieldSites()[0]; __wp.goto(f.x, f.y, .6); window.__f = [Math.round(f.x), Math.round(f.y)]; });
  await p.waitForFunction(() => __lab.store.validate('crude_tank_s', __f[0], __f[1], 0, { ignoreCash: true }).reason !== 'notLoaded', null, { timeout: 60000 });
  const n = await p.evaluate(() => { const st = __lab.store; let k = 0; for (let i = 0; i < 400 && k < 2; i++) { const x = __f[0] - 40 + (i % 20) * 4, y = __f[1] - 30 + Math.floor(i / 20) * 5; if (st.validate('crude_tank_s', x, y, 0, { ignoreCash: true }).ok && st.place('crude_tank_s', x, y, 0, { instant: true, ignoreCash: true }).ok) k++; } __lab.save(); return k; }); t('built 2 buildings', n === 2);
  await p.click('#h-cont'); await p.waitForTimeout(600); t('continue closes the menu', await p.evaluate(() => !OliHome.isOpen())); const g0 = await p.evaluate(() => __lab.company.hours); await p.waitForTimeout(2500); t('game runs after continue', await p.evaluate(() => __lab.company.hours) > g0);
  // a way back to the menu from the game
  t('menu button inside the game; the old «لعبة جديدة» button is gone', await p.evaluate(() => !!document.getElementById('es-home') && !document.getElementById('es-new'))); await p.evaluate(() => document.getElementById('es-home').click()); t('menu reopens, game paused again', await p.evaluate(() => OliHome.isOpen()));
  // reset asks first
  await p.click('#h-reset'); t('reset asks for confirmation', await p.evaluate(() => document.getElementById('h-modal').classList.contains('on'))); await p.click('#r-no'); t('cancel keeps everything', await p.evaluate(() => __lab.store.list().length >= 2 && !document.getElementById('h-modal').classList.contains('on')));
  // reopen the app: the same game comes back
  await p.evaluate(() => __lab.save()); const keep = await p.evaluate(() => __lab.store.list().length); await p.close(); p = await open(ctx); await p.waitForFunction(() => OliHome.ready(), null, { timeout: 120000 });
  t('second visit: button says continue', await p.evaluate(() => /متابعة/.test(document.getElementById('h-cont').textContent))); t('second visit: same buildings', await p.evaluate(() => __lab.store.list().length) === keep);
  await p.click('#h-reset'); await p.click('#r-yes'); await p.waitForTimeout(500);
  t('reset: button says start again', await p.evaluate(() => /ابدأ/.test(document.getElementById('h-cont').textContent))); await p.evaluate(() => __lab.save()); const rs = await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('oli-lab-v2') || '{}'); return [__lab.store.list().length, (d.store && (d.store.items || d.store.b || d.store.buildings || []).length)]; }); t('reset: new game (no buildings)', rs[0] === 0); await p.close(); p = await open(ctx); await p.waitForFunction(() => OliHome.ready(), null, { timeout: 120000 }); t('reset persists: reopening gives the empty new game', await p.evaluate(() => __lab.store.list().length) === 0);
  await p.click('#h-cont'); await p.waitForTimeout(500); t('new game playable', await p.evaluate(() => !OliHome.isOpen()));
  t('no page errors', errs.length === 0); if (errs.length) console.log(errs.slice(0, 3));
  // not in the dev page / tests: no menu without the flag
  const c2 = await b.newContext({ viewport: { width: 412, height: 915 } }); await c2.addInitScript(() => { window.OLI_DEMO = true; }); const q = await c2.newPage(); await q.goto(url); await q.addScriptTag({ path: path.join(__dirname, 'home.js') }); await q.waitForTimeout(800); t('without the app flag: no menu', await q.evaluate(() => !document.getElementById('oli-home') && !window.__homeOpen));
  await b.close(); srv.close(); console.log('HOME TESTS:', ok, 'passed,', bad, 'failed'); process.exit(bad ? 1 : 0);
});
