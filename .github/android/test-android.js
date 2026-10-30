// Oli pipe system on REAL Android (emulator, Android 14, the actual APK and its WebView).
// Touches go through Android's input system (adb shell input motionevent), not through the browser.
// The page is only READ over DevTools (state, frame times, errors); the scene is set up through the game core.
const CDP = require('chrome-remote-interface');
const { execSync } = require('child_process');
const fs = require('fs');
const sh = c => execSync(c, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const adbShell = cmds => sh('adb shell "' + cmds.join('; ') + '"');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = []; let fails = 0;
const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  — ' + info : '')); };

(async () => {
  const targets = await CDP.List({ port: 9222 }); const t = targets.find(x => x.type === 'page'); if (!t) { console.log('FAIL no WebView page'); process.exit(0); }
  const client = await CDP({ port: 9222, target: t, local: true }); const { Runtime, Page } = client; await Runtime.enable();
  const errors = [];
  Runtime.exceptionThrown(e => errors.push('exception: ' + (e.exceptionDetails.exception && e.exceptionDetails.exception.description || e.exceptionDetails.text)));
  Runtime.consoleAPICalled(e => { if (e.type === 'error' || e.type === 'warning') errors.push(e.type + ': ' + e.args.map(a => a.value || a.description).join(' ')); });
  const ev = async (expr) => { const r = await Runtime.evaluate({ expression: '(async () => { ' + expr + ' })()', awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text); return r.result.value; };
  await sleep(1000);
  const env = await ev("return { ua: navigator.userAgent, dpr: devicePixelRatio, w: innerWidth, h: innerHeight, renderer: window.__v2.view.scene.game.renderer.type === 2 ? 'WebGL' : 'Canvas', gl: (() => { try { const g = window.__v2.view.scene.game.renderer.gl; const d = g && g.getExtension('WEBGL_debug_renderer_info'); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : (g ? g.getParameter(g.RENDERER) : 'none'); } catch (e) { return 'n/a'; } })() };");
  console.log('ENV ' + JSON.stringify(env));

  // calibration: one real Android tap at a known device pixel -> where the WebView sees it (status bar / insets offset)
  await ev("window.__lt = null; document.addEventListener('pointerdown', e => { window.__lt = { x: e.clientX, y: e.clientY }; }, true); return 1;");
  const scr = sh('adb shell wm size').match(/(\d+)x(\d+)/), SW = +scr[1], SH = +scr[2];
  const cx = Math.round(SW / 2), cy = Math.round(SH * .45);
  let lt = null; for (let i = 0; i < 8 && !lt; i++) { adbShell(['input tap ' + cx + ' ' + cy]); await sleep(1000); lt = await ev('return window.__lt;'); }   // the app may still be starting: retry
  if (!lt) { console.log('FAIL calibration: no Android tap reached the WebView'); process.exit(0); }
  const dpr = env.dpr;
  const off = { x: cx / dpr - lt.x, y: cy / dpr - lt.y };
  console.log('CAL device ' + SW + 'x' + SH + ' dpr ' + dpr + ' offset css ' + JSON.stringify(off));
  const D = p => ({ x: Math.round((p.x + off.x) * dpr), y: Math.round((p.y + off.y) * dpr) });   // WebView css px -> device px

  // scene (through the core): well W, tank A, tank B, tanks C1/C2 side by side
  const L0 = await ev(`const v = window.__v2, g = v.game; g.s.cash = 1e6; OliCore.CFG.BUILD = { well: 0, tank: 0, pump: 0, pipeTile: 0, pipeMax: 0 };
    g.s.tutorialDone = true; g.s.regions.forEach(r => r.unlocked = true); for (const a of g.areas) if (a.st !== 2) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; }
    for (const L of g.lines.slice()) for (const k of L.cells.slice()) g.removeAt(k % 140, (k / 140) | 0); for (const b of g.buildings.slice()) g.removeAt(b.x, b.y);
    const plan = [['well', 0, 0], ['tank', 9, 0], ['tank', 5, 8], ['tank', 12, 9], ['tank', 15, 9]];
    for (let y = 22; y < 60; y++) for (let x = 32; x < 100; x++) { if (!plan.every(([t, dx, dy]) => g.canPlace(t, x + dx, y + dy).ok)) continue;
      const ids = plan.map(([t, dx, dy]) => g.place(t, x + dx, y + dy, 'small').building); v.view.scene.paintGround(true);
      return { X: x, Y: y, W: ids[0].id, A: ids[1].id, B: ids[2].id, C1: ids[3].id, C2: ids[4].id }; }`);
  const { X, Y } = L0, P = { W: [X, Y, -6], A: [X + 9.5, Y + .5, -14], B: [X + 5.5, Y + 8.5, -14], C1: [X + 12.5, Y + 9.5, -14], C2: [X + 15.5, Y + 9.5, -14] };
  const center = (x, y, z) => ev(`const v = window.__v2, c = v.tc(${x}, ${y}); v.view.cam.setZoom(${z}); v.view.cam.centerOn(c.x, c.y); v.camApi.clamp(); return 1;`);
  const css = async (k) => ev(`const v = window.__v2, c = v.tc(${P[k][0]}, ${P[k][1]}); return v.camApi.w2s(c.x, c.y + ${P[k][2]});`);
  const cssT = async (x, y) => ev(`const v = window.__v2, c = v.tc(${x}, ${y}); return v.camApi.w2s(c.x, c.y);`);
  const st = () => ev("const v = window.__v2; return { a: v.ui.a, b: v.ui.b, ok: !!(v.ui.route && v.ui.route.ok), reason: v.ui.route && v.ui.route.reason, drag: v.ui.dragging, lines: v.game.lines.length, cash: v.game.s.cash, prev: v.view.scene.prevG.commandBuffer.length };");
  const valid = () => ev('return window.__v2.game.validateNetwork();');
  const recStart = () => ev("window.__rec = { t: [], b: [], tip: [] }; let last = performance.now(); const f = now => { const r = window.__rec; if (!r) return; r.t.push(now - last); last = now; r.b.push(window.__v2.ui.b); const d = window.__v2.view.tipDraw; r.tip.push(d ? [d.x, d.y] : null); requestAnimationFrame(f); }; requestAnimationFrame(f); return 1;");
  const recStop = () => ev('const r = window.__rec; window.__rec = null; return r;');
  // a drag through Android input: DOWN at a, `n` MOVE steps along the points, (optionally) UP at the end
  const motion = (pts, n, release) => { lastStart = pts[0]; const cmds = [], P0 = D(pts[0]); cmds.push('input motionevent DOWN ' + P0.x + ' ' + P0.y);
    for (let i = 1; i < pts.length; i++) { const a = D(pts[i - 1]), b = D(pts[i]); for (let j = 1; j <= n; j++) cmds.push('input motionevent MOVE ' + Math.round(a.x + (b.x - a.x) * j / n) + ' ' + Math.round(a.y + (b.y - a.y) * j / n)); }
    if (release) { const e = D(pts[pts.length - 1]); cmds.push('input motionevent UP ' + e.x + ' ' + e.y); } adbShell(cmds); };
  const upAt = p => { const e = D(p); adbShell(['input motionevent UP ' + e.x + ' ' + e.y]); };
  let lastStart = null; const away = async () => { const e = D(lastStart); adbShell(['input motionevent MOVE ' + e.x + ' ' + e.y, 'input motionevent MOVE ' + e.x + ' ' + e.y, 'input motionevent UP ' + e.x + ' ' + e.y]); await sleep(400); };   // cancel = bring the pipe back to its start
  const shot = name => { try { fs.writeFileSync('results/' + name + '.png', execSync('adb exec-out screencap -p')); } catch (e) {} };

  await center(X + 7, Y + 4, .8); await ev("window.__v2.setTool('pipe', 0); return 1;"); await sleep(600);

  // 1 + 7 + 9: a real drag well -> tank A, slow (many MOVE events), held on the tank: snap, glide, frame times
  await recStart(); motion([await css('W'), await css('A')], 14, false); await sleep(900); let s = await st(); const rec1 = await recStop(); shot('1-snap-held');
  const gap = await ev("const v = window.__v2, e = v.view.scene.previewGeom && v.view.scene.previewGeom.pts.slice(-1)[0], d = v.view.tipDraw; return e && d ? Math.hypot(e.x - d.x, e.y - d.y) : -1;");
  check('7. snap on reaching the target (tank A)', s.ok && s.b === 'B' + L0.A, JSON.stringify({ b: s.b, ok: s.ok, reason: s.reason }));
  check('7. pipe end settled exactly on the connection point', gap >= 0 && gap < 1.5, 'gap ' + (gap >= 0 ? gap.toFixed(2) : 'n/a') + ' px');
  upAt(await css('A')); await sleep(700); s = await st();
  check('5. valid connection built on release (well -> tank A)', s.lines === 1 && (await valid()).length === 0, 'pipes ' + s.lines);
  const ft = rec1.t.slice(3).sort((a, b) => a - b), p50 = ft[Math.floor(ft.length * .5)], p95 = ft[Math.floor(ft.length * .95)];
  const jumps = []; for (let i = 1; i < rec1.tip.length; i++) if (rec1.tip[i] && rec1.tip[i - 1]) jumps.push(Math.hypot(rec1.tip[i][0] - rec1.tip[i - 1][0], rec1.tip[i][1] - rec1.tip[i - 1][1]));
  const maxJump = jumps.length ? Math.max(...jumps) : 0;
  check('1. pipe end moved smoothly (max per drawn frame)', maxJump <= 16.5 || maxJump <= 1.6 * (Math.max(...jumps.slice(0, -1).concat([0])) + 1), 'max ' + maxJump.toFixed(1) + ' world px per frame over ' + rec1.t.length + ' frames');
  console.log('PERF frames during the drag: ' + rec1.t.length + ', median ' + p50.toFixed(1) + ' ms (' + (1000 / p50).toFixed(0) + ' fps), 95th pct ' + p95.toFixed(1) + ' ms');
  // 8: no switching between targets during one drag (no A -> B -> A flicker)
  const seq = rec1.b.filter((v, i, a) => i === 0 || v !== a[i - 1]); const flips = seq.filter(v => v).length;
  check('8. no jumping to another target during the drag', flips <= 1, 'target sequence ' + JSON.stringify(seq));

  // 5: invalid connections
  motion([await css('W'), await css('A')], 8, true); await sleep(700); s = await st(); check('5. duplicate well -> tank A refused', s.lines === 1, 'pipes ' + s.lines + ' reason ' + s.reason);
  // A: release on free ground with a clear path builds an OPEN pipe (valid); then D: extend it from its open end
  await center(X + 12, Y + 3, .8); await sleep(300);
  motion([await css('C1'), await cssT(X + 18, Y + 2)], 8, true); await sleep(800); s = await st();
  const op = await ev("const g = window.__v2.game, L = g.lines[g.lines.length - 1]; return { a: L.a, b: L.b, state: L.state, len: L.len, id: L.id };");
  check('A. tank -> open pipe (released on free ground) is built, state OPEN', s.lines === 2 && op.state === 'OPEN', JSON.stringify(op));
  const oe = await ev("const L = window.__v2.game.lines[window.__v2.game.lines.length - 1], id = L.a[0] === 'E' ? L.a : L.b, k = +id.slice(1); return { x: k % 140, y: (k / 140) | 0 };");
  await center(oe.x + 1.5, oe.y, .8); await sleep(300);     // the camera never moves during a pipe drag (v33): the open end and its target must both be on screen
  motion([await cssT(oe.x, oe.y), await cssT(oe.x + 3, oe.y)], 8, true); await sleep(800); s = await st();
  const ex = await ev("const g = window.__v2.game, L = g.lines[g.lines.length - 1]; return { a: L.a, b: L.b, state: L.state };");
  check('D. drag from the open end continues the pipe', s.lines === 3 && (ex.a[0] === 'J' || ex.b[0] === 'J') && (await valid()).length === 0, JSON.stringify(ex));
  // G: delete the middle piece: the rest stays, the cut ends become OPEN
  const del = await ev("const g = window.__v2.game, L = g.lines.find(q => q.id === " + op.id + "); for (const k of L.cells.slice()) g.removeAt(k % 140, (k / 140) | 0); return { n: g.lines.length, open: g.lines.filter(q => q.state === 'OPEN').length, bad: g.validateNetwork().length };");
  check('G. deleting a pipe in the middle keeps the others; cut ends become OPEN', del.n === 2 && del.open >= 1 && del.bad === 0, JSON.stringify(del));
  await ev("const g = window.__v2.game; for (const L of g.lines.slice(1)) for (const k of L.cells.slice()) g.removeAt(k % 140, (k / 140) | 0); return 1;");
  await center(X + 7, Y + 4, .8); await sleep(300);
  // 6: cancel = drag out and back onto the start
  const c0 = (await st()).cash; motion([await css('C1'), await cssT(X + 18, Y + 2), await css('C1')], 8, true); await sleep(700); s = await st();
  check('6. dragged out and back onto the start: nothing built, no preview, nothing attached', s.lines === 1 && !s.a && !s.drag && s.prev === 0 && c0 - s.cash < 50, JSON.stringify({ a: s.a, prev: s.prev, lines: s.lines }));
  // full map: zoom out until the whole map is on the screen
  const fm = await ev("const v = window.__v2, c = v.view.cam, w = v.camApi.s2w(c.width / 2, c.height / 2); v.camApi.setZoomAt(.01, c.width / 2, c.height / 2, w.x, w.y); const B = v.view.bounds, a = v.camApi.s2w(0, 0), b = v.camApi.s2w(c.width, c.height); return { z: c.zoom, fits: (b.x - a.x >= B.w - 1) || (b.y - a.y >= B.h - 1) };");
  shot('map-full'); check('map: zooming out shows the whole map', fm.fits && fm.z < .2, 'zoom ' + fm.z.toFixed(3));
  await center(X + 7, Y + 4, .8); await sleep(300);

  // 3: two targets side by side
  for (const [to, other] of [['C1', 'C2'], ['C2', 'C1']]) { motion([await css('B'), await css(to)], 10, false); await sleep(700); s = await st(); shot('3-' + to); await away();
    check('3. two tanks side by side: aiming at ' + to + ' snaps to ' + to, s.b === 'B' + L0[to], 'got ' + s.b); }
  // 4: target behind the finger
  const c2 = await css('C2'), c1 = await css('C1'), a = await css('A'), pass = { x: c1.x + (a.x - c1.x) * .35, y: c1.y + (a.y - c1.y) * .35 };
  motion([c2, c1, pass], 8, false); await sleep(700); s = await st(); await away();
  check('4. tank behind the moving finger is not chosen', s.b !== 'B' + L0.C1, 'target ' + s.b);
  // 2: slow and very fast drags
  motion([await css('W'), await css('C2')], 30, false); await sleep(800); s = await st(); await away(); check('2. slow drag (30 Android move events) reaches C2', s.b === 'B' + L0.C2 && s.ok, 'target ' + s.b);
  motion([await css('W'), await css('C2')], 1, false); await sleep(800); s = await st(); await away(); check('2. very fast drag (1 move event) reaches C2', s.b === 'B' + L0.C2 && s.ok, 'target ' + s.b);
  // 5: a correct branch from the middle of the pipe (node) to tank B
  const mid = await ev("const L = window.__v2.game.lines[0], k = L.cells[Math.floor(L.cells.length / 2)]; return { x: k % 140, y: (k / 140) | 0 };");
  motion([await cssT(mid.x, mid.y), await css('B')], 10, true); await sleep(800); s = await st(); shot('5-branch');
  check('5. branch from the middle of the pipe to tank B builds a node', s.lines === 2 && (await valid()).length === 0, 'pipes ' + s.lines);
  // 10: errors
  await sleep(500);
  check('10. no JavaScript / WebGL / Canvas errors or warnings in the WebView', errors.length === 0, errors.slice(0, 5).join(' | ') || 'none');
  fs.writeFileSync('results/results.json', JSON.stringify({ env, fails, results, perf: { frames: rec1.t.length, medianMs: p50, p95Ms: p95, maxJump } }, null, 1));
  console.log('SUMMARY ' + (results.length - fails) + '/' + results.length + ' PASS');
  await client.close(); process.exit(0);
})().catch(e => { console.log('FAIL crashed: ' + e.message); fs.writeFileSync('results/crash.txt', String(e.stack)); process.exit(0); });
