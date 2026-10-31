const { chromium } = require('/tmp/legacy-pw.js');
const NEUTRAL = () => { const C = window.OliCore.CFG; C.TERRAIN.MULT = [1, 1, 1, 1]; C.BUILD = {well:0,tank:0,pipeTile:0,pipeMax:0}; C.REGIONS.forEach(r => { r.mult = 1; }); window.__oli.game.s.regions.forEach(r => { r.unlocked = true; }); };
(async () => {
  const br = await chromium.launch({ args: ['--js-flags=--expose-gc'] });
  const ctx = await br.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', e => errs.push(String(e))); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto('file:///home/claude/oli/index.html'); await pg.waitForTimeout(400); await pg.evaluate(NEUTRAL); await pg.waitForTimeout(600);
  const cdp = await ctx.newCDPSession(pg); await cdp.send('Performance.enable');
  const snap = async () => {
    await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage');
    const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
    const s = await pg.evaluate(() => { const o = window.__oli; return { born: o.anim.born.size, fx: o.anim.fx.length, wells: o.anim.wells.size, tanks: o.anim.tanks.size, seenB: o.anim.seenB.size, floaters: document.querySelectorAll('.floater').length, toasts: document.querySelectorAll('.toast').length, b: o.game.buildings.length }; });
    return { heapMB: +(m.JSHeapUsedSize / 1048576).toFixed(2), listeners: m.JSEventListeners, nodes: m.Nodes, ...s };
  };
  const ok = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };
  const cycle = async n => { for (let i = 0; i < n; i++) {
    await pg.evaluate(i => { const o = window.__oli, g = o.game; g.s.cash = 1e6; o.ui.speed = 10;
      const x = 6 + (i % 8) * 4, y = 6 + ((i / 8 | 0) % 4) * 5;
      g.place('well', x, y); g.place('tank', x + 4, y); g.buildRoute(g.routePipe(x + 1, y, x + 3, y, false));
      g.sell(g.oilTotal()); }, i);
    await pg.waitForTimeout(250);
    await pg.evaluate(i => { const g = window.__oli.game; const x = 6 + (i % 8) * 4, y = 6 + ((i / 8 | 0) % 4) * 5; g.removeAt(x, y); g.removeAt(x + 4, y); for (let k = 1; k <= 3; k++) g.removeAt(x + k, y); }, i);
    await pg.waitForTimeout(100);
  } };
  await cycle(10); await pg.waitForTimeout(1500); const a = await snap(); console.log('after 10 cycles', a);
  await cycle(60); await pg.waitForTimeout(1500); const b = await snap(); console.log('after 70 cycles', b);
  ok(b.born === 0 && b.fx === 0, 'no leftover construction animation entries (born ' + b.born + ', fx ' + b.fx + ')');
  ok(b.wells === b.seenB - b.tanks && b.wells + b.tanks === b.b, 'animation maps match live buildings (' + b.wells + ' wells, ' + b.tanks + ' tanks, ' + b.b + ' buildings)');
  ok(b.listeners <= a.listeners + 2, 'event listeners do not grow (' + a.listeners + ' -> ' + b.listeners + ')');
  ok(b.nodes <= a.nodes + 20, 'DOM nodes do not grow (' + a.nodes + ' -> ' + b.nodes + ')');
  ok(b.heapMB < a.heapMB + 3, 'heap does not grow (' + a.heapMB + ' -> ' + b.heapMB + ' MB)');
  ok(b.floaters <= 4 && b.toasts <= 6, 'floaters/toasts are cleaned up (' + b.floaters + '/' + b.toasts + ')');
  // pause: the sim and every animation clock freeze, only camera/render stays responsive
  await pg.evaluate(() => { const g = window.__oli.game; for (const a of window.__oli.game.areas) if (a.land && a.st !== 2) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 18000; a.potential = 90; } g.s.cash = 1e6; g.place('well', 12, 24); g.place('tank', 16, 24); g.buildRoute(g.routePipe(13, 24, 15, 24, false)); window.__oli.ui.speed = 1; });
  await pg.waitForTimeout(1500);
  await pg.evaluate(() => { window.__oli.ui.speed = 0; }); await pg.waitForTimeout(300);
  const grab = () => pg.evaluate(() => { const o = window.__oli; return { time: o.game.s.time, amt: o.game.oilTotal(), ph: [...o.anim.wells.values()].map(a => a.ph), cph: o.game.net.comps.map(c => c.ph), price: o.game.s.price }; });
  const p1 = await grab(); await pg.waitForTimeout(1200); const p2 = await grab();
  ok(JSON.stringify(p1) === JSON.stringify(p2), 'paused: sim time, inventory, price, pump and pipe phases are frozen');
  const fr = await pg.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 1000) r(n); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
  console.log('rAF while paused (frames/s):', fr);
  const live = await pg.evaluate(() => { const o = window.__oli; return [o.anim.wells.size, o.anim.tanks.size, o.game.buildings.filter(b => b.type === 'well').length, o.game.buildings.filter(b => b.type === 'tank').length]; });
  ok(live[0] === live[2] && live[1] === live[3] && live[0] === 1, 'animation state matches live buildings: ' + live.join(','));
  // drag does not build, then tap builds only after confirm
  await pg.evaluate(() => { window.__oli.ui.speed = 1; window.__oli.setTool('well'); });
  const before = await pg.evaluate(() => window.__oli.game.buildings.length);
  await pg.mouse.move(100, 300); await pg.touchscreen.tap(1, 1).catch(() => {});
  await pg.evaluate(() => { window.__oli.ui.pending = null; });
  const cdp2 = await ctx.newCDPSession(pg);
  const touch = (type, x, y) => cdp2.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await touch('touchStart', 200, 400); for (let i = 1; i <= 8; i++) await touch('touchMove', 200 - i * 15, 400 - i * 8); await touch('touchEnd');
  await pg.waitForTimeout(200);
  const after = await pg.evaluate(() => ({ n: window.__oli.game.buildings.length, pend: !!window.__oli.ui.pending }));
  console.log('AFTER', JSON.stringify(after), before);
  ok(after.n === before && after.pend, 'dragging in build mode moves the preview and builds nothing (new rule: no camera pan while placing)');
  ok(errs.length === 0, 'no JavaScript errors ' + errs.join(' | '));
  await br.close();
})();
