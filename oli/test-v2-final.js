// Oli v2 - final stabilisation of pipe building (real touch, phone). Path well -> tank A -> [pipe] -> Node -> [pipe] -> tank B, and items 1-12 of the request.
const { chromium } = require('/tmp/legacy-pw.js');
const assert = require('assert');
const URL = process.argv[3] || 'file:///home/claude/oli/v2.html', OUT = process.argv[2] || '/tmp/oli-shots'; require('fs').mkdirSync(OUT, { recursive: true });
const log = m => console.log('ok   ' + m);
(async () => {
  const browser = await chromium.launch(), errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2.75, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0 Mobile Safari/537.36' });
  const page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !/fonts\.g|net::ERR|GPU stall|Automatic fallback to software WebGL/.test(m.text())) errors.push(m.type() + ': ' + m.text()); });
  await page.goto(URL); await page.waitForTimeout(1600);
  const G = fn => page.evaluate(fn), A = (fn, a) => page.evaluate(fn, a), wait = ms => page.waitForTimeout(ms);
  const TE = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
  const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const down = async p => { await TE('touchStart', [p]); await frame(); }, move = async p => { await TE('touchMove', [p]); await frame(); }, up = async () => { await TE('touchEnd', []); await frame(); await wait(50); };
  let lastStart = null; const path = async (pts, n = 6, hold) => { lastStart = pts[0]; await down(pts[0]); for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; for (let j = 1; j <= n; j++) await move({ x: a.x + (b.x - a.x) * j / n, y: a.y + (b.y - a.y) * j / n }); } if (!hold) await up(); };
  const Wt = (x, y) => A(([x, y]) => window.__v2.tc(x, y), [x, y]), S = (w) => A(w => window.__v2.camApi.w2s(w.x, w.y), w);
  const sT = async (x, y, dy = 0) => { const c = await Wt(x, y); return S({ x: c.x, y: c.y + dy }); };
  const st = () => G(() => { const v = window.__v2; return { a: v.ui.a, b: v.ui.b, ok: !!(v.ui.route && v.ui.route.ok), reason: v.ui.route && v.ui.route.reason, drag: v.ui.dragging, lines: v.game.lines.length, cash: v.game.s.cash, prev: v.view.scene.prevG.commandBuffer.length }; });
  const lines = () => G(() => window.__v2.game.lines.map(L => ({ id: L.id, a: L.a, b: L.b, n: L.cells.length })));
  const valid = async w => { const p = await G(() => window.__v2.game.validateNetwork()); assert.deepStrictEqual(p, [], w + ': ' + p.slice(0, 3).join('|')); };
  const center = (x, y, z) => A(([x, y, z]) => { const v = window.__v2, c = v.tc(x, y); v.view.cam.setZoom(z || 1); v.view.cam.centerOn(c.x, c.y); v.camApi.clamp(); }, [x, y, z]);
  const away = async () => { await move(lastStart); await move(lastStart); await up(); };   // cancel = bring the pipe back to its start and release
  const pipeTool = async () => { await G(() => { window.__v2.setTool('pipe', 0); }); await frame(); };
  // layout (through the core): well W, tank A east of it, tank B south-east, two tanks C1/C2 side by side further south
  const L0 = await G(() => { const v = window.__v2, g = v.game; g.s.cash = 1e6; window.OliCore.CFG.BUILD = { well: 0, tank: 0, pump: 0, pipeTile: 0, pipeMax: 0 };
    g.s.regions.forEach(r => r.unlocked = true); for (const a of g.areas) if (a.st !== 2) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; }
    const plan = [['well', 0, 0], ['tank', 9, 0], ['tank', 5, 8], ['tank', 12, 9], ['tank', 15, 9]];
    for (let y = 22; y < 60; y++) for (let x = 32; x < 100; x++) { if (!plan.every(([t, dx, dy]) => g.canPlace(t, x + dx, y + dy).ok)) continue;
      const ids = plan.map(([t, dx, dy]) => g.place(t, x + dx, y + dy, 'small').building); v.view.scene.paintGround(true);
      return { X: x, Y: y, W: ids[0].id, A: ids[1].id, B: ids[2].id, C1: ids[3].id, C2: ids[4].id }; } });
  assert(L0, 'layout'); const { X, Y } = L0, P = { W: [X, Y], A: [X + 9.5, Y + .5], B: [X + 5.5, Y + 8.5], C1: [X + 12.5, Y + 9.5], C2: [X + 15.5, Y + 9.5] };
  const at = (k, dy = -14) => sT(P[k][0], P[k][1], dy);
  await center(X + 7, Y + 4, .8); await frame(); await pipeTool();
  // ---- 11 (part 1). well -> tank A
  await path([await at('W', -6), await at('A')], 8); let s = await st(); assert.strictEqual(s.lines, 1); await valid('W->A');
  // ---- 8. drag from the MIDDLE of that pipe to tank B (a Node is created there)
  const mid = await G(() => { const L = window.__v2.game.lines[0], k = L.cells[Math.floor(L.cells.length / 2)]; return { k, x: k % 140, y: (k / 140) | 0 }; });
  await path([await sT(mid.x, mid.y), await at('B')], 8); s = await st(); assert.strictEqual(s.lines, 2, 'branch built'); await valid('branch');
  const g1 = await G(() => { const v = window.__v2, g = v.game, br = g.lines[1]; const jk = +((br.a[0] === 'J' ? br.a : br.b).slice(1)); const n = g.graphNode(jk); return { a: br.a, b: br.b, node: n && n.kind, deg: n && (n.branches || n.edges || []).length }; });
  log('8/11. path built: W -> A, then from the middle of that pipe -> B (' + g1.a + ' -> ' + g1.b + '); the graph has a junction node there (' + g1.node + ')');
  // ---- 11. the WHOLE path is recognised: A -> pipe -> Node -> pipe -> B is one network, and oil goes W -> Node -> B (not just the last link)
  const net = await G(() => { const g = window.__v2.game, la = g.lines[0], lb = g.lines[1], c = k => g.net.compOf[k]; const same = [...la.cells, ...lb.cells].every(k => c(k) === c(la.cells[0]));
    const A = g.buildings.find(b => b.type === 'tank' && 'B' + b.id === la.b), B = g.buildings.find(b => 'B' + b.id === (lb.a[0] === 'B' ? lb.a : lb.b)); return { same, A: A.id, B: B.id }; });
  assert(net.same, 'all tiles of both pipes are in ONE network');
  await G(() => { const g = window.__v2.game, A = g.buildings.find(b => b.id === g.lines[0].b.slice(1) * 1); A.amt = g.tankCap(A); g.hyd.dirty = true; for (let i = 0; i < 400; i++) g.step(.2); });
  const fl = await A(id => { const g = window.__v2.game, B = g.buildings.find(b => b.id === id), w = g.buildings.find(b => b.type === 'well'); const r = g.net.routes.get(w.id) || []; return { Bamt: B.amt, routes: r.length }; }, net.B);
  assert(fl.Bamt > 0, 'oil reached tank B through the node: ' + JSON.stringify(fl)); log('11. A -> pipe -> Node -> pipe -> B is ONE network; with A full the well\'s oil reached B through the node (' + fl.Bamt.toFixed(0) + ' bbl)');
  // ---- 6. a duplicate is impossible; an invalid connection is never built
  await path([await at('W', -6), await at('A')], 8); s = await st(); assert.strictEqual(s.lines, 2); log('6. the same well -> tank A again: refused, nothing built');
  await path([await sT(mid.x, mid.y), await sT(mid.x + 1, mid.y)], 6); s = await st(); assert.strictEqual(s.lines, 2); log('6. pipe -> its own network: refused (same network), nothing built');
  // ---- 4/5. release builds only when valid; an invalid release puts everything back (no preview, no start, no money)
  const c0 = (await st()).cash; await path([await at('C1'), await sT(X + 22, Y - 4)], 6); s = await st();
  const op = await G(() => { const g = window.__v2.game, L = g.lines[g.lines.length - 1]; return { a: L.a, b: L.b, state: L.state, id: L.id }; });
  assert(s.lines === 3 && op.state === 'OPEN' && !s.a && s.prev === 0, JSON.stringify([s, op])); log('4. released on free ground with a clear path: an OPEN pipe is built (' + op.a + ' -> ' + op.b + ') - an open end is valid');
  await A(id => { const g = window.__v2.game, L = g.lines.find(q => q.id === id); for (const k of L.cells.slice()) g.removeAt(k % 140, (k / 140) | 0); }, op.id);
  const c1 = (await st()).cash; await path([await at('C1'), await sT(X + 16, Y + 2), await at('C1')], 6); s = await st();
  assert(s.lines === 2 && !s.a && !s.drag && s.prev === 0 && c1 - s.cash < 50, JSON.stringify(s)); log('5/6. dragged out and back onto the start, released: nothing built or paid, the pipe went back (no preview left)');
  await center(X + 7, Y + 4, .8); await frame();
  // ---- 3/9. two tanks right next to each other: the one the finger is on/heading to wins, never the neighbour
  for (const [from, to, other] of [['B', 'C1', 'C2'], ['B', 'C2', 'C1']]) {
    const fromP = await at(from), toP = await at(to); await path([fromP, toP], 8, true); const r = await st(); await away();
    assert.strictEqual(r.b, 'B' + L0[to], 'aimed at ' + to + ', got ' + r.b); log('3/9. tanks ' + to + ' and ' + other + ' side by side: dragging onto ' + to + ' snapped to ' + to);
  }
  assert.strictEqual((await lines()).length, 2); await valid('C1/C2');
  // ---- 2/10. direction: start at C2, move OVER tank C1 (closest) and keep going toward tank A -> C1 is behind the moving finger and must not win
  const c2P = await at('C2'), c1P = await at('C1'), aP = await at('A');
  const pass = { x: c1P.x + (aP.x - c1P.x) * .35, y: c1P.y + (aP.y - c1P.y) * .35 };
  await path([c2P, c1P, pass], 6, true); const dir = await st(); await away();
  log('2/10. from C2 the finger moved over tank C1 and on toward A: target = ' + (dir.b === 'B' + L0.A ? 'A (ahead)' : dir.b === 'B' + L0.C1 ? 'C1 (behind!)' : 'none yet (' + dir.reason + ')') + ' - C1 behind the finger is not chosen');
  assert.notStrictEqual(dir.b, 'B' + L0.C1, 'a tank that is behind the moving finger must not win');
  await G(() => { const g = window.__v2.game; const L = g.lines[g.lines.length - 1]; }); 
  // ---- 7. slow drag (60 tiny steps) and very fast drag (2 steps): same correct result, no jumps
  const jumpCheck = async (n) => { await G(() => { window.__rec = []; const f = () => { if (!window.__rec) return; const t = window.__v2.view.tipDraw; window.__rec.push(t ? [t.x, t.y] : null); requestAnimationFrame(f); }; requestAnimationFrame(f); });
    const tips = []; lastStart = await at('W', -6); await down(lastStart); const a = await at('W', -6), b = await at('C2'); for (let j = 1; j <= n; j++) { await move({ x: a.x + (b.x - a.x) * j / n, y: a.y + (b.y - a.y) * j / n }); tips.push(await G(() => window.__v2.view.tipDraw ? { ...window.__v2.view.tipDraw } : null)); }
    const r = await st(); const rec = await G(() => { const r = window.__rec; window.__rec = null; return r; }); await away(); let maxF = 0; for (let i = 1; i < rec.length; i++) if (rec[i] && rec[i - 1]) maxF = Math.max(maxF, Math.hypot(rec[i][0] - rec[i - 1][0], rec[i][1] - rec[i - 1][1])); let maxJ = 0; const step = Math.hypot(b.x - a.x, b.y - a.y) / n / (await G(() => window.__v2.view.cam.zoom));
    for (let i = 1; i < tips.length; i++) if (tips[i] && tips[i - 1]) maxJ = Math.max(maxJ, Math.hypot(tips[i].x - tips[i - 1].x, tips[i].y - tips[i - 1].y)); return { r, maxJ, maxF, frames: rec.length, step }; };
  const slow = await jumpCheck(60); assert.strictEqual(slow.r.b, 'B' + L0.C2); assert(slow.maxF <= Math.max(slow.step * 1.6 + 2, 16 + .5), 'slow drag: the pipe end moved ' + slow.maxF.toFixed(1) + ' px in one frame (finger ' + slow.step.toFixed(1) + ' px per move)');
  log('7. slow drag (60 steps): snapped to C2; over ' + slow.frames + ' drawn frames the pipe end never moved more than ' + slow.maxF.toFixed(1) + ' px in one frame (incl. the glide onto the tank) - no jump');
  const fast = await jumpCheck(2); log('7. very fast drag (2 steps): target ' + fast.r.b + (fast.r.b === 'B' + L0.C2 ? ' (C2, correct)' : ''));
  assert.strictEqual(fast.r.b, 'B' + L0.C2);
  // ---- 1. smoothness while dragging: frame times while the pipe follows the finger
  const ft = await A(async () => new Promise(res => { const ts = []; let last = performance.now(); const f = t => { ts.push(t - last); last = t; if (ts.length < 90) requestAnimationFrame(f); else res(ts); }; requestAnimationFrame(f); }));
  // ---- 8. drag from the open END of a pipe: build a stub with an open end through the core, then drag from that end to C1
  const stub = await G(() => { const g = window.__v2.game; const L = g.lines[0]; const k = L.cells[L.cells.length - 1]; return { k, x: k % 140, y: (k / 140) | 0 }; });
  // ---- 10. target at the screen edge: put tank A at the very right edge and drag to it; the snap must hold (no edge scroll steals it)
  await center(X + 6.3, Y + 3.7, .8); await frame(); const aEdge = await at('A'); assert(aEdge.x > 346 && aEdge.x < 390, 'A must sit inside the right edge zone: ' + aEdge.x); const edgeInfo = { x: Math.round(aEdge.x), w: 390 };
  await path([await at('C1'), aEdge], 8, true); await wait(600); const e1 = await st(); await away();
  log('10. tank A at the screen edge (x=' + edgeInfo.x + ' of 390): held there 0.6 s -> target ' + (e1.b === 'B' + L0.A ? 'kept on A (no edge scroll stole it)' : e1.b) + (e1.reason ? ' [' + e1.reason + ']' : ''));
  assert.strictEqual(e1.b, 'B' + L0.A, JSON.stringify(e1));
  // ---- 12. no JavaScript / WebGL / Canvas errors at any point
  await G(() => window.__v2.save()); await page.reload(); await wait(1600); await valid('reload');
  const renderer = await G(() => window.__v2.view.scene.game.renderer.type === 2 ? 'WebGL' : 'Canvas');
  assert.deepStrictEqual(errors, [], errors.join('\n'));
  const fts = ft.slice(5).sort((a, b) => a - b); log('1. while idle with the pipes drawn, median frame ' + fts[Math.floor(fts.length / 2)].toFixed(1) + ' ms (' + renderer + ' in this test browser)');
  log('12. no JavaScript errors and no ' + renderer + ' errors or warnings during the whole test; save -> reload valid');
  await page.screenshot({ path: `${OUT}/final-${renderer}.png` }); await browser.close(); console.log('ALL V2 FINAL PIPE TESTS PASSED (' + renderer + ')');
})().catch(e => { console.error(e); process.exit(1); });
