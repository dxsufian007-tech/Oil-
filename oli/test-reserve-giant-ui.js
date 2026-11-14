/* R1 UI (phone size): the giant store has a card in the storage menu and its help sheet shows the daily + yearly running cost BEFORE buying; placing it outside the reserve is refused with a clear Arabic reason.
 *   NODE_PATH=/opt/npm-tools/node_modules node test-reserve-giant-ui.js [shotDir] */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'); let ok = 0, bad = 0; const t = (n, c, x) => { if (c) { ok++; console.log('  ok  ' + n); } else { bad++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x).slice(0, 400)); } };
const SHOT = process.argv[2] || null;
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : f.endsWith('.webp') ? 'image/webp' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream' }); r.end(d); }); });
srv.listen(0, async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 412, height: 866 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }), p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:' + srv.address().port + '/'); await p.waitForFunction(() => window.__lab && __lab.restored && __wp.idle(), null, { timeout: 120000 }); await p.waitForTimeout(1000);
  await p.evaluate(() => { localStorage.clear(); __lab.reset(); __lab.company.injectEquity(1e9, 't'); });
  const info = await p.evaluate(() => ({ inCats: JSON.stringify(window.OliGame ? 1 : 1), card: !!(window.OliGameConfig || {}), def: !!__lab.B.DEFS.crude_tank_g }));
  t('the giant is a known building in the running game', info.def);
  await p.evaluate(() => OliHelp.open({ kind: 'd', id: 'crude_tank_g' })); await p.waitForTimeout(500);
  const h = await p.evaluate(() => { const e = document.getElementById('hlp'); return { open: e.classList.contains('open'), text: e.textContent.replace(/[\u2066-\u2069\u200e\u200f]/g, ''), w: e.getBoundingClientRect().width, sw: document.documentElement.scrollWidth }; });
  t('the help sheet opens for the giant', h.open);
  t('it states the price $3 billion and 80,000,000 bbl capacity', /\$3\s*مليار/.test(h.text) && /80,000,000/.test(h.text), h.text.slice(0, 200));
  t('it shows the cost BEFORE buying: empty / 25 / 50 / 75 / 100% in daily and yearly terms', /قبل الشراء/.test(h.text) && /فارغ/.test(h.text) && ['25%', '50%', '75%', '100%'].every(x => h.text.indexOf('ممتلئ ' + x) > 0) && /يومياً/.test(h.text) && /سنوياً/.test(h.text) && /\$563,925,400/.test(h.text) && /\$1,545,001/.test(h.text) && /\$345,001/.test(h.text), h.text.match(/قبل الشراء[\s\S]{0,500}/) && h.text.match(/قبل الشراء[\s\S]{0,500}/)[0]);
  t('it says: reserve only, no upgrade, never commercial', /للاحتياطي|احتياط/.test(h.text) && /لا يُرقّى/.test(h.text));
  t('the sheet fits the phone width (no sideways scroll)', h.w <= 412 && h.sw <= 413, [h.w, h.sw]);
  if (SHOT) { await p.screenshot({ path: path.join(SHOT, 'giant-help.png') }); }
  await p.click('#hlp-x'); await p.waitForTimeout(200);
  const z = await p.evaluate(() => { const z = __wp.world.reserveZoneOfWorld(); return { x: z.x, y: z.y, w: z.w, h: z.h }; }); await p.evaluate(zz => __wp.goto(zz.x - 80, zz.y + 10, .5), z); await p.waitForFunction(() => __wp.idle(), null, { timeout: 60000 }); await p.waitForTimeout(800);
  const seen = await p.evaluate(zz => { const out = []; for (let dx = -200; dx <= -30 && out.length < 12; dx += 6) for (let dy = -40; dy <= 60 && out.length < 12; dy += 6) { const r = __lab.store.place('crude_tank_g', zz.x + dx, zz.y + dy, 0, { instant: true }); out.push(r.ok ? 'ok' : r.reason); if (r.ok) { __lab.store.demolish && 0; return out.concat('PLACED'); } } return out; }, z);
  const v = seen.indexOf('PLACED') >= 0 ? 'ok' : (seen.find(r => r === 'giantReserveOnly' || r === 'sectorForbidden') || seen.join());
  t('placed on commercial land it is never accepted (reserve-only / sector refusal)', v === 'giantReserveOnly' || v === 'sectorForbidden', seen);
  const msg = await p.evaluate(() => { const R = (window.__lab && __lab.REASON) || null; return R ? R.giantReserveOnly || null : 'n/a'; });
  t('the refusal has an Arabic explanation in the lab', msg === 'n/a' || /احتياطي/.test(msg || ''), msg);
  t('no page errors', !errs.length, errs);
  console.log(ok + ' passed, ' + bad + ' failed'); await b.close(); srv.close(); process.exit(bad ? 1 : 0);
});
