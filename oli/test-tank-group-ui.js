// Tank Group in the real game (browser simulation, NOT a real Android device): group of 3 + group of 2 + a lone tank; the light frame + label when a member is selected; the panel; save / reload restores groups and stocks.
// NODE_PATH=/opt/npm-tools/node_modules node test-tank-group-ui.js
// Auto-link of adjacent tanks inside the real game: building a tank links it to its neighbours (valves closed), says so, survives save / reload (and the connection counter with it).   NODE_PATH=/opt/npm-tools/node_modules node test-auto-link-ui.js
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 412, height: 866 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }), p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message));
  const boot = async () => { await p.goto('http://localhost:' + srv.address().port + '/?unlock=all'); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 }); };
  await boot(); await p.evaluate(() => { localStorage.clear(); __lab.reset(); __lab.company.speed = 0; __lab.store.cash = 5e8; const h = __wp.world.homeRegionOfWorld(), z = { x: h.x0 + 150, y: h.y0 + 150 }; __wp.goto(z.x - 10, z.y + 10, .7); window.__z = z; }); await p.waitForTimeout(3000);
  const spot = await p.evaluate(() => { const z = window.__z; for (let dx = -130; dx <= 130; dx += 2) for (let dy = -130; dy <= 130; dy += 2) { const ox = z.x + dx, oy = z.y + dy; if ([0, 5, 10, 15, 20, 25].every(a => __lab.store.validate('crude_tank_m', ox + a, oy, 0, { ignoreCash: true }).ok) && __lab.store.validate('crude_tank_m', ox + 31, oy, 0, { ignoreCash: true }).ok) return { x: ox, y: oy }; } return null; });
  ok(!!spot, 'a free spot for six tanks in a row was found');
  const ids = await p.evaluate(o => { const r = []; for (const [i, x] of [0, 5, 10, 20, 25, 31].entries()) { const v = __lab.store.place('crude_tank_m', o.x + x, o.y, 0, { instant: true }); if (!v.ok) return { err: v.reason }; __lab.autoLinkNote(v.building); r.push(v.building.id); } return r; }, spot);
  ok(Array.isArray(ids), 'six tanks placed (group of 3, group of 2, one lone tank)');
  const vols = [[40000, 2000, 0], [30000, 0, 0], [10000, 500, 2000], [25000, 0, 0], [5000, 100, 0], [12345, 0, 0]];
  await p.evaluate(([ids, vols]) => { ids.forEach((id, i) => { const s = __lab.sim.ensure(__lab.store.get(id)); [s.vol, s.wat, s.bv] = vols[i]; }); __lab.sim.build(); }, [ids, vols]);
  const sig = () => p.evaluate(ids => ids.map(id => { const b = __lab.store.get(id), g = __lab.sim.groupOf(b), s = __lab.sim.ensure(b); return [g ? g.members.join('.') : '-', s.vol, s.wat, s.bv]; }), ids);
  const s0 = await sig(); const groups = new Set(s0.map(x => x[0])); ok(groups.size === 3 && s0[0][0] === s0[2][0] && s0[3][0] === s0[4][0] && s0[5][0] === '-', 'groups: {1,2,3}, {4,5} and the lone tank 6');
  // the frame + label when a member is selected
  const sel = async id => { await p.evaluate(id => { __lab.state.sel = id; __wp.markDirty(); }, id); await p.waitForTimeout(500); return p.evaluate(() => __lab.groupFrame()); };
  const f1 = await sel(ids[1]); ok(f1 && f1.n === 3 && f1.volume === 80000 && f1.capacity === 3 * (await p.evaluate(id => 0 + __lab.B.DEFS[__lab.store.get(id).d].capacity.value, ids[0])) && /3 خزان/.test(f1.label), 'selecting a member frames the group: ' + (f1 && f1.label));
  await p.evaluate(o => __wp.goto(o.x + 14, o.y + 6, .9), spot); await p.waitForTimeout(900);
  { const q = await p.evaluate(id => { const b = __lab.store.get(id); return [__wp.sx(b.x + 2.5, b.y + 2.5), __wp.sy(b.x + 2.5, b.y + 2.5)]; }, ids[1]); await p.touchscreen.tap(q[0], q[1]); await p.waitForTimeout(700); const txt = await p.evaluate(() => document.getElementById('info').innerText); ok(/خزانات المجموعة/.test(txt) && /مخزون المجموعة/.test(txt) && /سعة المجموعة/.test(txt), 'tapping a tank: the card shows the group rows (tanks, capacity, stock) next to the tank own level'); await p.screenshot({ path: '/tmp/tg-frame.png' }); }
  const f2 = await sel(ids[4]); ok(f2 && f2.n === 2 && f2.volume === 30000, 'selecting a tank of the other group frames THAT group (2 tanks, 30,000 bbl)');
  const f3 = await sel(ids[5]); ok(f3 === null, 'a lone tank has no group frame');
  await p.evaluate(id => { __lab.state.sel = null; __wp.markDirty(); }, ids[0]); await p.waitForTimeout(300); ok((await p.evaluate(() => __lab.groupFrame())) === null, 'nothing selected: no frame');
  // the panel
  await p.evaluate(id => { __lab.state.sel = id; __wp.markDirty(); __lab.state.sel = id; }, ids[1]); await p.evaluate(id => document.getElementById('info').dispatchEvent(new Event('x')), 0);
  const panel = await p.evaluate(id => { const b = __lab.store.get(id); return __lab.sim.indicators(b).list.filter(x => /Group/.test(x.k)).map(x => x.k + '=' + x.v).join(',') }, ids[1]); ok(/Group Tanks=3/.test(panel) && /Group Stock=80000/.test(panel), 'panel indicators: ' + panel);
  // save + reload
  await p.evaluate(() => { __lab.save(); }); await boot(); await p.waitForTimeout(1500);
  const s1 = await sig(); ok(JSON.stringify(s1) === JSON.stringify(s0), 'after a real save + page reload: the same three groups and every tank has its own oil / water / bought oil');
  await p.evaluate(id => { __lab.state.sel = id; __wp.markDirty(); }, ids[0]); await p.waitForTimeout(500); const f4 = await p.evaluate(() => __lab.groupFrame()); ok(f4 && f4.n === 3 && f4.volume === 80000, 'the frame works on the loaded game too');
  ok(!errs.length, 'no page errors: ' + errs.join('|')); console.log('TANK GROUP UI TESTS PASSED (' + n + ' checks)'); await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
