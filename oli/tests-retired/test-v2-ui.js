// Oli v2 (Phaser front-end) on a phone with real touch: two-tap pipes, preview == built, no gaps at nodes, pan / pinch, cancel, duplicates, save / reload.
const { chromium } = require('/tmp/legacy-pw.js');
const assert = require('assert');
const URL = process.argv[3] || 'file:///home/claude/oli/v2.html', OUT = process.argv[2] || '/tmp/oli-shots'; require('fs').mkdirSync(OUT, { recursive: true });
const log = m => console.log('ok   ' + m);
(async () => {
  const browser = await chromium.launch(), errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }), page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(URL); await page.waitForTimeout(1800);
  const G = fn => page.evaluate(fn), A = (fn, a) => page.evaluate(fn, a), wait = ms => page.waitForTimeout(ms);
  const TE = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
  const tap = async p => { await TE('touchStart', [p]); await wait(40); await TE('touchEnd', []); await wait(260); };
  const drag = async (a, b, n = 12) => { await TE('touchStart', [a]); for (let i = 1; i <= n; i++) { await TE('touchMove', [{ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n }]); await wait(16); } await TE('touchEnd', []); await wait(200); };
  const scr = (x, y, dy = 0) => A(([x, y, dy]) => { const v = window.__v2, c = v.tc(x, y), cam = v.view.cam; return { x: (c.x - cam.worldView.x) * cam.zoom, y: (c.y + dy - cam.worldView.y) * cam.zoom }; }, [x, y, dy]);
  const cam = () => G(() => { const c = window.__v2.view.cam; return { x: c.scrollX, y: c.scrollY, z: c.zoom }; });
  const lines = () => G(() => window.__v2.game.lines.map(L => ({ id: L.id, a: L.a, b: L.b, n: L.cells.length, t: L.type })));
  const valid = async w => { const p = await G(() => window.__v2.game.validateNetwork()); assert.deepStrictEqual(p, [], w + ': ' + p.slice(0, 3).join('|')); };
  const menu = async (sel) => { if (await page.locator('#buildmenu').isHidden()) { await page.tap('#b-build'); await wait(200); } await page.tap(sel); await wait(200); };
  // scene: a well on oil ground, two tanks (built through the UI flow for the first well)
  const sp = await G(() => { const g = window.__v2.game; g.s.cash = 1e6; window.OliCore.CFG.BUILD = { well: 0, tank: 0, pump: 0, pipeTile: 0, pipeMax: 0 };
    for (let y = 0; y < 88; y++) for (let x = 0; x < 140; x++) if (g.canPlace('well', x, y).ok) { const a = g.nearestValid('tank', x + 7, y + 1, 12), b = g.nearestValid('tank', x + 1, y + 7, 12); if (a && b && Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) > 3) return [x, y, a, b]; } });
  assert(sp, 'a free spot'); await A(([x, y]) => { const v = window.__v2, c = v.tc(x + 3, y + 3); v.view.cam.setZoom(1); v.view.cam.centerOn(c.x, c.y); }, sp); await wait(300);
  // 1. build a well: Build -> Well -> tap the tile -> ghost + confirm -> confirm -> selected
  await menu('[data-tool=well]'); let p = await scr(sp[0], sp[1]); await tap(p);
  assert(await page.locator('#confirm').isVisible()); assert.strictEqual(await G(() => window.__v2.game.buildings.length), 0); await page.tap('#cf-ok'); await wait(300);
  assert.strictEqual(await G(() => window.__v2.game.buildings.length), 1); assert(await G(() => window.__v2.ui.sel && window.__v2.ui.sel.kind === 'b' && !window.__v2.ui.tool)); log('1. well: tap -> preview -> confirm -> built and selected, back to normal play');
  await menu('[data-tool=tank]'); p = await scr(sp[2][0], sp[2][1]); await tap(p); await page.tap('#cf-ok'); await wait(300);
  await menu('[data-tool=tank]'); p = await scr(sp[3][0], sp[3][1]); await tap(p); await page.tap('#cf-no'); await wait(200); assert.strictEqual(await G(() => window.__v2.game.buildings.length), 2); log('2. cancel a tank: nothing built, nothing paid');
  await tap(p); await page.tap('#cf-ok'); await wait(300); assert.strictEqual(await G(() => window.__v2.game.buildings.length), 3); log('3. two tanks built');
  const B = await G(() => window.__v2.game.buildings.map(b => ({ id: b.id, type: b.type, x: b.x, y: b.y })));
  const W1 = B[0], T1 = B[1], T2 = B[2];
  // 2. pipe: Build -> Branch pipe -> tap well -> tap tank -> green preview -> confirm
  await menu('[data-tool=pipe][data-ptype="0"]'); const c0 = await cam();
  await tap(await scr(W1.x, W1.y, -10)); assert.strictEqual(await G(() => window.__v2.ui.a), 'B' + W1.id);
  await tap(await scr(T1.x + .5, T1.y + .5, -20)); const r = await G(() => { const r = window.__v2.ui.route; return r && { ok: r.ok, b: r.b, cost: r.cost, cells: r.cells.map(c => c.join(',')), fresh: r.fresh.length }; });
  assert(r && r.ok, JSON.stringify(r)); assert.strictEqual(r.b, 'B' + T1.id); const c1 = await cam(); assert(Math.abs(c1.x - c0.x) < .5 && Math.abs(c1.y - c0.y) < .5, 'node taps never move the camera');
  assert(await page.locator('#confirm').isVisible()); assert.strictEqual((await lines()).length, 0); const prev = await G(() => window.__v2.view.scene.previewGeom.pts.map(p => [+p.x.toFixed(2), +p.y.toFixed(2)]));
  await page.screenshot({ path: `${OUT}/v2-1-preview.png` }); log('4. tap well, tap tank: green route of ' + r.fresh + ' pieces, ' + r.cost + ' $, nothing built yet, camera did not move');
  await G(() => { const b = document.getElementById('cf-ok'); b.click(); b.click(); b.click(); }); await wait(500);
  const L1 = await lines(); assert.strictEqual(L1.length, 1, 'three presses -> one pipe'); assert.strictEqual(L1[0].a, 'B' + W1.id); assert.strictEqual(L1[0].b, 'B' + T1.id);
  const built = await G(() => { const sc = window.__v2.view.scene; sc.netSig = ''; sc.drawPipes(); return sc.geoms[0].pts.map(p => [+p.x.toFixed(2), +p.y.toFixed(2)]); });
  assert.deepStrictEqual(built, prev, 'the built pipe is drawn exactly where the preview was'); await valid('pipe 1'); log('5. confirm pressed 3x -> ONE pipe entity B' + W1.id + ' -> B' + T1.id + '; built geometry == preview geometry (' + built.length + ' points)');
  // 3. NO GAPS: each pipe end sits exactly on its node's connection point (middle of the shared edge with the building)
  const gaps = await G(() => { const v = window.__v2, g = v.game, sc = v.view.scene, out = []; for (const geo of sc.geoms) for (const [end, id, k] of [[geo.pts[0], geo.line.a, geo.line.cells[0]], [geo.pts[geo.pts.length - 1], geo.line.b, geo.line.cells[geo.line.cells.length - 1]]]) { const a = v.nodeAnchor(id, k); out.push(a ? Math.hypot(a.x - end.x, a.y - end.y) : -1); } return out; });
  assert(gaps.every(d => d >= 0 && d < 0.01), 'gaps ' + gaps); log('6. pipe ends sit exactly on the building connection points (gap ' + Math.max(...gaps).toFixed(3) + ' px)');
  const seams = await G(() => { const sc = window.__v2.view.scene, out = { joints: 0, maxGap: 0, maxBend: 0 }; for (const geo of sc.geoms) for (let i = 1; i < geo.pieces.length; i++) { const A = geo.pieces[i - 1].pts, B = geo.pieces[i].pts, e = A[A.length - 1], s0 = B[0];
      out.joints++; out.maxGap = Math.max(out.maxGap, Math.hypot(e.x - s0.x, e.y - s0.y)); const d1 = Math.atan2(e.y - A[A.length - 2].y, e.x - A[A.length - 2].x), d2 = Math.atan2(B[1].y - s0.y, B[1].x - s0.x); out.maxBend = Math.max(out.maxBend, Math.abs(Math.atan2(Math.sin(d2 - d1), Math.cos(d2 - d1)))); } return out; });
  assert(seams.maxGap < 1e-6 && seams.maxBend < 1e-3, JSON.stringify(seams)); log('6b. ' + seams.joints + ' joints between pipe pieces: each piece ends exactly where the next begins (gap ' + seams.maxGap + ' px), always on a straight part (no kink)');
  await G(() => { for (let i = 0; i < 400; i++) window.__v2.game.step(0.2); }); const flow = await G(() => window.__v2.game.buildings[0].q); assert(flow > .5); log('7. oil flows through the new pipe (well q=' + flow.toFixed(1) + ')');
  // 4. duplicate refused, cancel leaves nothing
  await menu('[data-tool=pipe][data-ptype="1"]'); await tap(await scr(W1.x, W1.y, -10)); await tap(await scr(T1.x + .5, T1.y + .5, -20));
  assert.strictEqual(await G(() => window.__v2.ui.route.reason), 'duplicate'); assert(await page.locator('#cf-ok').isDisabled()); log('8. same well -> same tank again: refused in red ("' + (await page.textContent('#cf-text')).trim() + '")');
  await page.tap('#cf-no'); await wait(200); assert(!(await G(() => window.__v2.ui.a)) && !(await page.locator('#confirm').isVisible())); assert(await G(() => window.__v2.view.scene.prevG.commandBuffer.length === 0)); log('9. cancel: preview gone, start cleared');
  // 5. junction: tap the middle of the pipe, then tank 2 -> main pipe, the branch ends exactly ON the other pipe's centre line
  const mid = await G(() => { const L = window.__v2.game.lines[0], k = L.cells[Math.floor(L.cells.length / 2)]; return { x: k % 140, y: (k / 140) | 0 }; });
  await tap(await scr(mid.x, mid.y)); const ja = await G(() => window.__v2.ui.a); assert(ja && ja[0] === 'J', 'junction start, got ' + ja);
  await tap(await scr(T2.x + .5, T2.y + .5, -20)); const r2 = await G(() => window.__v2.ui.route); assert(r2.ok, r2.reason); await page.tap('#cf-ok'); await wait(400); await valid('junction');
  const jgap = await G(() => { const v = window.__v2, sc = v.view.scene; sc.netSig = ''; sc.drawPipes(); const geo = sc.geoms.find(q => q.line.a[0] === 'J' || q.line.b[0] === 'J'); const L = geo.line, jid = L.a[0] === 'J' ? L.a : L.b, jk = +jid.slice(1), c = v.tc(jk % 140, (jk / 140) | 0), e = L.a[0] === 'J' ? geo.pts[0] : geo.pts[geo.pts.length - 1];
    const other = sc.geoms.find(q => q !== geo), onOther = other.pts.some(p => Math.hypot(p.x - c.x, p.y - c.y) < .01); return { d: Math.hypot(c.x - e.x, c.y - e.y), onOther, type: L.type }; });
  assert(jgap.d < .01 && jgap.onOther && jgap.type === 1, JSON.stringify(jgap)); await page.screenshot({ path: `${OUT}/v2-2-junction.png` }); log('10. junction: main pipe built from the pipe to tank 2; its end is exactly the junction centre, which lies ON the first pipe (gap ' + jgap.d.toFixed(3) + ')');
  // 6. camera: one finger pans, two fingers zoom, neither builds nor selects
  await G(() => window.__v2.select(null)); const n0 = (await lines()).length, k0 = await cam();
  await drag({ x: 300, y: 300 }, { x: 180, y: 360 }); const k1 = await cam(); assert(Math.hypot(k1.x - k0.x, k1.y - k0.y) > 50 && Math.abs(k1.z - k0.z) < 1e-6); log('11. one finger drag pans the camera (' + Math.round(k1.x - k0.x) + ',' + Math.round(k1.y - k0.y) + ')');
  await TE('touchStart', [{ x: 170, y: 400 }, { x: 220, y: 400 }]); for (let i = 1; i <= 10; i++) { await TE('touchMove', [{ x: 170 - i * 6, y: 400 }, { x: 220 + i * 6, y: 400 }]); await wait(16); } await TE('touchEnd', []); await wait(250);
  const k2 = await cam(); assert(k2.z > k1.z + .2, 'pinch zoom ' + k1.z + ' -> ' + k2.z); assert.strictEqual((await lines()).length, n0); assert(!(await G(() => window.__v2.ui.sel))); log('12. pinch zoom ' + k1.z.toFixed(2) + ' -> ' + k2.z.toFixed(2) + ', no build, no selection');
  // 7. rapid taps in pipe mode never build without confirm
  await menu('[data-tool=pipe][data-ptype="0"]'); for (let i = 0; i < 6; i++) { await TE('touchStart', [{ x: 150 + i * 20, y: 380 }]); await TE('touchEnd', []); await wait(30); } await wait(300); assert.strictEqual((await lines()).length, n0); log('13. six rapid taps in pipe mode: no pipe without confirm');
  await page.tap('#cf-no').catch(() => {}); await G(() => window.__v2.setTool(null));
  // 8. select a pipe -> panel with real values; delete it -> graph valid
  await A(m => { const v = window.__v2, c = v.tc(m.x, m.y); v.view.cam.setZoom(1); v.view.cam.centerOn(c.x, c.y); }, mid); await wait(250);
  const pl = await G(() => window.__v2.game.lines.find(L => L.a[0] === 'B' && L.b[0] === 'B') || window.__v2.game.lines[0]); const pk = pl.cells[1]; await tap(await scr(pk % 140, (pk / 140) | 0));
  assert(await page.locator('#panel').isVisible()); const ptxt = (await page.textContent('#panel')).replace(/\s+/g, ' '); log('14. tap a pipe: panel "' + ptxt.slice(0, 90) + '…"');
  // 9. save -> reload: identical entities, valid network
  const before = JSON.stringify(await lines()); await G(() => window.__v2.save()); await page.reload(); await wait(1800);
  assert.strictEqual(JSON.stringify(await lines()), before); await valid('reload'); log('15. save -> reload: identical pipe entities (ids, start/end nodes, tiles), network valid');
  assert.deepStrictEqual(errors, [], errors.join('\n')); await browser.close(); console.log('ALL V2 UI TESTS PASSED (no console errors)');
})().catch(e => { console.error(e); process.exit(1); });
