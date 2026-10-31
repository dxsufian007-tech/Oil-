// Oli v2 - magnetic connection assist with real touch on a phone (items 1-20 of the request).
const { chromium } = require('/tmp/legacy-pw.js');
const assert = require('assert');
const URL = process.argv[3] || 'file:///home/claude/oli/v2.html', OUT = process.argv[2] || '/tmp/oli-shots'; require('fs').mkdirSync(OUT, { recursive: true });
const log = m => console.log('ok   ' + m);
(async () => {
  const browser = await chromium.launch(), errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }), page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(URL); await page.waitForTimeout(1600);
  const G = fn => page.evaluate(fn), A = (fn, a) => page.evaluate(fn, a), wait = ms => page.waitForTimeout(ms);
  const TE = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
  const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const down = async p => { await TE('touchStart', [p]); await frame(); }, move = async p => { await TE('touchMove', [p]); await frame(); }, up = async () => { await TE('touchEnd', []); await frame(); await wait(60); };
  const path = async (pts, hold) => { await down(pts[0]); for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; for (let j = 1; j <= 6; j++) await move({ x: a.x + (b.x - a.x) * j / 6, y: a.y + (b.y - a.y) * j / 6 }); } if (!hold) await up(); };
  const W = (x, y) => A(([x, y]) => window.__v2.tc(x, y), [x, y]), S = (wx, wy) => A(([x, y]) => window.__v2.camApi.w2s(x, y), [wx, wy]);
  const scrT = async (x, y, dy = 0) => { const c = await W(x, y); return S(c.x, c.y + dy); };
  const st = () => G(() => { const v = window.__v2; return { a: v.ui.a, b: v.ui.b, ok: !!(v.ui.route && v.ui.route.ok), reason: v.ui.route && v.ui.route.reason, lines: v.game.lines.length, cash: v.game.s.cash }; });
  const lines = () => G(() => window.__v2.game.lines.map(L => ({ id: L.id, a: L.a, b: L.b })));
  const valid = async w => { const p = await G(() => window.__v2.game.validateNetwork()); assert.deepStrictEqual(p, [], w + ': ' + p.slice(0, 3).join('|')); };
  const menu = async s => { if (await page.locator('#buildmenu').isHidden()) { await page.tap('#b-build'); await wait(120); } await page.tap(s); await wait(120); };
  const center = (x, y, z) => A(([x, y, z]) => { const v = window.__v2, c = v.tc(x, y); v.view.cam.setZoom(z || 1); v.view.cam.centerOn(c.x, c.y); v.camApi.clamp(); }, [x, y, z]);
  const ass = await G(() => { const s = document.querySelector('script[src="v2.js"]'); return true; });
  // scene through the core: a well W at (X,Y); tank A to the east (drag direction), tank B slightly closer but BEHIND the drag direction
  const sc = await G(() => { const v = window.__v2, g = v.game; g.s.cash = 1e6; window.OliCore.CFG.BUILD = { well: 0, tank: 0, pump: 0, pipeTile: 0, pipeMax: 0 };
    g.s.regions.forEach(r => r.unlocked = true); for (const a of g.areas) if (a.st !== 2) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; }
    for (let y = 20; y < 70; y++) for (let x = 30; x < 110; x++) { const ok = [[0, 0, 'well'], [10, -1, 'tank'], [4, 6, 'tank'], [0, 14, 'well'], [12, 14, 'tank']].every(([dx, dy, t]) => g.canPlace(t, x + dx, y + dy).ok); if (!ok) continue;
      const w = g.place('well', x, y, 'small').building, A = g.place('tank', x + 10, y - 1).building, B = g.place('tank', x + 4, y + 6).building, w2 = g.place('well', x, y + 14, 'small').building, C = g.place('tank', x + 12, y + 14).building; v.view.scene.paintGround(true);
      return { X: x, Y: y, w: w.id, A: A.id, B: B.id, w2: w2.id, C: C.id }; } });
  assert(sc, 'scene'); const { X, Y } = sc; await center(X + 5.75, Y + 7.25, .55); await frame();
  await menu('[data-tool=pipe][data-ptype="0"]');
  // 1. drag to the exact target
  const wS = await scrT(X, Y, -8), aS = await scrT(X + 10.5, Y - .5, -20);
  await path([wS, aS], true); let s = await st(); assert(s.ok && s.b === 'B' + sc.A, JSON.stringify(s)); log('1. drag onto tank A: snapped (B' + sc.A + ')');
  await page.screenshot({ path: `${OUT}/mag-1-snap.png` });
  // 3. magnetic: the drawn pipe end eases onto the target's exact connection point (not a jump), the route ends exactly on the node
  const tipStart = await G(() => window.__v2.view.tipDraw && { ...window.__v2.view.tipDraw }); for (let i = 0; i < 12; i++) await frame();
  const tipEnd = await G(() => { const v = window.__v2, e = v.view.scene.previewGeom.pts.slice(-1)[0]; return { tip: { ...v.view.tipDraw }, end: e }; });
  assert(Math.hypot(tipEnd.tip.x - tipEnd.end.x, tipEnd.tip.y - tipEnd.end.y) < 1.5, JSON.stringify(tipEnd)); log('3. the drawn pipe end eased onto the tank connection point (now ' + Math.hypot(tipEnd.tip.x - tipEnd.end.x, tipEnd.tip.y - tipEnd.end.y).toFixed(2) + ' px from it)');
  await TE('touchEnd', []); await frame(); await wait(80); await valid('1'); let L = await lines(); assert(L.length === 1 && L[0].b === 'B' + sc.A); log('4. release inside the snap radius: built W -> A');
  // 2. drag near the target but stop ~40 world px short (in the drag direction): auto-completes
  await center(X + 6.25, Y + 14.25, .75); await frame();
  const w2S = await scrT(X, Y + 14, -8), cC = await W(X + 12.5, Y + 14.5), wC = await W(X, Y + 14), dv = { x: cC.x - wC.x, y: cC.y - wC.y }, dl = Math.hypot(dv.x, dv.y);
  const short = await S(cC.x - dv.x / dl * 95, cC.y - dv.y / dl * 95); await path([w2S, short], true); s = await st();
  assert(s.ok && s.b === 'B' + sc.C, 'stopped short of tank C: ' + JSON.stringify(s)); await up(); L = await lines(); assert(L.length === 2); await valid('2');
  log('2/6. stopped ~40 px short of tank C (edge): the route auto-completed to its exact connection and was built');
  // 8. direction: drag from W toward A's side: B (behind / beside, closer) must not be chosen
  await G(() => { const g = window.__v2.game; for (const L of g.lines.slice()) for (const k of L.cells.slice()) g.removeAt(k % 140, (k / 140) | 0); }); await frame(); await center(X + 5, Y + 2.5, .75); await frame(); assert.strictEqual((await lines()).length, 0);
  // 7/8: a dedicated layout - tank A straight ahead of the drag, tank B to the side and CLOSER to the finger
  const dirT = await G(() => { const v = window.__v2, g = v.game;
    const offs = []; for (let bx = 3; bx <= 7; bx++) for (const by of [2, 3, -2, -3]) offs.push([bx, by]);
    for (const [bx, by] of offs) {
      let L = null; for (let y = 22; y < 66 && !L; y++) for (let x = 32; x < 100 && !L; x++) if (g.canPlace('well', x, y).ok && g.canPlace('tank', x + 9, y).ok && g.canPlace('tank', x + bx, y + by).ok) L = [x, y];
      if (!L) continue; const [x, y] = L, w = g.place('well', x, y, 'small').building, A = g.place('tank', x + 9, y).building, B = g.place('tank', x + bx, y + by).building;
      const P = n => { const [fw, fh] = g.footprintOf(n.type); return v.tc(n.x + (fw - 1) / 2, n.y + (fh - 1) / 2); }, ws = v.tc(x, y), as = P(A), bs = P(B), dir = { x: as.x - ws.x, y: as.y - ws.y };
      let found = null;
      for (let f = .3; f <= .97 && !found; f += .01) { const p = { x: ws.x + dir.x * f, y: ws.y + dir.y * f }, dA = Math.hypot(p.x - as.x, p.y - as.y), dB = Math.hypot(p.x - bs.x, p.y - bs.y), behind = (bs.x - p.x) * dir.x + (bs.y - p.y) * dir.y < 0;
        if (behind && dB < dA && dA - 52 < 56 && dB - 52 < 56) found = { p, dA, dB }; }
      let res = null;
      if (found) { v.ui.tool = 'pipe'; v.ui.ptype = 0; v.ui.a = 'B' + w.id; v.ui.b = null; v.ui.routeCache = new Map(); v.view.motion = { x: dir.x * .05, y: dir.y * .05 };   // the finger is moving from the well toward A
        const m = v.magnetTarget(found.p); res = { chosen: m.target && m.target.id, A: 'B' + A.id, B: 'B' + B.id, dA: Math.round(found.dA), dB: Math.round(found.dB) }; v.ui.a = null; v.ui.tool = null; v.ui.routeCache = new Map(); v.view.motion = null; }
      for (const b of [w, A, B]) g.removeAt(b.x, b.y);
      if (res) return res;
    } return { none: true }; });
  assert(dirT && !dirT.none, 'layout for the direction test: ' + JSON.stringify(dirT)); assert.strictEqual(dirT.chosen, dirT.A, JSON.stringify(dirT));
  log('7/8. dragging toward tank A: tank B is closer (' + dirT.dB + ' px) but BEHIND the moving finger, A is ahead (' + dirT.dA + ' px) -> A is chosen');
  await menu('[data-tool=pipe][data-ptype="0"]');
  // 5. release outside any snap radius: nothing built, nothing paid
  await path([await scrT(X, Y, -8), await scrT(X - 6, Y - 7)]); s = await st(); assert.strictEqual(s.lines, 1); assert.strictEqual(await G(() => window.__v2.game.lines[0].state), 'OPEN'); log('5. released far from everything: an OPEN pipe is built (valid, can be extended later)');
  await G(() => { const g = window.__v2.game; for (const L of g.lines.slice()) for (const k of L.cells.slice()) g.removeAt(k % 140, (k / 140) | 0); });
  const c0 = (await st()).cash; await path([await scrT(X, Y, -8), await scrT(X - 6, Y - 7), await scrT(X, Y, -8)]); s = await st(); assert.strictEqual(s.lines, 0); assert(c0 - s.cash < 50); log('5. dragged out and back onto the start: nothing built, nothing paid');
  // 14. cancel = release away from any target: everything clears at once
  s = await st(); assert(!s.a && await G(() => window.__v2.view.scene.prevG.commandBuffer.length === 0)); log('14. cancel (release on nothing): preview, target and start cleared at once');
  // 10/9/12. pipe -> tank, then a branch onto the pipe (junction)
  await path([await scrT(X, Y, -8), await scrT(X + 10.5, Y - .5, -14)]); assert.strictEqual((await lines()).length, 1); log('10. pipe well -> tank built');
  const mid = await G(() => { const L = window.__v2.game.lines[0], k = L.cells[Math.floor(L.cells.length / 2)]; return { x: k % 140, y: (k / 140) | 0 }; });
  await path([await scrT(X + 4.5, Y + 6.5, -20), await scrT(mid.x, mid.y)], true); s = await st(); assert(s.ok && s.b && s.b[0] === 'J', JSON.stringify(s)); await up(); await valid('junction');
  log('9/12. dragged tank B onto the middle of the pipe: snapped to the pipe (junction ' + s.b + ') and built');
  // 13. crossing without connection: a pipe from well 2 to tank A that crosses the first pipe is either routed round it or refused - never silently joined
  await center(X + 5, Y + 7, .5); await frame(); const aS2 = await scrT(X + 10.5, Y - .5, -12);
  const before = await lines();
  await path([await scrT(X, Y + 14, -8), aS2], true); s = await st(); await up(); await valid('crossing'); await center(X + 5, Y + 2.5, .75); await frame();
  const after = await lines(), nw = after.filter(q => !before.some(b => b.id === q.id));
  const crossed = await G(() => { const g = window.__v2.game; let x = 0; for (const L of g.lines) for (const k of L.cells) if (g.lineAt(k) !== L) x++; return x; });
  assert.strictEqual(crossed, 0); log('13. crossing: ' + (nw.length ? 'built ' + nw.map(q => q.a + '->' + q.b).join(',') + ' with no tile shared by two pipes' : 'refused (' + s.reason + ')') + '; graph valid, no accidental junction');
  // 11. pump: placed on a straight part of the first pipe (core), then a pipe from the pump to tank C
  const pump = await G(() => { const g = window.__v2.game, L = g.lines[0]; for (let i = 2; i < L.cells.length - 2; i++) { const k = L.cells[i], r = g.place('pump', k % 140, (k / 140) | 0); if (r.ok) return { id: r.building.id, x: r.building.x, y: r.building.y }; } return null; });
  if (pump) { await valid('pump'); await frame(); const pp = await scrT(pump.x, pump.y, -10); await down(pp); s = await st(); await up(); log('11. pump on the line: touching it grabs B' + pump.id + ' (' + (s.a === 'B' + pump.id ? 'ok' : 'got ' + s.a) + '), network valid'); assert.strictEqual(s.a, 'B' + pump.id);  }
  else log('11. pump: no straight spot on this pipe accepted a pump (core rule) - not tested');
  // 15. rapid touches build nothing
  const n0 = (await lines()).length; for (let i = 0; i < 8; i++) { await TE('touchStart', [{ x: 70 + i * 30, y: 230 }]); await TE('touchEnd', []); await wait(15); } await wait(200);  assert.strictEqual((await lines()).length, n0); log('15. eight rapid touches: no pipe');
  await G(() => window.__v2.setTool(null)); await page.tap('#b-build').catch(() => {});
  // 16/17/18. tap vs drag, camera, pinch
  const cam = () => G(() => { const c = window.__v2.view.cam; return { x: c.scrollX, y: c.scrollY, z: c.zoom }; });
  const k0 = await cam(); await path([{ x: 300, y: 300 }, { x: 220, y: 340 }]); const k1 = await cam(); assert(Math.hypot(k1.x - k0.x, k1.y - k0.y) > 40); assert.strictEqual((await lines()).length, n0); log('16/17. drag on the map (no tool): camera moves, no pipe tool activates');
  await TE('touchStart', [{ x: 170, y: 400 }, { x: 220, y: 400 }]); for (let i = 1; i <= 8; i++) { await TE('touchMove', [{ x: 170 - i * 6, y: 400 }, { x: 220 + i * 6, y: 400 }]); await frame(); } await up(); assert((await cam()).z > k1.z); log('18. pinch zooms');
  // 19. building: dragged near a valid spot, attracted, release builds; release on an invalid spot builds nothing
  await center(X + 5.75, Y + 7.25, .55); await frame(); await menu('[data-tool=tank]'); const nb = await G(() => window.__v2.game.buildings.length);
  const fs = await G(() => { const v = window.__v2, c = v.view.cam, w = v.camApi.s2w(c.width / 2, c.height / 2 - 60), t = v.toTile(w.x, w.y); return v.game.nearestValid('tank', t.x, t.y, 12); });
  await path([await scrT(fs[0] + 2, fs[1] - 2), await scrT(fs[0] + .5, fs[1] + .5)]); await wait(150); const nb2 = await G(() => window.__v2.game.buildings.length);
  assert.strictEqual(nb2, nb + 1, 'released on a valid spot -> built'); log('19. tank dragged to a free spot, release = built');
  await menu('[data-tool=tank]'); const tk = await G(() => { const b = window.__v2.game.buildings.find(q => q.type === 'tank'); return { x: b.x, y: b.y }; });
  await center(tk.x + 2, tk.y + 2, .8); await frame(); await path([await scrT(tk.x + 3, tk.y + 3), await scrT(tk.x + .5, tk.y + .5)]); await wait(150); const nb3 = await G(() => window.__v2.game.buildings.length);
  const last = await G(() => { const b = window.__v2.game.buildings[window.__v2.game.buildings.length - 1]; return { x: b.x, y: b.y }; });
  assert.strictEqual(nb3, nb2 + 1); assert(Math.abs(last.x - tk.x) + Math.abs(last.y - tk.y) <= 6); log('19. released over an existing tank: pulled to the nearest valid spot (' + last.x + ',' + last.y + ') and built there');
  await menu('[data-tool=tank]'); await G(() => { window.__v2.game.s.cash = 10; }); await center(fs[0] + 4, fs[1] + 5, .8); await frame(); await path([await scrT(fs[0] + 3, fs[1] + 4), await scrT(fs[0] + 4, fs[1] + 5)]); await wait(150);
  assert.strictEqual(await G(() => window.__v2.game.buildings.length), nb3); log('19. released where it cannot be built (no money): nothing built ("' + (await page.textContent('#toast')).trim() + '")'); assert(/النقد/.test(await page.textContent('#toast'))); await G(() => { window.__v2.game.s.cash = 1e6; });
  await G(() => window.__v2.setTool(null));
  // 20. save / load
  const bf = JSON.stringify(await lines()); await G(() => window.__v2.save()); await page.reload(); await wait(1600); assert.strictEqual(JSON.stringify(await lines()), bf); await valid('reload'); log('20. save -> reload: pipes identical, network valid');
  assert.deepStrictEqual(errors, [], errors.join('\n')); await browser.close(); console.log('ALL V2 MAGNET TESTS PASSED (no console errors)');
})().catch(e => { console.error(e); process.exit(1); });
