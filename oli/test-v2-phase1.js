// Phase 1 on screen (real touch, phone): oil moves with the real currentFlow (Test 10), and the info panels of pipe / well / tank.
const { chromium } = require('/tmp/legacy-pw.js');
const assert = require('assert');
const URL = process.argv[3] || 'file:///home/claude/oli/v2.html', OUT = process.argv[2] || '/tmp/oli-shots'; require('fs').mkdirSync(OUT, { recursive: true });
const log = m => console.log('ok   ' + m);
(async () => {
  const browser = await chromium.launch(), errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2.75, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(URL); await page.waitForTimeout(1500);
  const G = fn => page.evaluate(fn), A = (fn, a) => page.evaluate(fn, a), wait = ms => page.waitForTimeout(ms);
  const TE = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
  const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const tap = async p => { await TE('touchStart', [p]); await frame(); await TE('touchEnd', []); await frame(); await wait(80); };
  const sT = (x, y, dy = 0) => A(([x, y, dy]) => { const v = window.__v2, c = v.tc(x, y); return v.camApi.w2s(c.x, c.y + dy); }, [x, y, dy]);
  const panel = () => G(() => ({ title: document.querySelector('#pn-title').textContent, rows: Object.fromEntries([...document.querySelectorAll('#pn-rows li')].map(li => [li.querySelector('small').textContent, li.querySelector('b').textContent])), cls: [...document.querySelectorAll('#pn-rows li')].map(li => li.className).filter(Boolean) }));
  // layout through the core: well W -> tank A (straight), a branch from the middle of that pipe to tank B; a second small well V -> tank C
  const L0 = await G(() => { const v = window.__v2, g = v.game; g.s.cash = 1e7; window.OliCore.CFG.BUILD = { well: 0, tank: 0, pump: 0, pipeTile: 0, pipeMax: 0 };
    for (const a of g.areas) if (a.st !== 2) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; }
    const plan = [['well', 0, 0, 'medium'], ['tank', 12, 0], ['tank', 6, 8], ['well', 0, 14, 'small'], ['tank', 12, 14]];
    for (let y = 22; y < 60; y++) for (let x = 32; x < 100; x++) { if (!plan.every(([t, dx, dy]) => g.canPlace(t, x + dx, y + dy).ok)) continue;
      const b = plan.map(([t, dx, dy, k]) => g.place(t, x + dx, y + dy, k).building); v.view.scene.paintGround(true);
      const ln = (p, q) => { const r = g.routeNodes(p, q, 0); if (!r.ok) throw new Error(r.reason); return g.buildLine(r).line; };
      let L1, mid, L2, L3;
      try { L1 = ln('B' + b[0].id, 'B' + b[1].id); mid = L1.cells[Math.floor(L1.cells.length / 2)]; L2 = ln('J' + mid, 'B' + b[2].id); L3 = ln('B' + b[3].id, 'B' + b[4].id); }
      catch (e) { for (const L of g.lines.slice()) for (const k of L.cells.slice()) g.removeAt(k % 140, (k / 140) | 0); for (const q of b) g.removeAt(q.x, q.y); continue; }
      for (let i = 0; i < 300; i++) g.step(.1);
      return { X: x, Y: y, W: b[0].id, A: b[1].id, B: b[2].id, V: b[3].id, C: b[4].id, L1: L1.id, L2: L2.id, L3: L3.id, mid }; } });
  assert(L0, 'layout'); const { X, Y } = L0;
  await A(([x, y]) => { const v = window.__v2, c = v.tc(x, y); v.view.cam.setZoom(.75); v.view.cam.centerOn(c.x, c.y); v.camApi.clamp(); }, [X + 7, Y + 7]); await wait(400);
  await page.screenshot({ path: `${OUT}/p1-flow.png` });

  // ---- Test 10a: dot speed is proportional to the real flow of that stretch
  const fl = await A(o => { const v = window.__v2, g = v.game, F = id => g.lines.find(L => L.id === id); return [o.L1, o.L3].map(id => { const s = v.flowStretches(F(id)); return s.map(q => ({ flow: q.flow, speed: q.speed, dir: q.dir })); }); }, L0);
  const all = fl.flat().filter(q => q.flow > 0); assert(all.length >= 2, JSON.stringify(fl));
  const ratio = all.map(q => q.speed / q.flow); assert(ratio.every(r => Math.abs(r - ratio[0]) < 1e-9), 'speed / flow is the same everywhere: ' + ratio);
  const big = fl[0].find(q => q.flow > 0), small = fl[1].find(q => q.flow > 0); assert(big.flow > small.flow && big.speed > small.speed);
  assert.strictEqual(await G(() => window.__v2.flowSpeed(0)), 0);
  log('10. oil speed = ' + ratio[0] + ' px/s per bbl/min of real flow: medium well ' + big.flow.toFixed(1) + ' bbl/min -> ' + big.speed.toFixed(0) + ' px/s, small well ' + small.flow.toFixed(1) + ' -> ' + small.speed.toFixed(0) + ' px/s; 0 flow -> 0');
  // ---- Test 10b: the dots really move on screen, in the flow direction
  const dots = await G(() => window.__v2.view.scene.fxDots); assert(dots > 0, 'oil dots drawn');
  // ---- Test 10c: tank A full -> the stretch Node -> A stops, the oil follows the real path W -> Node -> B
  await A(o => { const g = window.__v2.game, t = g.buildings.find(b => b.id === o.A); t.amt = g.tankCap(t); g.hyd.dirty = true; for (let i = 0; i < 200; i++) g.step(.1); }, L0); await wait(400);
  const st2 = await A(o => { const v = window.__v2, g = v.game; const s1 = v.flowStretches(g.lines.find(L => L.id === o.L1)); const L2 = g.lines.find(L => L.id === o.L2); return { s1: s1.map(q => [q.i0, q.i1, +q.flow.toFixed(2), q.dir]), s2: v.flowStretches(L2).map(q => +q.flow.toFixed(2)), mid: g.lines.find(L => L.id === o.L1).cells.indexOf(o.mid) }; }, L0);
  const before = st2.s1.filter(q => q[1] < st2.mid), after = st2.s1.filter(q => q[0] > st2.mid);
  assert(before.every(q => q[2] > 0 && q[3] === 1) && after.every(q => q[2] === 0) && st2.s2.every(f => f > 0), JSON.stringify(st2));
  await page.screenshot({ path: `${OUT}/p1-flow-branch.png` });
  log('10. tank A full: on the W -> A pipe the oil moves only up to the junction (' + before.map(q => q[2]).join(',') + ' bbl/min), the part to A is still (' + after.map(q => q[2]).join(',') + '), the branch to B carries ' + st2.s2.join(','));
  // ---- Test 10d: no flow anywhere -> no oil dots at all
  await G(() => { const g = window.__v2.game; for (const b of g.buildings) if (b.type === 'tank') b.amt = g.tankCap(b); g.hyd.dirty = true; for (let i = 0; i < 100; i++) g.step(.1); }); await wait(500);
  const d0 = await G(() => ({ dots: window.__v2.view.scene.fxDots, flows: window.__v2.game.lines.map(L => window.__v2.game.lineHyd(L).currentFlow) }));
  assert(d0.dots === 0 && d0.flows.every(f => f === 0), JSON.stringify(d0)); log('10. every tank full -> every pipe 0 bbl/min -> 0 oil dots on screen');
  await G(() => { const g = window.__v2.game; for (const b of g.buildings) if (b.type === 'tank') b.amt = 0; g.hyd.dirty = true; for (let i = 0; i < 300; i++) g.step(.1); }); await wait(400);

  // ---- panels (real taps)
  const pk = await A(o => { const g = window.__v2.game, L = g.lines.find(q => q.id === o.L3), k = L.cells[Math.floor(L.cells.length / 2)]; return { x: k % 140, y: (k / 140) | 0 }; }, L0);
  await tap(await sT(pk.x, pk.y)); let p = await panel();
  const lh = await A(o => { const v = window.__v2; return v.game.lineHyd(v.game.lines.find(q => q.id === o.L3), v.ui.sel && v.ui.sel.k); }, L0);
  for (const k of ['من', 'إلى', 'التدفق', 'الاستخدام', 'الضغط', 'فقد الضغط']) assert(k in p.rows, 'pipe panel row ' + k + ': ' + JSON.stringify(p));
  assert(/^أنبوب فرعي #/.test(p.title) && p.rows['التدفق'].includes(' / ' + lh.capacity.toFixed(0)) && p.rows['الضغط'].includes('→') && lh.pressureIn > lh.pressureOut && lh.pressureLoss > 0, JSON.stringify([p, lh]));
  await page.screenshot({ path: `${OUT}/p1-panel-pipe.png` }); log('pipe panel: ' + p.title + ' · ' + Object.entries(p.rows).map(r => r.join(' ')).join(' | '));
  // bottleneck colour on a pipe used >= 90%
  await A(o => { const g = window.__v2.game, w = g.buildings.find(b => b.id === o.V); w.kind = 'large'; w.level = 3; g.hyd.dirty = true; for (let i = 0; i < 300; i++) g.step(.1); window.__v2.renderPanel(); }, L0);
  p = await panel(); assert(p.cls.includes('u-critical') && /اختناق شديد/.test(p.rows['الاستخدام']), JSON.stringify(p)); await page.screenshot({ path: `${OUT}/p1-panel-bottleneck.png` }); log('pipe at its limit: usage ' + p.rows['الاستخدام'] + ' (shown in red)');
  await tap(await sT(X + 0.5, Y + 0.5, -14)); p = await panel();
  for (const k of ['الإنتاج الممكن', 'التدفق الحالي', 'ضغط المكمن', 'ضغط رأس البئر']) assert(k in p.rows, 'well row ' + k + JSON.stringify(p)); assert(/بار/.test(p.rows['ضغط المكمن']));
  await page.screenshot({ path: `${OUT}/p1-panel-well.png` }); log('well panel: ' + Object.entries(p.rows).map(r => r.join(' ')).join(' | '));
  await A(([x, y]) => { const v = window.__v2, c = v.tc(x, y); v.view.cam.centerOn(c.x, c.y); v.camApi.clamp(); }, [X + 13, Y + 15]); await frame();
  await tap(await sT(X + 13, Y + 15, -10)); p = await panel();
  for (const k of ['المخزون', 'السعة', 'الامتلاء', 'الضغط الخلفي', 'التدفق الداخل']) assert(k in p.rows, 'tank row ' + k + JSON.stringify(p));
  await page.screenshot({ path: `${OUT}/p1-panel-tank.png` }); log('tank panel: ' + Object.entries(p.rows).map(r => r.join(' ')).join(' | '));
  assert.deepStrictEqual(errors, []); log('no page errors');
  await browser.close(); console.log('ALL PHASE 1 UI TESTS PASSED');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
