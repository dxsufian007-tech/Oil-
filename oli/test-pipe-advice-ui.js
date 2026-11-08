// Smart pipe sizing in the real game UI (browser simulation, NOT a real device): the upgrade card, "later", "upgrade now", exact price.   NODE_PATH=/opt/npm-tools/node_modules node test-pipe-advice-ui.js [outdir]
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const OUT = process.argv[2] || '/tmp/water-shots'; fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 412, height: 866 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }), p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:' + srv.address().port + '/?unlock=all'); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 });
  await p.evaluate(() => { localStorage.clear(); __lab.reset(); __lab.company.speed = 0; __lab.store.cash = 1e9; const z = __wp.world.reserveZoneOfWorld(); __wp.goto(z.x - 10, z.y + 10, .6); window.__z = z; }); await p.waitForTimeout(2500);
  const r = await p.evaluate(() => { const L = __lab, z = window.__z; let o = null;
    for (let dx = -90; dx <= 90 && !o; dx += 2) for (let dy = -40; dy <= 70 && !o; dy += 2) { const x = z.x + dx, y = z.y + dy; if ([['crude_tank_c', 0, 0], ['pump_station_c', 14, 2]].every(a => L.store.validate(a[0], x + a[1], y + a[2], 0, {}).ok)) o = { x, y }; }
    const t = L.store.place('crude_tank_c', o.x, o.y, 0, { instant: true }).building, pu = L.store.place('pump_station_c', o.x + 14, o.y + 2, 0, { instant: true }).building;
    const q = L.I.layPipe(L.store, L.pipes, L.ts, { b: t.id, port: 'OUTPUT_E' }, { b: pu.id, port: 'INPUT_1' }, 8); window.__o = o; return { laid: q.ok !== false, dia: [...L.pipes.lines.values()][0].dia }; });
  ok(r.laid && r.dia === 8, 'a 30k line feeds the 200k central pump');
  await p.evaluate(() => { __lab.adviseUpgrade(true); }); await p.waitForTimeout(400);
  const txt = await p.evaluate(() => { const e = document.getElementById('pipeAdvice'); return e && e.style.display !== 'none' ? e.innerText.replace(/\s+/g, ' ') : null; }); ok(txt && /ترقية/.test(txt) && /\$/.test(txt), 'the upgrade card appears: ' + txt);
  await p.evaluate(() => __wp.goto(__o.x + 10, __o.y + 4, .7)); await p.waitForTimeout(800); await p.screenshot({ path: OUT + '/6-pipe-advice.png' });
  const exp = await p.evaluate(() => I = __lab.I.pipeAdvice(__lab.store, __lab.pipes)); const c0 = await p.evaluate(() => __lab.store.cash);
  await p.locator('#pipeAdvice [data-a=up]').tap(); await p.waitForTimeout(500);
  const after = await p.evaluate(() => ({ cash: __lab.store.cash, dia: [...__lab.pipes.lines.values()][0].dia, shown: document.getElementById('pipeAdvice').style.display, adv: __lab.I.pipeAdvice(__lab.store, __lab.pipes).list.length }));
  ok(after.dia === 36 && Math.abs(c0 - after.cash - exp.cost) < 1 && after.adv === 0 && after.shown === 'none', 'confirmed: the line is 300k, exactly the price difference was charged (' + Math.round(exp.cost) + '), nothing else is advised');
  ok(errs.length === 0, 'no page errors ' + errs.join('|')); console.log(n + ' checks'); await b.close(); srv.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
