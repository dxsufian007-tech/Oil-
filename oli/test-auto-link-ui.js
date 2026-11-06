// Auto-link of adjacent tanks inside the real game: building a tank links it to its neighbours (valves closed), says so, survives save / reload (and the connection counter with it).   NODE_PATH=/opt/npm-tools/node_modules node test-auto-link-ui.js
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 412, height: 866 }, hasTouch: true, isMobile: true }), p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message));
  const boot = async () => { await p.goto('http://localhost:' + srv.address().port + '/?unlock=all'); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 }); };
  await boot(); await p.evaluate(() => { localStorage.clear(); __lab.reset(); __lab.company.speed = 0; __lab.store.cash = 5e8; const z = __wp.world.reserveZoneOfWorld(); __wp.goto(z.x - 10, z.y + 10, .7); window.__z = z; }); await p.waitForTimeout(3000);
  await p.evaluate(() => { const z = window.__z; for (let dx = -70; dx <= 70; dx++) for (let dy = -30; dy <= 60; dy++) { const ox = z.x + dx, oy = z.y + dy; if ([0, 5, 10].every(a => __lab.store.validate('crude_tank_m', ox + a, oy, 0, { ignoreCash: true }).ok) && (ox + 14 < z.x - 1 || ox > z.x + z.w + 1) && !window.__o) window.__o = { x: ox, y: oy }; } });
  const O = await p.evaluate(() => window.__o); ok(!!O, 'a free spot for three tanks in a row was found');
  const build = async x => p.evaluate(([o, x]) => { const v = __lab.store.place('crude_tank_m', o.x + x, o.y, 0, { instant: true }); if (!v.ok) return { err: v.reason }; return { id: v.building.id, note: __lab.autoLinkNote(v.building), lines: __lab.pipes.lines.size }; }, [O, x]);
  const a = await build(0), bq = await build(5), c = await build(10);
  ok(a.lines === 0 && !a.note, 'the first tank: nothing to link');
  ok(bq.lines === 2 && /رُبط تلقائياً بـ 1 خزان/.test(bq.note) && /مغلقة/.test(bq.note), 'the second tank: linked to the first, the message says the valves are closed: ' + bq.note);
  ok(c.lines === 4 && /رُبط تلقائياً بـ 1 خزان/.test(c.note), 'the third tank joins at the end of the row: 4 lines in total, the first two untouched');
  const st = await p.evaluate(() => ({ open: [...__lab.pipes.lines.values()].map(l => l.open), conns: [...new Set([...__lab.pipes.lines.values()].map(l => l.conn))].length, nc: __lab.pipes.nextConn }));
  ok(st.open.every(o => o === false) && st.conns === 2, 'every line is closed, two connections');
  const again = await p.evaluate(id => __lab.autoLinkNote(__lab.store.get(id)), c.id); ok(again === '' && (await p.evaluate(() => __lab.pipes.lines.size)) === 4, 'running it again adds nothing (no duplicates)');
  await p.evaluate(() => { __lab.save(); }); await boot();
  const after = await p.evaluate(() => ({ lines: __lab.pipes.lines.size, closed: [...__lab.pipes.lines.values()].every(l => l.open === false), nc: __lab.pipes.nextConn, from: __lab.restored.from }));
  ok(after.from === 'save' && after.lines === 4 && after.closed && after.nc === st.nc, 'after save / reload: same 4 lines, all still closed, the connection counter restored (' + after.nc + ')');
  ok(!errs.length, 'no page errors: ' + errs.join('|')); console.log('AUTO-LINK UI TESTS PASSED (' + n + ' checks)'); await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
