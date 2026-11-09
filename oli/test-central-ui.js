/* Central network in the real game page: installed at first launch, drawn, panel, tap from any tile, fault toggles, save/reload, old pipes untouched */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'); let ok = 0, bad = 0; const t = (n, c, x) => { if (c) ok++; else { bad++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); } };
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); }); });
srv.listen(0, async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 412, height: 866 }, deviceScaleFactor: 1 }), p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:' + srv.address().port + '/');
  await p.waitForFunction(() => window.__lab && __lab.restored && __wp.idle(), null, { timeout: 120000 }); await p.waitForTimeout(1500);
  const S = await p.evaluate(() => { const L = __lab, cn = L.pipes.central, rep = L.company.centralReport(); return { has: !!cn, st: cn && cn.st.size, seg: cn && cn.seg.size, cash: L.store.cash, loan: rep && rep.loan, asset: rep && rep.asset, tiles: cn && cn.cen.size, stations: [...L.store.items.values()].filter(b => b.d === 'central_station').length, oldLines: L.pipes.lines.size, palette: [...document.querySelectorAll('#pal .chip')].length }; });
  t('network installed at first launch', S.has && S.st >= 29 && S.seg > 30, S); t('cash is $500M, loan = asset (100% financed)', Math.abs(S.cash - 500e6) < 5e6 && Math.abs(S.loan - S.asset) < 1 && S.asset > 4e9, S); t('stations are real buildings', S.stations === S.st, S); t('no old pipes were created', S.oldLines === 0, S);
  // go to a main line and look at it
  const pt = await p.evaluate(() => { const cn = __lab.pipes.central, g = [...cn.seg.values()].find(g => g.kind === 'main'); const q = g.path[Math.floor(g.path.length / 2)]; __wp.goto(q[0], q[1], 1.2); return q; }); await p.waitForTimeout(1200);
  await p.screenshot({ path: '/tmp/pt/cen-trunk.png' });
  const px = await p.evaluate(q => { return [__wp.sx(q[0] + .5, q[1] + .5), __wp.sy(q[0] + .5, q[1] + .5)]; }, pt); t('screen position of the trunk is on screen', px && px[0] > 0 && px[0] < 412 && px[1] > 0 && px[1] < 866, px);
  await p.mouse.click(px[0], px[1]); await p.waitForTimeout(500); const inf = await p.innerText('#info'); t('tapping the trunk shows the segment with 6 channels and a branch button', /الأنبوب المركزي/.test(inf) && /فرع هنا/.test(inf) && /نفط خام/.test(inf), inf.slice(0, 150)); await p.screenshot({ path: '/tmp/pt/cen-tap.png' });
  await p.click('#cn-here'); await p.waitForTimeout(300); t('branch plan is offered with a cost', /نقطة ربط جديدة/.test(await p.innerText('#info')));
  // panel
  await p.click('#cn-btn'); await p.waitForTimeout(400); const txt = await p.innerText('#cn-body'); t('panel lists channels, finance and the loan table', /نفط خام/.test(txt) && /وقود طائرات/.test(txt) && /جدول القرض/.test(txt) && /سماح/.test(txt), txt.slice(0, 200)); await p.screenshot({ path: '/tmp/pt/cen-panel.png' });
  await p.click('#cn-chips button[data-ch="JET_FUEL"]'); await p.click('#cn-open'); t('closing a channel from the panel reaches the engine', await p.evaluate(() => __lab.pipes.central.ch.JET_FUEL.state) === 'CLOSED'); await p.click('#cn-open'); t('and reopening', await p.evaluate(() => __lab.pipes.central.ch.JET_FUEL.state) === 'OPEN');
  await p.click('#cn-x');
  // tap any trunk tile -> segment info, tap-branch
  const r = await p.evaluate(q => { const L = __lab; const cn = L.pipes.central; L.__x = q; return { on: cn.cen.has(cn.key(q[0], q[1])) }; }, pt); t('the chosen tile is on the trunk', r.on);
  const pl = await p.evaluate(q => { const L = __lab; const cn = L.pipes.central, g = [...cn.seg.values()].find(g => g.kind === 'main'); for (let i = 3; i < g.path.length - 3; i++) { const [x, y] = g.path[i]; const pl = L.CEN.planTap(L.store, L.pipes, x, y, {}); if (pl.ok) { const n0 = cn.st.size, c0 = L.store.cash; const res = L.CEN.commitTap(L.store, L.pipes, pl, { instant: true }); return { res: res.ok, n0, n1: cn.st.size, spent: c0 - L.store.cash, seg: cn.seg.size }; } } return null; }, pt); t('tap from an arbitrary trunk tile registers a station in the graph', pl && pl.res && pl.n1 === pl.n0 + 1, pl);
  // fault
  const f = await p.evaluate(() => { const L = __lab, cn = L.pipes.central, g = [...cn.seg.values()][3]; cn.setFault(g.id, 'GAS', true); return !!g.fault.GAS; }); t('segment fault', f);
  await p.waitForTimeout(1500); await p.screenshot({ path: '/tmp/pt/cen-fault.png' });
  // save and reload
  await p.evaluate(() => __lab.save()); await p.reload(); await p.waitForFunction(() => window.__lab && __lab.restored && __wp.idle(), null, { timeout: 120000 }); await p.waitForTimeout(1000);
  const R = await p.evaluate(() => { const L = __lab, cn = L.pipes.central; return { has: !!cn, st: cn && cn.st.size, fault: cn && [...cn.seg.values()].some(g => g.fault.GAS), loan: L.company.centralReport() && L.company.centralReport().loan }; }); t('network, tapped station, fault and loan survive a restart', R.has && R.st === (S.st + 1) && R.fault && R.loan > 4e9, R);
  t('no page errors', errs.length === 0, errs);
  await b.close(); srv.close(); console.log('CENTRAL UI TESTS:', ok, 'passed,', bad, 'failed'); process.exit(bad ? 1 : 0);
});
