// Oli NEW MAP (140 x 88 window of the new world) on REAL Android (emulator, Android 14, the actual APK and its WebView).
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

  const shot = name => { try { fs.writeFileSync('results/' + name + '.png', execSync('adb exec-out screencap -p')); } catch (e) {} };
  // calibration: one real Android tap at a known device pixel -> where the WebView sees it (status bar / insets offset)
  await ev("window.__lt = null; document.addEventListener('pointerdown', e => { window.__lt = { x: e.clientX, y: e.clientY }; }, true); return 1;");
  const scr = sh('adb shell wm size').match(/(\d+)x(\d+)/), SW = +scr[1], SH = +scr[2];
  const cx = Math.round(SW / 2), cy = Math.round(SH * .45);
  let lt = null; for (let i = 0; i < 8 && !lt; i++) { adbShell(['input tap ' + cx + ' ' + cy]); await sleep(1000); lt = await ev('return window.__lt;'); }   // the app may still be starting: retry
  if (!lt) { shot('nocal'); try { console.log('DIAG focus: ' + sh('adb shell dumpsys window | grep -E "mCurrentFocus|mFocusedApp"').replace(/\n/g, ' | ')); } catch (e) {} console.log('FAIL calibration: no Android tap reached the WebView'); process.exit(0); }
  const dpr = env.dpr;
  const off = { x: cx / dpr - lt.x, y: cy / dpr - lt.y };
  console.log('CAL device ' + SW + 'x' + SH + ' dpr ' + dpr + ' offset css ' + JSON.stringify(off));
  const D = p => ({ x: Math.round((p.x + off.x) * dpr), y: Math.round((p.y + off.y) * dpr) });   // WebView css px -> device px

  const tapEl = async sel => { const r = await ev(`const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 };`); if (!r) return false; const d = D(r); adbShell(['input tap ' + d.x + ' ' + d.y]); await sleep(700); return true; };
  const info = () => ev(`const v = window.__v2, m = v.game.map; let water = 0; for (const x of m.water) water += x; return { mode: v.mapMode, win: v.mapWin ? { preset: v.mapWin.preset, ox: v.mapWin.ox, oy: v.mapWin.oy, cols: v.mapWin.cols, rows: v.mapWin.rows, pal: v.mapWin.palette.length } : null, water, tiles: m.water.length, grid: OliCore.CFG.GRID_COLS + 'x' + OliCore.CFG.GRID_ROWS, tex: (() => { try { const s = v.view.scene.textures.get('groundset').getSourceImage(); return s.width + 'x' + s.height; } catch (e) { return null; } })() };`);
  const frames = (n) => ev(`const t = []; let last = performance.now(); await new Promise(res => { const f = x => { t.push(x - last); last = x; if (t.length < ${n}) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }); t.shift(); t.sort((a, b) => a - b); return { median: +t[t.length >> 1].toFixed(1), p95: +t[Math.floor(t.length * .95)].toFixed(1), max: +t[t.length - 1].toFixed(1) };`);
  const heap = () => ev('return performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null;');
  const MI = await info(); console.log('MAPINFO ' + JSON.stringify(MI));
  check('M1. the new map is active: window ' + (MI.win ? MI.win.preset + ' (' + MI.win.ox + ',' + MI.win.oy + ')' : '-'), MI.mode === 'new' && MI.win && MI.win.cols === 140 && MI.win.rows === 88, JSON.stringify(MI.win));
  check('M2. the game grid is still 140 x 88 and the map arrays have 12320 cells', MI.grid === '140x88' && MI.tiles === 12320, MI.grid + ' / ' + MI.tiles);
  check('M3. no water in the default window (nothing an old save could stand on is water)', MI.water === 0, 'water tiles ' + MI.water);
  check('M4. the ground tileset texture was built (' + (MI.win && MI.win.pal) + ' colours x 4 looks)', !!MI.tex && /^1056x/.test(MI.tex), String(MI.tex));
  const h0 = await heap(); console.log('HEAP ' + h0);
  // whole world, then close up: frame times (emulator: software GPU, not representative)
  await ev("const v = window.__v2, c = v.view.cam; c.setZoom(v.camApi.minZoom()); v.camApi.clamp(); return 1;"); await sleep(700);
  const f1 = await frames(90); check('M5. whole world in view: frame time', f1.median < 250, JSON.stringify(f1)); shot('map-far');
  await ev("const v = window.__v2, c = v.view.cam, t = v.tc(70, 44); c.setZoom(.9); c.centerOn(t.x, t.y); v.camApi.clamp(); return 1;"); await sleep(700);
  const f2 = await frames(90); check('M6. close view (zoom 0.9): frame time', f2.median < 250, JSON.stringify(f2)); shot('map-mid');
  // build with the real game rules on the new ground: a well, a tank and a pipe between them (through the core, like the other tests), then a REAL tap selects the well
  const b = await ev(`const v = window.__v2, g = v.game; g.s.cash = 1e6; g.s.regions.forEach(r => r.unlocked = true); for (const a of g.areas) if (a.st !== 2) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; }
    const w = g.place('well', 90, 44, 'small'), t = g.place('tank', 100, 44); if (!w.ok || !t.ok) return { ok: false, w: w.reason, t: t.reason };
    const r = g.routeNodes('B' + w.building.id, 'B' + t.building.id); if (!r.ok) return { ok: false, route: r.reason }; const L = g.buildLine(r); g.step(.1); v.view.scene.paintGround(true);
    return { ok: L.ok !== false, probs: g.validateNetwork(), id: w.building.id, tank: t.building.id, line: g.lines.length };`);
  check('M7. well + tank + pipe built on the new ground with the unchanged rules; network valid', b.ok && b.probs && b.probs.length === 0, JSON.stringify(b));
  await ev("const v = window.__v2, c = v.tc(90, 44); v.view.cam.setZoom(1.2); v.view.cam.centerOn(c.x, c.y); v.camApi.clamp(); return 1;"); await sleep(600);
  const wp = await ev("const v = window.__v2, c = v.tc(90, 44); return v.camApi.w2s(c.x, c.y - 6);"); const dd = D(wp); adbShell(['input tap ' + dd.x + ' ' + dd.y]); await sleep(900);
  const sel = await ev("const v = window.__v2; return { sel: v.ui.sel && v.ui.sel.type, id: v.ui.sel && v.ui.sel.id };");
  check('M8. a real Android tap on the well selects it', sel && sel.id === b.id, JSON.stringify(sel)); shot('map-selected');
  // a real one-finger swipe pans the map
  const c0 = await ev("const c = window.__v2.view.cam; return { x: c.scrollX, y: c.scrollY };"); const s0 = D({ x: 200, y: 400 }), s1 = D({ x: 120, y: 330 });
  adbShell(['input swipe ' + s0.x + ' ' + s0.y + ' ' + s1.x + ' ' + s1.y + ' 400']); await sleep(700);
  const c1 = await ev("const c = window.__v2.view.cam; return { x: c.scrollX, y: c.scrollY };"); check('M9. a real swipe moves the camera', Math.hypot(c1.x - c0.x, c1.y - c0.y) > 20, JSON.stringify([c0, c1]));
  // settings: the switch back to the old map (real taps), the game restarts on the old map, then back to the new one
  await ev("const v = window.__v2; v.select && v.select(null); return 1;");
  await tapEl('#b-settings'); const so = await tapEl('#settings [data-pref=map] [data-v=old]'); await sleep(6000);
  const MO = await info(); check('M10. settings -> map -> old (real taps): the old map is back (mode ' + MO.mode + ', water tiles ' + MO.water + ')', so && MO.mode === 'old' && !MO.win && MO.water > 100, JSON.stringify(MO)); shot('map-old');
  const keep = await ev("return { b: window.__v2.game.buildings.map(b => [b.type, b.x, b.y].join(',')).sort() };");
  check('M11. the save survived the switch: the same buildings on the same tiles', keep.b.length === 2 && keep.b.some(s => s === 'well,90,44') && keep.b.some(s => s === 'tank,100,44'), JSON.stringify(keep));
  await tapEl('#b-settings'); const sn = await tapEl('#settings [data-pref=map] [data-v=new]'); await sleep(6000);
  const MN = await info(); check('M12. settings -> map -> new: the new map is back, buildings still on their tiles', sn && MN.mode === 'new' && MN.win, JSON.stringify(MN.win));
  const h1 = await heap(); check('M13. JS heap after the whole session', h1 === null || h1 < 400, h0 + ' -> ' + h1 + ' MB');
  check('M14. no JavaScript errors in the WebView', errors.length === 0, errors.slice(0, 4).join(' | ') || 'none');
  fs.writeFileSync('results/maptest.json', JSON.stringify({ env, fails, results, frames: { far: f1, mid: f2 }, heap: [h0, h1] }, null, 1)); console.log('SUMMARY ' + (results.length - fails) + '/' + results.length + ' PASS');
  await client.close(); process.exit(0);
})().catch(e => { console.log('FAIL crashed: ' + e.message); try { fs.writeFileSync('results/crash-map.txt', String(e.stack)); } catch (x) {} process.exit(0); });
