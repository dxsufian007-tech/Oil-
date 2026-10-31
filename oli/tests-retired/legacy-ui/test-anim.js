const { chromium } = require('/tmp/legacy-pw.js');
const NEUTRAL = () => { const C = window.OliCore.CFG; C.TERRAIN.MULT = [1, 1, 1, 1]; C.BUILD = {well:0,tank:0,pipeTile:0,pipeMax:0}; C.REGIONS.forEach(r => { r.mult = 1; }); window.__oli.game.s.regions.forEach(r => { r.unlocked = true; }); };
const path = require('path');
(async () => {
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'ar' });
  const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', e => errs.push(String(e))); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto('file:///home/claude/oli/index.html'); await pg.waitForTimeout(400); await pg.evaluate(NEUTRAL); await pg.waitForTimeout(800);
  const ok = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };
  // pause the sim clock while building so we control it
  const info = await pg.evaluate(() => {
    const o = window.__oli, g = o.game; g.s.cash = 50000;
    const w = g.place('well', 20, 12), tk = g.place('tank', 25, 12);
    const r = g.buildRoute(g.routePipe(21, 12, 24, 13, false)); 
    o.cam.z = 1.1; const cx = (22 - 12.5) * 32 + 512, cy = (22 + 12.5) * 16 + 1280; o.cam.x = cx; o.cam.y = cy;
    return { w: w.ok, tk: tk.ok, r: r.ok, seg: r.segments };
  });
  console.log(info);
  await pg.waitForTimeout(150);
  const born = await pg.evaluate(() => ({ born: window.__oli.anim.born.size, fx: window.__oli.anim.fx.length }));
  ok(born.born >= 3 && born.fx >= 3, 'construction animation started: ' + JSON.stringify(born));
  await pg.screenshot({ path: '/tmp/oli-shots/a1-building.png' });
  await pg.waitForTimeout(1400);
  const s1 = await pg.evaluate(() => { const o = window.__oli, b = o.game.buildings; const w = b.find(x => x.type === 'well'), t = b.find(x => x.type === 'tank'); const wa = o.anim.wells.get(w.id); const comps = o.game.net.comps.map(c => ({ spd: c.spd, ph: c.ph, flow: c.flow })); return { born: o.anim.born.size, status: w.status, out: w.out, spd: wa.spd, ph: wa.ph, amp: wa.amp, comps, tankF: o.anim.tanks.get(t.id).f, amt: t.amt }; });
  console.log(s1);
  ok(s1.born === 0, 'construction animation finished');
  ok(s1.spd > 1 && s1.amp > .5, 'pump speed follows production (' + s1.out + ' bbl/min -> ' + s1.spd.toFixed(2) + ' rad/s)');
  ok(s1.comps.some(c => c.spd > .3 && c.ph > 0), 'oil particles moving in the connected pipe network');
  await pg.screenshot({ path: '/tmp/oli-shots/a2-running.png' });
  // pump phase advances over time
  const p0 = s1.ph; await pg.waitForTimeout(500);
  const p1 = await pg.evaluate(() => { const o = window.__oli, w = o.game.buildings.find(x => x.type === 'well'); return o.anim.wells.get(w.id).ph; });
  ok(p1 > p0 + .5, 'pump jack phase advances (' + p0.toFixed(2) + ' -> ' + p1.toFixed(2) + ')');
  // tank level eases to the real inventory, then eases down after a sale
  await pg.evaluate(() => { const o = window.__oli, t = o.game.buildings.find(x => x.type === 'tank'); t.amt = o.game.tankCap(t) * .8; });
  await pg.waitForTimeout(120);
  const mid = await pg.evaluate(() => { const o = window.__oli, t = o.game.buildings.find(x => x.type === 'tank'); return { f: o.anim.tanks.get(t.id).f, real: t.amt / o.game.tankCap(t) }; });
  ok(mid.f < mid.real - .02 && mid.f > 0, 'tank level eases up (display ' + mid.f.toFixed(2) + ' -> real ' + mid.real.toFixed(2) + ')');
  await pg.waitForTimeout(1500);
  const sale = await pg.evaluate(() => { const o = window.__oli, g = o.game, c0 = g.s.cash; const r = g.sell(g.oilTotal()); return { r, c0, c1: g.s.cash }; });
  await pg.waitForTimeout(200);
  const d = await pg.evaluate(() => { const o = window.__oli, t = o.game.buildings.find(x => x.type === 'tank'); return { f: o.anim.tanks.get(t.id).f, real: t.amt / o.game.tankCap(t), fl: document.querySelectorAll('.floater').length, cash: document.querySelector('#v-cash').textContent, cls: document.querySelector('#st-cash').className }; });
  console.log(sale, d);
  ok(d.f > d.real + .05, 'tank level eases down after a sale (display ' + d.f.toFixed(2) + ', real ' + d.real.toFixed(2) + ')');
  ok(d.fl >= 1, 'floating +$ shown after sale');
  await pg.screenshot({ path: '/tmp/oli-shots/a3-sale.png' });
  // full storage
  await pg.evaluate(() => { const o = window.__oli, t = o.game.buildings.find(x => x.type === 'tank'); t.amt = o.game.tankCap(t); });
  await pg.waitForTimeout(1200);
  const full = await pg.evaluate(() => { const o = window.__oli, t = o.game.buildings.find(x => x.type === 'tank'), w = o.game.buildings.find(x => x.type === 'well'); return { full: o.anim.tanks.get(t.id).full, wspd: o.anim.wells.get(w.id).spd, hud: document.querySelector('#st-store').className, spds: o.game.net.comps.map(c => c.spd) }; });
  console.log(full);
  ok(full.full > .9, 'full tank indicator active');
  await pg.waitForTimeout(1500);
  const stop = await pg.evaluate(() => { const o = window.__oli, w = o.game.buildings.find(x => x.type === 'well'); return { st: w.status, spd: o.anim.wells.get(w.id).spd, pipes: o.game.net.comps.map(c => c.spd) }; });
  console.log(stop);
  ok(stop.st === 'full' && stop.spd < .2 && stop.pipes.every(s => s < .1), 'pump and pipe flow stop when storage is full');
  await pg.screenshot({ path: '/tmp/oli-shots/a4-full.png' });
  // disconnected well: no pump, no flow
  const dis = await pg.evaluate(() => { const o = window.__oli, g = o.game; const w = g.place('well', 8, 20); return g.buildings.length; });
  await pg.waitForTimeout(800);
  const nd = await pg.evaluate(() => { const o = window.__oli, w = o.game.buildings.filter(x => x.type === 'well').pop(); return { st: w.status, spd: o.anim.wells.get(w.id).spd }; });
  ok(nd.spd === 0, 'unconnected well does not pump (' + nd.st + ')');
  // pause freezes animation
  await pg.evaluate(() => { const o = window.__oli; o.game.buildings.find(x => x.type === 'tank').amt = 0; o.ui.speed = 0; });
  await pg.waitForTimeout(500);
  const f1 = await pg.evaluate(() => { const o = window.__oli, w = o.game.buildings.find(x => x.type === 'well'); return o.anim.wells.get(w.id).ph; });
  await pg.waitForTimeout(400);
  const f2 = await pg.evaluate(() => { const o = window.__oli, w = o.game.buildings.find(x => x.type === 'well'); return o.anim.wells.get(w.id).ph; });
  ok(f1 === f2, 'animation freezes when the game is paused');
  // fps
  const fps = await pg.evaluate(() => new Promise(r => { let n = 0, t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 2000) r(n / 2); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
  console.log('fps (software-rendered headless phone):', fps.toFixed(0), 'dprCap', await pg.evaluate(() => document.querySelector('#view').width / document.querySelector('#view').getBoundingClientRect().width));
  ok(errs.length === 0, 'no console errors ' + errs.join('|'));
  await br.close();
})();
