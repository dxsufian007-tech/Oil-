// Pipe route editing on a phone viewport: real touch/mouse on handles, preview, confirm, undo.   NODE_PATH=/opt/npm-tools/node_modules node test-pipe-route-edit-ui.js [shots-dir]
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const shots = process.argv[2] && path.resolve(process.argv[2]); if (shots) fs.mkdirSync(shots, { recursive: true });
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { if (!c) console.log('  FAIL ' + m); assert(c, m); n++; console.log('  ok  ' + m); };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 412, height: 866 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true }), p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message));
  const shot = async nm => { if (shots) await p.screenshot({ path: path.join(shots, nm + '.png') }); }, idle = () => p.waitForFunction(() => __wp.idle && __wp.idle(), null, { timeout: 60000 }), bar = () => p.evaluate(() => document.getElementById('buildbar').innerText);
  await p.goto('http://localhost:' + srv.address().port + '/?lab=1&lang=ar'); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 }); await p.evaluate(() => { localStorage.clear(); __lab.reset(); __lab.store.cash = 5e9; __lab.company.speed = 0; });
  const demo = await p.evaluate(() => __lab.buildDemo()); ok(demo.ok, 'the demo chain is built (' + demo.total + ' buildings)'); await p.evaluate(() => { __lab.company.setSpeed ? __lab.company.setSpeed(0) : (__lab.company.speed = 0); });
  // choose a closed line with a real corner and room
  const pick = await p.evaluate(() => { const I = OliIndustry; let best = null; for (const L of __lab.pipes.lines.values()) { if (!L.a || !L.b || L.path.length < 14) continue; const cps = I.controlPoints(L); if (cps.length >= 3 && (!best || L.path.length > best.len)) best = { id: L.id, len: L.path.length, mid: L.path[Math.floor(L.path.length / 2)] }; } return best; }); ok(!!pick, 'a line with a corner exists (' + (pick && pick.len) + ' tiles)');
  const scr = (x, y) => p.evaluate(a => { const r = document.querySelector('canvas').getBoundingClientRect(); return [r.left + __wp.sx(a[0] + .5, a[1] + .5), r.top + __wp.sy(a[0] + .5, a[1] + .5)]; }, [x, y]);
  await p.evaluate(m => __wp.goto(m[0], m[1], .9), pick.mid); await idle(); await p.waitForTimeout(500);
  let q = await scr(pick.mid[0], pick.mid[1]); await p.touchscreen.tap(q[0], q[1]); await p.waitForTimeout(400);
  ok(await p.locator('#bPipeEdit').count() === 1, 'tapping the pipe shows «🛠️ تعديل المسار» on its card'); await shot('re-01-card');
  await p.evaluate(() => document.getElementById('bPipeEdit').click()); await p.waitForTimeout(300); ok(/اسحب|المس/.test(await bar()), 'edit mode: «' + (await bar()).replace(/\n/g, ' ').slice(0, 70) + '»'); await shot('re-02-handles');
  const vol = () => p.evaluate(() => __lab.store.list().reduce((q, b) => q + (__lab.sim.ensure(b).vol || 0), 0)); const drift0 = await vol(); await p.waitForTimeout(700); const drift = Math.abs((await vol()) - drift0); console.log('  (background drift without any edit: ' + drift.toFixed(3) + ' bbl)');
  const st0 = await p.evaluate(id => { const L = __lab.pipes.lines.get(id); return { path: JSON.stringify(L.path), cash: __lab.store.cash, vol: __lab.store.list().reduce((q, b) => q + (__lab.sim.ensure(b).vol || 0), 0), n: L.path.length }; }, pick.id);
  const cp = await p.evaluate(id => { const L = __lab.pipes.lines.get(id), c = OliIndustry.controlPoints(L).filter(c => !c.end); return c.length ? c[0] : null; }, pick.id); ok(!!cp, 'the line has a movable corner handle at ' + (cp && cp.x + ',' + cp.y));
  // 1. DRAG the corner several tiles away: preview only
  await p.evaluate(c => __wp.goto(c.x, c.y, .9), cp); await idle(); await p.waitForTimeout(500);
  const from = await scr(cp.x, cp.y), to = await scr(cp.x + 4, cp.y - 5);
  await p.mouse.move(from[0], from[1]); await p.mouse.down(); await p.mouse.move((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, { steps: 4 }); await p.mouse.move(to[0], to[1], { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(300);
  const t1 = await bar(); ok(/معاينة/.test(t1) && await p.locator('#bEditOk').count() === 1, 'dragging a corner shows a PREVIEW with an approve button: «' + t1.replace(/\n/g, ' ').slice(0, 90) + '»'); await shot('re-03-preview');
  ok(await p.evaluate(a => JSON.stringify(__lab.pipes.lines.get(a[0]).path) === a[1], [pick.id, st0.path]), 'the preview changed nothing: the line is still as it was');
  // 2. approve
  await p.evaluate(() => document.getElementById('bEditOk').click()); await p.waitForTimeout(300);
  const st1 = await p.evaluate(id => { const L = __lab.pipes.lines.get(id); return { path: JSON.stringify(L.path), cash: __lab.store.cash, vol: __lab.store.list().reduce((q, b) => q + (__lab.sim.ensure(b).vol || 0), 0), same: !!L, a: L.a.b, b: L.b.b }; }, pick.id);
  ok(st1.path !== st0.path && st1.same, 'approved: the same line has a new route'); ok(Math.abs(st1.vol - st0.vol) <= drift + 1e-6, 'no oil / water was created or lost by the edit (change ' + (st1.vol - st0.vol).toFixed(3) + ' vs background drift ' + drift.toFixed(3) + ')'); ok(st1.cash <= st0.cash, 'the cost (if any) was charged: ' + Math.round(st0.cash - st1.cash)); await shot('re-04-done');
  // 3. undo
  await p.evaluate(() => document.getElementById('bEditUndo').click()); await p.waitForTimeout(300);
  const st2 = await p.evaluate(id => ({ path: JSON.stringify(__lab.pipes.lines.get(id).path), cash: __lab.store.cash }), pick.id); ok(st2.path === st0.path && Math.abs(st2.cash - st0.cash) < 1e-6 + drift, 'undo restores the route and the money exactly');
  // 4. tap a handle, then tap the new place
  const cp2 = await p.evaluate(id => OliIndustry.controlPoints(__lab.pipes.lines.get(id)).filter(c => !c.end)[0], pick.id), h2 = await scr(cp2.x, cp2.y); await p.touchscreen.tap(h2[0], h2[1]); await p.waitForTimeout(200); ok(/نقطة محددة/.test(await bar()), 'tapping a handle selects it («نقطة محددة»)');
  const g2 = await scr(cp2.x - 3, cp2.y + 4); await p.touchscreen.tap(g2[0], g2[1]); await p.waitForTimeout(300); ok(/معاينة|مسار|الرصيد|مبنى/.test(await bar()), 'tap-then-tap gives a preview or a clear refusal: «' + (await bar()).replace(/\n/g, ' ').slice(0, 80) + '»');
  await p.evaluate(() => { const b = document.getElementById('bEditNo'); if (b) b.click(); });
  // 5. delete a corner
  await p.touchscreen.tap(h2[0], h2[1]); await p.waitForTimeout(200); ok(await p.locator('#bEditDel').count() === 1, 'a selected corner offers «🗑️ حذف النقطة»'); await p.evaluate(() => document.getElementById('bEditDel').click()); await p.waitForTimeout(300); ok(/معاينة|مسار/.test(await bar()), 'deleting a point previews the straightened route (the pipe itself is not deleted)'); await p.evaluate(() => document.getElementById('bEditNo').click());
  ok(await p.evaluate(id => !!__lab.pipes.lines.get(id), pick.id), 'the pipe still exists');
  // 6. refuse: drag a corner onto a building
  await p.evaluate(c => __wp.goto(c.x + 2, c.y, .6), cp2); await idle(); await p.waitForTimeout(500);
  const bld = await p.evaluate(id => { const L = __lab.pipes.lines.get(id); const t = __lab.store.get(L.b.b); return { x: t.x, y: t.y }; }, pick.id), tb = await scr(bld.x, bld.y), h3 = await scr(cp2.x, cp2.y);
  await p.mouse.move(h3[0], h3[1]); await p.mouse.down(); await p.mouse.move(tb[0], tb[1], { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(300); const t6 = await bar(); ok(/🔴/.test(t6) && await p.locator('#bEditOk').count() === 0, 'dragging a corner onto a building is refused, no approve button: «' + t6.replace(/\n/g, ' ').slice(0, 80) + '»'); await shot('re-05-refused');
  await p.evaluate(() => document.getElementById('bEditEnd').click()); await p.waitForTimeout(300); ok(await p.evaluate(() => !__lab.state.pipeEdit), 'finish leaves edit mode');
  ok(errs.length === 0, 'no page errors ' + errs.slice(0, 2).join(' | '));
  console.log(n + ' checks'); await b.close(); srv.close();
})().catch(e => { console.log('FAILED:', e.message.split('\n')[0]); process.exit(1); });
