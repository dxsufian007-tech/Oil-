// The new inline pump picture sits ON the pipe: along the pipe axis there is no gap on either side, the pipe meets the pump on the same axis.
// Builds well -> pipe -> tank lines (main and branch pipe, along x and along y), puts a pump on each, takes screenshots at several zooms and
// writes the points of the pipe axis; check-pump-art.py then verifies that every point is pipe / flange / pump (never bare ground).
const { chromium } = require('/tmp/legacy-pw.js');
const fs = require('fs');
const URL = process.argv[3] || 'file://' + __dirname + '/v2.html', OUT = process.argv[2] || '/tmp/oli-pump-art'; fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch(), errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR/.test(m.text())) errors.push(m.text()); });
  await page.goto(URL + (process.argv[4] || '')); await page.waitForTimeout(1500);
  const cases = [['main-x', 1, 'x', 0], ['sub-x', 0, 'x', 0], ['main-y', 1, 'y', 0], ['sub-y', 0, 'y', 0], ['main-x-flipped', 1, 'x', 1]];
  const meta = [];
  for (const [name, type, axis, flip] of cases) {
    const info = await page.evaluate(([type, axis, flip]) => { const v = window.__v2, g = v.game; g.s.cash = 1e8; window.OliCore.CFG.BUILD = { well: 0, tank: 0, pump: 0, pipeTile: 0, pipeMax: 0 };
      for (const L of g.lines.slice()) for (const k of L.cells.slice()) g.removeAt(k % 140, (k / 140) | 0); for (const b of g.buildings.slice()) g.removeAt(b.x, b.y);
      for (const a of g.areas) if (a.st !== 2) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; }
      const dx = axis === 'x' ? 1 : 0, dy = axis === 'y' ? 1 : 0;
      for (let y = 22; y < 55; y++) for (let x = 32; x < 90; x++) { const tx = x + dx * 16, ty = y + dy * 16; if (!g.canPlace('well', x, y).ok || !g.canPlace('tank', tx, ty).ok) continue;
        const w = g.place('well', x, y, 'large').building, t = g.place('tank', tx, ty).building; v.view.scene.paintGround(true);
        const r = g.routeNodes('B' + w.id, 'B' + t.id, type); if (!r.ok) { g.removeAt(w.x, w.y); g.removeAt(t.x, t.y); continue; }
        const L = g.buildLine(r).line, c = L.cells[Math.floor(L.cells.length / 2)], px = c % 140, py = (c / 140) | 0;
        const pr = g.place('pump', px, py, undefined, flip ? (axis === 'x' ? 1 : 3) : (axis === 'x' ? 0 : 2)); if (!pr.ok) return { err: pr.reason };
        for (let i = 0; i < 300; i++) g.step(.1); v.view.scene.paintGround(true);
        return { px, py, dx, dy, pump: pr.building.id }; } return { err: 'no layout' }; }, [type, axis, flip]);
    if (info.err) { console.log('FAIL', name, info.err); process.exit(1); }
    for (const z of [1.0, 1.8]) {
      await page.evaluate(([x, y, z]) => { const v = window.__v2, c = v.tc(x, y); v.view.cam.setZoom(z); v.view.cam.centerOn(c.x, c.y); v.camApi.clamp(); }, [info.px, info.py, z]); await page.waitForTimeout(500);
      const pts = await page.evaluate(([px, py, dx, dy]) => { const v = window.__v2, out = []; for (let t = -4; t <= 4.001; t += 0.05) { const c = v.tc(px + dx * t, py + dy * t), s = v.camApi.w2s(c.x, c.y); out.push([t, s.x, s.y]); } return out; }, [info.px, info.py, info.dx, info.dy]);
      await page.screenshot({ path: `${OUT}/${name}-z${z}.png` }); meta.push({ name, zoom: z, dpr: 2, pts, flip });
    }
  }
  fs.writeFileSync(OUT + '/meta.json', JSON.stringify(meta)); console.log('errors', JSON.stringify(errors)); await browser.close();
})().catch(e => { console.log('FAIL', e.stack); process.exit(1); });
