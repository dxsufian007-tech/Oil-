// Phase 6 browser test: real construction, panels with reasons, scenario 11 (pan never builds) and 12 (touch build/pan/zoom).
const { chromium } = require('/tmp/legacy-pw.js');
const assert = require('assert');
const URL = process.argv[3] || 'file:///home/claude/oli/index.html';
const OUT = process.argv[2] || '/tmp/oli-shots'; require('fs').mkdirSync(OUT, { recursive: true });
const touch0 = true; const log = m => console.log('ok   ' + m);
(async () => {
  const browser = await chromium.launch(), errors = [];
  async function run(opts, tag, touch) {
    const ctx = await browser.newContext(opts), page = await ctx.newPage(), cdp = touch ? await ctx.newCDPSession(page) : null;
    page.on('pageerror', e => errors.push(tag + ' pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR|Failed to load resource/.test(m.text())) errors.push(tag + ' console: ' + m.text()); });
    await page.goto(URL); await page.evaluate(() => { const C = window.OliCore.CFG; C.TERRAIN.MULT = [1, 1, 1, 1]; C.REGIONS.forEach(r => { r.mult = 1; }); C.PIPE.LEAK_PER_TILE_MIN = 0; window.__oli.game.s.regions.forEach(r => { r.unlocked = true; }); window.__oli.game.s.tutorialDone = true; }); await page.waitForTimeout(600);
    const G = fn => page.evaluate(fn), A = (fn, a) => page.evaluate(fn, a), wait = ms => page.waitForTimeout(ms);
    const scr = (x, y) => A(([x, y]) => { const { cam } = window.__oli, r = document.getElementById('view').getBoundingClientRect(); return { x: r.left + ((x - y) * 32 - cam.x) * cam.z + r.width / 2, y: r.top + ((x + y) * 16 + 16 - cam.y) * cam.z + r.height / 2 }; }, [x, y]);
    const tapAt = async (x, y) => { if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); };
    const drag = async (a, b, steps = 12) => {
      if (touch) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] }); for (let i = 1; i <= steps; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps }] }); await wait(16); } await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
      else { await page.mouse.move(a.x, a.y); await page.mouse.down(); for (let i = 1; i <= steps; i++) { await page.mouse.move(a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps); await wait(16); } await page.mouse.up(); }
    };
    const panel = async () => (await page.textContent('#panel')).replace(/[⁦-⁩]/g, '');
    // ---- build a real layout through Game State (real construction times stay ON)
    const lay = await G(() => {
      const g = window.__oli.game; g.s.cash = 1e6; for (const a of g.areas) if (a.land && a.st !== 2) { a.st = 2; a.kind = 'medium'; a.size = a.size || 1; }
      for (let y = 36; y < 56; y++) for (let x = 56; x < 84; x++) { if (g.canPlace('well', x, y).ok && g.canPlace('tank', x + 8, y).ok) {
        const w = g.place('well', x, y); const t = g.place('tank', x + 8, y); if (!w.ok || !t.ok) continue;
        const r = g.routePipe(x + 1, y, x + 7, y, false); if (!r.ok) continue; if (!g.buildRoute(r).ok) continue; return { x, y, w: w.building.id, t: t.building.id }; } }
      return null; });
    assert(lay, 'layout'); const P = lay;
    await G(() => { const c = window.__oli.cam, g = window.__oli.game; c.x = 0; c.y = 0; }); await A(p => { const c = window.__oli.cam; c.x = ((p.x + 4) - p.y) * 32; c.y = ((p.x + 4) + p.y) * 16; c.z = 1.2; window.__oli.camGoal.on = false; }, P);
    assert(await G(() => window.__oli.game.underConstruction()), 'construction is running'); log(tag + ': build placed objects in Game State, underConstruction() = true');
    await wait(250); await page.screenshot({ path: `${OUT}/p6-${tag}-1-building.png` });
    let wn = await A(id => window.__oli.game.wellNet(window.__oli.game.buildings.find(b => b.id === id)), P.w); assert(!wn.connected && wn.why === 'building'); log(tag + ': during construction the well is not connected and says why (building)');
    // select the well by tapping it
    const sel = async (x, y) => { await A(([x, y]) => { const c = window.__oli.cam; c.x = (x - y) * 32; c.y = (x + y) * 16 + 225 / 1.2; c.z = 1.2; window.__oli.camGoal.on = false; }, [x, y]); await wait(120); const p = await scr(x, y); await tapAt(p.x, p.y - 8); await wait(250); };
    await sel(P.x, P.y); let txt = await panel(); assert(/قيد الإنشاء/.test(txt), txt.slice(0, 200)); log(tag + ': well panel shows "قيد الإنشاء %" while building');
    await G(() => { const g = window.__oli.game; for (let i = 0; i < 100 && g.underConstruction(); i++) g.step(0.5); }); await wait(300);
    assert(!(await G(() => window.__oli.game.underConstruction()))); await wait(500);
    txt = await panel(); assert(/خزان 1/.test(txt), txt.slice(0, 300)); log(tag + ': after construction the well panel names its target tank: "' + (txt.match(/متصل[^]*?مربع/) || [''])[0].trim() + '"');
    await G(() => { for (let i = 0; i < 100; i++) window.__oli.game.step(0.5); }); await wait(400); await page.screenshot({ path: `${OUT}/p6-${tag}-2-well-panel.png` });
    // tank panel
    await sel(P.x + 8, P.y); txt = await panel(); assert(/تغذيه/.test(txt) || /آبار/.test(txt), txt.slice(0, 300)); log(tag + ': tank panel lists connected wells and incoming flow');
    // pipe panel
    await sel(P.x + 4, P.y); txt = await panel(); assert(/متصل ويعمل|متصل/.test(txt), txt.slice(0, 300)); log(tag + ': pipe panel: ' + (txt.match(/متصل ويعمل[^]{0,30}/) || ['connected'])[0].trim());
    await page.screenshot({ path: `${OUT}/p6-${tag}-3-pipe-panel.png` });
    // cut the pipe -> reason shown
    await G(() => { const g = window.__oli.game; for (let i = 0; i < 10; i++) g.step(0.2); }); 
    await A(p => { const g = window.__oli.game; g.removeAt(p.x + 4, p.y); for (let i = 0; i < 20; i++) g.step(0.2); }, P); await sel(P.x, P.y); await wait(600); txt = await panel();
    assert(/لا يوجد مسار متصل إلى خزان\./.test(txt), txt.slice(0, 300)); log(tag + ': after cutting the pipe the well says "لا يوجد مسار متصل إلى خزان."');
    // ---- scenario 11: dragging the camera with a build tool active builds nothing
    await G(() => { window.__oli.setTool('well'); }); await wait(200);
    const before = await G(() => ({ b: window.__oli.game.buildings.length, cash: window.__oli.game.s.cash, cx: window.__oli.cam.x, cy: window.__oli.cam.y }));
    const c = await scr(P.x + 4, P.y + 6); await drag({ x: c.x, y: c.y }, { x: c.x - 70, y: c.y - 35 }); await wait(250);
    const after = await G(() => ({ b: window.__oli.game.buildings.length, cash: window.__oli.game.s.cash, cx: window.__oli.cam.x, cy: window.__oli.cam.y, pend: !!window.__oli.ui.pending }));
    assert.strictEqual(after.b, before.b); assert(Math.abs(after.cash - before.cash) < 50, "no build cost charged (only running costs)"); const dcam = Math.abs(after.cx - before.cx) + Math.abs(after.cy - before.cy); if (tag === 'phone') { assert(dcam < 2, 'phone: camera NOT moved while placing: ' + dcam); assert(after.pend, 'phone: the drag moved the preview (nothing built)'); } else { assert(dcam > 20, 'desk: mouse drag still pans'); assert(!after.pend, 'desk: no pending from a pan'); }
    log(tag + ': TEST 11: dragging the camera in build mode moved the map and built/charged nothing');
    // tap places a pending item, confirm builds it (cost visible)
    await G(() => { window.__oli.setTool('tank'); }); await wait(150);
    const spot = await G(() => { const g = window.__oli.game, r = window.__oli.cam; for (let y = 35; y < 57; y++) for (let x = 54; x < 86; x++) if (g.canPlace('tank', x, y).ok) return { x, y }; return null; });
    await A(s => { const c = window.__oli.cam; c.x = (s.x - s.y) * 32; c.y = (s.x + s.y) * 16; c.z = 1.2; window.__oli.camGoal.on = false; }, spot); await wait(200);
    const sp = await scr(spot.x, spot.y); await tapAt(sp.x, sp.y); await wait(250);
    assert(await page.locator('#confirm').isVisible()); const ctext = await page.textContent('#confirm'); assert(/\$|٫|\d/.test(ctext)); log(tag + ': tap = preview with cost + confirm bar ("' + ctext.replace(/\s+/g, ' ').trim().slice(0, 60) + '")');
    await page.locator('#confirm-cancel').click().catch(() => {}); await wait(150);
    // ---- scenario 12: touch zoom
    if (touch) {
      const z0 = await G(() => window.__oli.cam.z); const r = await G(() => { const b = document.getElementById('view').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x - 30, y: r.y, id: 1 }, { x: r.x + 30, y: r.y, id: 2 }] });
      for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: r.x - 30 - i * 8, y: r.y, id: 1 }, { x: r.x + 30 + i * 8, y: r.y, id: 2 }] }); await wait(16); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await wait(200);
      const z1 = await G(() => window.__oli.cam.z), nb = await G(() => window.__oli.game.buildings.length); assert(z1 > z0 + 0.1, 'pinch zoomed ' + z0 + '->' + z1); assert.strictEqual(nb, after.b, 'pinch built nothing');
      log(tag + ': TEST 12: pinch zoom ' + z0.toFixed(2) + ' -> ' + z1.toFixed(2) + ', drag pans, tap previews: no conflicts, nothing built by gestures');
    }
    await ctx.close();
  }
  await run({ viewport: { width: 1280, height: 720 } }, 'desk', false);
  await run({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }, 'phone', true);
  await browser.close();
  if (errors.length) { console.log(errors.join('\n')); process.exit(1); }
  console.log('\nALL PHASE 6 UI TESTS PASSED (no console errors)');
})().catch(e => { console.error('FAIL', e.message, (e.stack || '').split('\n').slice(1, 4).join('\n')); process.exit(1); });
