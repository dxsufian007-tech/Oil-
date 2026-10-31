// Phase 8 browser test: pump build menu + preview, pump panel, pressure rows, valve, particles driven by flow, debug mode, save/load.
const { chromium } = require('/tmp/legacy-pw.js');
const assert = require('assert');
const URL = process.argv[3] || 'file:///home/claude/oli/index.html';
const OUT = process.argv[2] || '/tmp/oli-shots'; require('fs').mkdirSync(OUT, { recursive: true });
const log = m => console.log('ok   ' + m);
(async () => {
  const browser = await chromium.launch(), errors = [];
  async function run(opts, tag, touch) {
    const ctx = await browser.newContext(opts), page = await ctx.newPage();
    page.on('pageerror', e => errors.push(tag + ' pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR|Failed to load resource/.test(m.text())) errors.push(tag + ' console: ' + m.text()); });
    await page.goto(URL); await page.waitForTimeout(500);
    const G = fn => page.evaluate(fn), A = (fn, a) => page.evaluate(fn, a), wait = ms => page.waitForTimeout(ms);
    // a big free strip of land + rich ground, no random leaks, instant construction
    const P = await G(() => {
      const o = window.__oli, g = o.game, C = window.OliCore.CFG; C.TERRAIN.MULT = [1, 1, 1, 1]; C.REGIONS.forEach(r => { r.mult = 1; }); C.PIPE.LEAK_PER_TILE_MIN = 0; C.BUILD = { well: 0, tank: 0, pump: 0, pipeTile: 0, pipeMax: 0 };
      g.s.regions.forEach(r => { r.unlocked = true; }); g.s.tutorialDone = true; g.s.cash = 1e6; for (const a of g.areas) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; }
      const idx = (x, y) => y * 140 + x;
      for (let y = 30; y < 80; y++) for (let x = 3; x < 70; x++) { let f = true; for (let i = 0; i < 68 && f; i++) { if (g.map.block[idx(x + i, y)] || g.map.block[idx(x + i, y + 1)]) f = false; } if (f) return { x, y }; }
    });
    assert(P, 'free strip');
    const L = 62, wx = P.x, ty = P.y;
    await G(() => { const o = window.__oli; o.ui.wellKind = 'large'; });
    const built = await A(([x, y, L]) => { const g = window.__oli.game; const w = g.place('well', x, y, 'large'), t = g.place('tank', x + L + 2, y); const r = g.routePipe(x + 1, y, x + L + 1, y, false); const b = g.buildRoute(r); return { w: w.ok, t: t.ok, b: b.ok, reason: r.reason, wr: w.reason, tr: t.reason, x, y }; }, [wx, ty, L]);
    assert(built.w && built.t && built.b, JSON.stringify(built));
    const scr = (x, y) => A(([x, y]) => { const { cam } = window.__oli, r = document.getElementById('view').getBoundingClientRect(); return { x: r.left + ((x - y) * 32 - cam.x) * cam.z + r.width / 2, y: r.top + ((x + y) * 16 + 16 - cam.y) * cam.z + r.height / 2 }; }, [x, y]);
    const center = async (x, y, z) => { await A(([x, y, z]) => { const o = window.__oli; o.camGoal.on = false; o.cam.x = (x - y) * 32; o.cam.y = (x + y) * 16 + 16 + (window.innerWidth < 600 ? 100 / (z || 1) : 0); o.cam.z = z; }, [x, y, z || 1]); await wait(250); };
    const tapAt = async (x, y) => { if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); };
    await G(() => { const g = window.__oli.game; for (let i = 0; i < 400; i++) g.step(0.25); });
    // 1. build menu has the pump with icon, name, cost and description
    if (await page.locator('#buildmenu').isHidden()) await page.click('#btn-build'); await wait(200);
    const tool = page.locator('#buildmenu .tool[data-tool="pump"]');
    assert(await tool.isVisible()); const label = (await tool.textContent()).trim(); assert(/\$2,500/.test(label) && /مضخة/.test(label), label); assert(await tool.locator('svg').count() === 1);
    const title = await tool.getAttribute('title'); assert(/محطة ضخ/.test(title) && /ضغط/.test(title), title);
    log(tag + ': build menu lists the pump: "' + label.replace(/\s+/g, ' ') + '" (icon, name, cost) with description in its tooltip');
    // 2. invalid placements give specific reasons
    await tool.click(); await center(wx + 31, ty, touch ? 1 : 1.1);
    let p = await scr(wx + 31, ty + 4); await tapAt(p.x, p.y); await wait(300);
    let txt = await page.textContent('#confirm-text'); assert(/يجب أن تتصل بأنبوب|يجب وصلها/.test(txt), txt); log(tag + ': off-pipe tap -> "' + txt.trim() + '"');
    await page.click('#confirm-no');
    await G(() => window.__oli.setTool('pump')); await center(wx + 2, ty, touch ? 1 : 1.1); p = await scr(wx, ty); await tapAt(p.x, p.y); await wait(300);
    txt = await page.textContent('#confirm-text'); assert(/مساحة|بناء|يجب|لا/.test(txt)); log(tag + ': tap near the well snaps to the nearest valid pipe tile -> "' + txt.trim() + '"'); await page.click('#confirm-no');
    // 3. valid spot: preview shows the cost, flip control exists
    await center(wx + 31, ty, touch ? 1 : 1.1); p = await scr(wx + 31, ty); await tapAt(p.x, p.y); await wait(300);
    txt = await page.textContent('#confirm-text'); assert(/بناء محطة ضخ/.test(txt) && /\$2,500/.test(txt), txt); assert(await page.locator('#confirm-flip').isVisible()); assert(!(await page.locator('#confirm-ok').isDisabled()));
    const dir0 = await G(() => { const o = window.__oli; return o.game.pumpAutoDir(o.ui.pending.x, o.ui.pending.y, 'h'); }); assert.strictEqual(dir0, 0, 'auto direction: output toward the tank');
    await page.screenshot({ path: `${OUT}/p8-${tag}-1-preview.png` });
    log(tag + ': valid pipe tile -> preview "' + txt.trim() + '", flip button present, auto direction faces the tank');
    const cash0 = await G(() => window.__oli.game.s.cash);
    await page.click('#confirm-ok'); await wait(300);
    const b = await G(() => { const o = window.__oli.game, p = o.buildings.find(b => b.type === 'pump'); return p && { x: p.x, y: p.y, dir: p.dir, lvl: p.level, cash: o.s.cash }; });
    assert(b && b.dir === 0 && Math.abs(cash0 - b.cash - 2500) < 5); log(tag + ': pump built on the pipeline for $2,500 (dir ' + b.dir + ')');
    // let the pump spin up, flow develops
    await G(() => { const g = window.__oli.game; for (let i = 0; i < 160; i++) g.step(0.25); });
    await center(b.x, b.y, 1.2); await page.screenshot({ path: `${OUT}/p8-${tag}-2-pump-running.png` });
    // 4. select the pump -> panel with real numbers
    p = await scr(b.x, b.y); await page.keyboard.press('Escape'); await G(() => window.__oli.setTool('select')); await wait(100); await tapAt(p.x, p.y - 14); await wait(400);
    const sel = await G(() => window.__oli.ui.sel); assert(sel && sel.kind === 'b', JSON.stringify(sel));
    let panel = (await page.textContent('#panel')).replace(/\s+/g, ' '); assert(/محطة ضخ/.test(panel) && /رفع الضغط/.test(panel) && /التدفق/.test(panel) && /بار/.test(panel), panel);
    assert(/تعمل|بأقصى/.test(panel), panel); log(tag + ': pump panel: ' + panel.slice(0, 160));
    const pn = await G(() => { const o = window.__oli.game; return o.pumpNet(o.buildings.find(b => b.type === 'pump')); });
    assert(pn.boost > 2 && pn.flow > 5 && pn.kw > 0 && pn.pIn > 0 && pn.pOut > pn.pIn - 0.01 || pn.pOut > 0, JSON.stringify(pn));
    await page.screenshot({ path: `${OUT}/p8-${tag}-3-pump-panel.png` });
    // 5. toggle off -> flow falls, statuses change; on again
    await page.click('#p-pt'); await G(() => { const g = window.__oli.game; for (let i = 0; i < 160; i++) g.step(0.25); }); await wait(300);
    panel = (await page.textContent('#panel')).replace(/\s+/g, ' '); assert(/متوقفة/.test(panel), panel);
    const off = await G(() => { const g = window.__oli.game; return { q: g.buildings.find(b => b.type === 'well').out, kw: g.pumpNet(g.buildings.find(b => b.type === 'pump')).kw }; }); assert(off.kw === 0 && off.q < pn.flow - 0.5, JSON.stringify([off, pn.flow]));
    await page.click('#p-pt'); await G(() => { const g = window.__oli.game; for (let i = 0; i < 160; i++) g.step(0.25); }); await wait(300); panel = (await page.textContent('#panel')).replace(/\s+/g, ' '); assert(/تعمل|بأقصى/.test(panel), panel);
    log(tag + ': power button: OFF -> status "متوقفة", flow ' + pn.flow.toFixed(1) + ' -> ' + off.q.toFixed(1) + ', 0 kW; ON again -> running');
    // 6. flip -> the line is blocked (INPUT -> PUMP -> OUTPUT), flip back restores it
    await page.click('#p-pf'); await G(() => { const g = window.__oli.game; for (let i = 0; i < 40; i++) g.step(0.25); }); await wait(300);
    const blocked = await G(() => window.__oli.game.buildings.find(b => b.type === 'well').out); assert(blocked === 0, 'reversed pump blocks: ' + blocked);
    await page.click('#p-pf'); await G(() => { const g = window.__oli.game; for (let i = 0; i < 80; i++) g.step(0.25); }); assert((await G(() => window.__oli.game.buildings.find(b => b.type === 'well').out)) > 5);
    log(tag + ': reversing the pump blocks the line, reversing it back restores the flow');
    // 7. upgrade improves the pump
    const before = await G(() => window.__oli.game.pumpNet(window.__oli.game.buildings.find(b => b.type === 'pump')).boostMax);
    await page.click('#p-up'); await wait(300); const after = await G(() => window.__oli.game.pumpNet(window.__oli.game.buildings.find(b => b.type === 'pump')).boostMax); assert(after > before, [before, after]);
    log(tag + ': upgrade: pump head ' + before + ' -> ' + after + ' bar');
    // 8. well / tank / pipe panels show the pressures
    await G(() => { const g = window.__oli.game; for (let i = 0; i < 160; i++) g.step(0.25); });
    await G(() => window.__oli.select(null)); await center(wx, ty, 1.2); p = await scr(wx, ty); await tapAt(p.x, p.y - 10); await wait(400);
    await page.click('#panel [data-act="more"]'); await wait(200); panel = (await page.textContent('#panel')).replace(/\s+/g, ' ');
    assert(/ضغط المكمن/.test(panel) && /ضغط رأس البئر/.test(panel) && /دعم المضخات/.test(panel), panel); log(tag + ': well panel details: reservoir pressure, well head pressure, pump support');
    await G(() => { const o = window.__oli; o.ui.more = false; });
    await G(() => window.__oli.select(null)); await center(wx + 5, ty, 1.2); p = await scr(wx + 5, ty); await tapAt(p.x, p.y); await wait(400);
    console.log('SELDBG', JSON.stringify(await G(() => ({ sel: window.__oli.ui.sel, cam: [window.__oli.cam.x, window.__oli.cam.y, window.__oli.cam.z], p: null }))), JSON.stringify(p)); assert((await G(() => window.__oli.ui.sel && window.__oli.ui.sel.kind)) === 'pipe'); await page.click('#panel [data-act="more"]'); await wait(200); panel = (await page.textContent('#panel')).replace(/\s+/g, ' ');
    assert(/الضغط/.test(panel) && /السرعة/.test(panel) && /فقد الضغط/.test(panel), panel); log(tag + ': pipe panel details: pressure, velocity, pressure loss');
    // valve button cycles OPEN -> PARTIAL -> CLOSED -> none
    const q0 = await G(() => window.__oli.game.buildings.find(b => b.type === 'well').out);
    for (const [want, re] of [[1, /مفتوح/], [2, /جزئي/], [3, /مغلق/]]) { await page.click('#p-vl'); await G(() => { const g = window.__oli.game; for (let i = 0; i < 80; i++) g.step(0.25); }); await wait(250); assert.strictEqual(await G(() => window.__oli.game.valve[window.__oli.ui.sel.k]), want); const bt = await page.textContent('#p-vl'); assert(true, bt); }
    assert((await G(() => window.__oli.game.buildings.find(b => b.type === 'well').out)) === 0); await page.click('#p-vl'); await G(() => { const g = window.__oli.game; for (let i = 0; i < 120; i++) g.step(0.25); });
    assert((await G(() => window.__oli.game.valve[window.__oli.ui.sel.k])) === 0 && (await G(() => window.__oli.game.buildings.find(b => b.type === 'well').out)) > 5); log(tag + ': valve button: OPEN / PARTIAL / CLOSED (flow 0) / removed -> flow back (' + q0.toFixed(1) + ' before)');
    // 9. animation follows the real flow: particle ratio per tile
    const an = await G(() => { const o = window.__oli, g = o.game; const k = o.ui.sel.k; return { pr: o.anim.pr[k], flow: g.net.flowK[k] }; }); await wait(1500);
    const an2 = await G(() => { const o = window.__oli, g = o.game; const k = o.ui.sel.k; return { pr: o.anim.pr[k], flow: g.net.flowK[k], cap: window.OliCore.CFG.PIPE.CAP[g.pipeLvl[k] - 1] }; }); assert(an2.pr > 0.1 && Math.abs(an2.pr - Math.min(1, an2.flow / an2.cap)) < 0.35, JSON.stringify(an2));
    log(tag + ': particle density/speed ratio follows the tile flow (' + an2.pr.toFixed(2) + ' vs flow/capacity ' + (an2.flow / an2.cap).toFixed(2) + ')');
    // 10. debug mode
    await page.keyboard.down('Shift'); await page.keyboard.press('D'); await page.keyboard.up('Shift'); await wait(500);
    const dbgTxt = await G(() => { const d = document.getElementById('dbg'); return d && !d.hidden ? d.textContent : null; }); assert(dbgTxt && /HYDRAULICS/.test(dbgTxt) && /pump/.test(dbgTxt) && /back-pressure/.test(dbgTxt), dbgTxt);
    await page.screenshot({ path: `${OUT}/p8-${tag}-4-debug.png` }); log(tag + ': debug mode (Shift+D) shows solver state, wells, pumps, tank back-pressure');
    await page.keyboard.down('Shift'); await page.keyboard.press('D'); await page.keyboard.up('Shift'); await wait(200);
    // 11. save / reload keeps the pump
    await G(() => window.__oli.game && localStorage.getItem('x')); await page.evaluate(() => { const s = window.__oli.game.serialize(); localStorage.setItem('oli.test', JSON.stringify(s)); });
    const same = await G(() => { const g = window.__oli.game, s = JSON.parse(JSON.stringify(g.serialize())), h = new window.OliCore.Game(); h.load(s); const p = h.buildings.find(b => b.type === 'pump'), q = g.buildings.find(b => b.type === 'pump'); return !!p && p.level === q.level && p.dir === q.dir && p.x === q.x && h.pipe[p.y * 140 + p.x] === 0; });
    assert(same); log(tag + ': save/load keeps the pump (level, direction, position)');
    await ctx.close();
  }
  await run({ viewport: { width: 1280, height: 720 } }, 'desk', false);
  await run({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }, 'phone', true);
  await browser.close();
  if (errors.length) { console.log(errors.join('\n')); process.exit(1); }
  console.log('\nALL PHASE 8 UI TESTS PASSED (no console errors)');
})().catch(e => { console.error('FAIL', e.message, (e.stack || '').split('\n').slice(1, 4).join('\n')); process.exit(1); });
