/* Bug (Nov 2026, from the phone): after building a junction or a pump, the info cards vanished until the game was restarted.
 * Cause: «🔗 توصيل» (opened automatically around junctions / pumps) puts the page in pipe-drawing mode, which hides the card; leaving it
 * through a bottom-bar button went through cancelAll(), which did not clear that mode.  Now every way out brings the cards back.
 *   node oli/test-cards-pipemode.js */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'); let ok = 0, bad = 0; const t = (n, c, x) => { if (c) { ok++; console.log('  ok  ' + n); } else { bad++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); } };
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : f.endsWith('.webp') ? 'image/webp' : 'application/octet-stream' }); r.end(d); }); });
srv.listen(0, async () => { const b = await chromium.launch(), p = await (await b.newContext({ viewport: { width: 412, height: 866 }, isMobile: true, hasTouch: true })).newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:' + srv.address().port + '/?unlock=all'); await p.waitForFunction(() => window.__lab && __lab.restored && __wp.idle(), null, { timeout: 120000 }); await p.waitForTimeout(800);
  const vis = () => p.evaluate(() => getComputedStyle(document.getElementById('info')).display !== 'none');
  const other = () => p.evaluate(() => { const L = __lab, s = [...L.pipes.central.st.values()][0]; L.showBuilding(s.b); });
  for (const [id, cat] of [['junction', 'pipes'], ['pump_station_s', 'oil']]) {
    await p.evaluate(() => { const s = __lab.pipes.central.st.get('N3'); __wp.goto(s.x + 6, s.y + 6, 1.3); }); await p.waitForTimeout(700);
    await p.click('#g-nav button[data-cat="' + cat + '"]'); await p.waitForTimeout(250); await p.click('#g-list .gcard[data-id="' + id + '"] button[data-act="build"]'); await p.waitForTimeout(500);
    await p.click('#bBuild'); await p.waitForTimeout(500); t(id + ': built, its card shows', await vis());
    await p.click('#bConnectAuto'); await p.waitForTimeout(300); t(id + ': while «توصيل» draws, the card steps aside', !(await vis()));
    await p.click('#g-nav button[data-cat="storage"]'); await p.waitForTimeout(250); await p.click('#g-nav button[data-cat="storage"]'); await p.waitForTimeout(250);
    await other(); await p.waitForTimeout(300); t(id + ': left through a bottom-bar button -> the next building card is visible again', await vis());
    await p.evaluate(id => { const L = __lab, x = [...L.store.items.values()].filter(q => q.d === id).pop(); L.showBuilding(x.id); }, id); await p.click('#bConnectAuto'); await p.waitForTimeout(200); await p.click('#bPipeEnd'); await p.waitForTimeout(200); await other(); await p.waitForTimeout(200);
    t(id + ': left with ✕ إنهاء -> visible too', await vis());
    await p.evaluate(() => document.body.classList.add('pipemode')); await p.waitForTimeout(700); t(id + ': a stray hidden state heals itself within a second', await vis()); }
  t('no page errors', !errs.length, errs); console.log('\n' + ok + ' passed, ' + bad + ' failed'); await b.close(); srv.close(); process.exit(bad ? 1 : 0); });
