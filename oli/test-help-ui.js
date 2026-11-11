/* The help sheet in the real game page (phone size): the ℹ️ of the info card opens a uniform Arabic help for what the card shows
 * (a building, a pipe, a central segment, an oil field), the build menu has its own ℹ️, the map never moves under the sheet.
 *   node oli/test-help-ui.js [shotDir] */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'); let ok = 0, bad = 0; const t = (n, c, x) => { if (c) { ok++; console.log('  ok  ' + n); } else { bad++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); } };
const SHOT = process.argv[2] || null;
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : f.endsWith('.webp') ? 'image/webp' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream' }); r.end(d); }); });
srv.listen(0, async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 412, height: 866 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }), p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:' + srv.address().port + '/');
  await p.waitForFunction(() => window.__lab && __lab.restored && __wp.idle(), null, { timeout: 120000 }); await p.waitForTimeout(1200);
  const corner = async () => { const r = await p.evaluate(() => { const e = document.getElementById('info').getBoundingClientRect(); return [e.right, e.top, e.width, e.height]; }); return [r[0] - 22, r[1] + 20]; };
  const openHelp = async () => { await p.evaluate(() => { const g = document.getElementById('g-lvl'); if (g) g.classList.remove('open'); }); const [x, y] = await corner(); await p.mouse.click(x, y); await p.waitForTimeout(300); return p.evaluate(() => { const h = document.getElementById('hlp'); return { open: h.classList.contains('open'), title: (h.querySelector('.hd b') || {}).textContent || '', secs: [...h.querySelectorAll('details summary')].map(s => s.textContent.trim()), text: h.textContent.replace(/[\u2066-\u2069]/g, '') }; }); };
  const close = async () => { await p.click('#hlp-x'); await p.waitForTimeout(150); };

  await p.evaluate(() => { __lab.company.speed = 0; });       // paused: the live numbers stay still while they are compared
  // 1. a central station (a real building of the current game)
  await p.evaluate(() => { const L = __lab, s = [...L.pipes.central.st.values()][0], bd = L.store.get(s.b); __wp.goto(bd.x + 1, bd.y + 1, 1.4); L.showBuilding(bd.id); }); await p.waitForTimeout(500);
  let h = await openHelp(); t('1a tapping the ℹ️ of a building card opens the help sheet', h.open, h);
  t('1b the sheet is for THAT building and has the 12 sections in order', /محطة ربط مركزية/.test(h.title) && h.secs.length === 12 && /وظيفة المعدة/.test(h.secs[0]) && /مثال عملي/.test(h.secs[11]), h.secs);
  t('1c it explains the six channels and the live state', /ست قنوات/.test(h.text) && /الحالة/.test(h.text), h.text.slice(0, 200));
  if (SHOT) await p.screenshot({ path: path.join(SHOT, 'help-station.png') });
  const cam0 = await p.evaluate(() => [__wp.cam.x, __wp.cam.y, __wp.cam.z]); await p.mouse.move(206, 500); await p.mouse.down(); await p.mouse.move(120, 300, { steps: 6 }); await p.mouse.up(); const cam1 = await p.evaluate(() => [__wp.cam.x, __wp.cam.y, __wp.cam.z]);
  t('1d dragging on the open sheet never moves the map', JSON.stringify(cam0) === JSON.stringify(cam1), [cam0, cam1]);
  await p.click('#hlp details[data-k="cost"] summary'); await p.waitForTimeout(1300); t('1e a section the player opened stays open through the live refresh', await p.evaluate(() => document.querySelector('#hlp details[data-k="cost"]').open));
  await close(); t('1f ✕ closes it', !(await p.evaluate(() => document.getElementById('hlp').classList.contains('open'))));
  const plain = await p.evaluate(() => { const r = document.getElementById('info').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height - 10]; }); await p.mouse.click(plain[0], plain[1]); await p.waitForTimeout(200);
  t('1g a tap elsewhere on the card does NOT open the help', !(await p.evaluate(() => document.getElementById('hlp').classList.contains('open'))));

  // 2. a placed crude tank: live fill and room left
  let tk = null, why = [];
  for (let k = 0; k < 12 && !tk; k++) {
    await p.evaluate(k => { const s = [...__lab.pipes.central.st.values()][k]; __wp.goto(s.x, s.y, 1.2); }, k); await p.waitForFunction(() => __wp.idle(), null, { timeout: 30000 }); await p.waitForTimeout(400);
    tk = await p.evaluate(({ k, why }) => { const L = __lab, s = [...L.pipes.central.st.values()][k]; for (let d = 5; d < 30; d++) for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, -d]]) { const x = s.x + dx, y = s.y + dy, v = L.store.validate('crude_tank_s', x, y, 0, { ignoreCash: true }); if (v.ok) { const r = L.store.place('crude_tank_s', x, y, 0, { instant: true }); if (r.ok) { L.sim.ensure(r.building).vol = 9800; __wp.goto(x + 1, y + 1, 1.4); L.showBuilding(r.building.id); return r.building.id; } } } return null; }, { k, why });
  }
  t('2a a crude tank was placed on the real map', !!tk); await p.waitForTimeout(400);
  h = await openHelp(); const tv = await p.evaluate(id => { const b = __lab.store.get(id); return Math.round(10000 - b.s.vol).toLocaleString('en-US'); }, tk);
  t('2b tank help: capacity 10,000 and the live room left (' + tv + ')', h.open && /10,000/.test(h.text) && h.text.includes('المتبقي ' + tv), h.text.slice(0, 400));
  await close(); await p.evaluate(() => { const L = __lab, s = [...L.pipes.central.st.values()][0]; L.showBuilding(s.b); }); await p.waitForTimeout(300); await p.evaluate(() => { const g = document.getElementById('g-lvl'); if (g && g.classList.contains('open')) g.classList.remove('open'); });
  await openHelp(); await p.evaluate(() => __lab.pipes.central.setChannel('GASOLINE', 'CLOSED')); await p.waitForTimeout(1200); h = await p.evaluate(() => document.getElementById('hlp').textContent.replace(/[\u2066-\u2069]/g, ''));
  t('2c the open sheet follows the live state: closing the gasoline channel shows «قناة بنزين مغلقة» + the fix within a second', /قناة بنزين مغلقة/.test(h) && /افتحها/.test(h), h.slice(0, 300)); await p.evaluate(() => __lab.pipes.central.setChannel('GASOLINE', 'OPEN'));
  if (SHOT) await p.screenshot({ path: path.join(SHOT, 'help-tank.png') }); await close();

  // 3. a central trunk segment (tap on the trunk, then the ℹ️)
  const pt = await p.evaluate(() => { const cn = __lab.pipes.central, g = [...cn.seg.values()].find(g => g.kind === 'main'); const q = g.path[Math.floor(g.path.length / 2)]; __wp.goto(q[0], q[1], 1.2); return q; }); await p.waitForTimeout(900);
  await p.evaluate(q => __lab.CUI.tap(q[0], q[1]), pt); await p.waitForTimeout(300);
  await p.evaluate(() => { const g = document.getElementById('g-lvl'); if (g) g.classList.remove('open'); }); if (SHOT) await p.screenshot({ path: path.join(SHOT, 'seg-card.png') }); if (0) console.log('dbg', JSON.stringify(await p.evaluate(() => { const r = document.getElementById('info').getBoundingClientRect(), c = document.getElementById('cn-btn').getBoundingClientRect(); return { info: [r.left, r.top, r.right, r.bottom], cn: [c.left, c.top, c.right, c.bottom], hk: document.getElementById('info').dataset.hk, el: document.elementFromPoint(r.right - 22, r.top + 20).id }; })));
  h = await openHelp(); t('3a the ℹ️ of a central segment opens the segment help (channels, 300,000 per channel)', h.open && /الأنبوب المركزي/.test(h.title) && /300,000/.test(h.text), h.title); await close();

  // 4. the build menu: every card has its own ℹ️ (help before building)
  await p.click('#g-nav button[data-cat="process"]'); await p.waitForTimeout(400);
  const n = await p.evaluate(() => document.querySelectorAll('#g-list button[data-act="help"]').length); t('4a every card of the processing menu has a ℹ️ help button', n >= 5, n);
  await p.click('#g-list .gcard[data-id="refinery_s"] button[data-act="help"]'); await p.waitForTimeout(300);
  h = await p.evaluate(() => { const e = document.getElementById('hlp'); return { open: e.classList.contains('open'), text: e.textContent.replace(/[\u2066-\u2069]/g, '') }; });
  t('4b refinery help before building: inputs incl. chemicals per barrel, yields, zone D', h.open && /0.36 كغ لكل برميل/.test(h.text) && /45 بنزين/.test(h.text) && /القطاع D|التكرير والمعالجة/.test(h.text), h.text.slice(0, 300));
  if (SHOT) await p.screenshot({ path: path.join(SHOT, 'help-refinery-def.png') }); await close();

  t('no page errors', !errs.length, errs);
  console.log('\n' + ok + ' passed, ' + bad + ' failed'); await b.close(); srv.close(); process.exit(bad ? 1 : 0);
});
