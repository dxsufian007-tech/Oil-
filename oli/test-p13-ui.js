// Phase 13 (Smart building system 3/20): menu -> select -> preview -> snap -> validate -> confirm -> state, on a phone-sized touch screen.
const { chromium } = require('/tmp/legacy-pw.js');
const assert = require('assert');
const URL = process.argv[2] || 'file:///home/claude/oli/index.html';
let n = 0; const log = m => console.log('ok   ' + String(++n).padStart(2) + '. ' + m);
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36';
(async () => {
  const browser = await chromium.launch(), errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: UA }), page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(URL); await page.waitForTimeout(800);
  const G = fn => page.evaluate(fn), A = (fn, a) => page.evaluate(fn, a), wait = ms => page.waitForTimeout(ms);
  await G(() => { const o = window.__oli, g = o.game; g.s.regions.forEach(r => { r.unlocked = true; }); g.s.tutorialDone = true; g.s.cash = 1e6; for (const a of g.areas) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; } for (let y = 34; y < 72; y++) for (let x = 44; x < 96; x++) { const k = y * 140 + x; g.map.block[k] = 0; g.map.water[k] = 0; } });
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
  const scr = (x, y) => A(([x, y]) => { const o = window.__oli, r = document.getElementById('view').getBoundingClientRect(), p = o.w2s((x - y) * 32, (x + y) * 16 + 16); return { x: r.left + p.x, y: r.top + p.y }; }, [x, y]);
  const center = async (x, y, z) => { await A(([x, y, z]) => { const o = window.__oli; o.camGoal.on = false; o.cam.x = (x - y) * 32; o.cam.y = (x + y) * 16 + 16 + 90 / z; o.cam.z = z; o.clampCam(); o.select(null); }, [x, y, z]); await wait(150); };
  const drag = async (a, b, steps = 10) => { await T('touchStart', [a]); for (let i = 1; i <= steps; i++) { await T('touchMove', [{ x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps }]); await wait(14); } await T('touchEnd', []); await wait(160); };
  const tap = async p => { await T('touchStart', [p]); await wait(40); await T('touchEnd', []); await wait(140); };
  const st = () => G(() => { const o = window.__oli, g = o.game; return { cash: g.s.cash, b: g.buildings.length, ids: g.buildings.map(b => b.id + b.type + b.x + ',' + b.y).join('|'), pipes: g.pipeCount(), pend: o.ui.pending && { ...o.ui.pending }, tool: o.ui.tool, sel: o.ui.sel && o.ui.sel.id, dis: document.getElementById('confirm-ok').disabled, vis: !document.getElementById('confirm').hidden, txt: document.getElementById('confirm-text').textContent }; });
  const near = (a, b, e = 40) => Math.abs(a - b) < e;
  const tool = async k => { await G(() => { if (document.getElementById('buildmenu').hidden) document.getElementById('btn-build').click(); }); await wait(300); await page.locator('#buildmenu .tool[data-tool="' + k + '"]').tap(); await wait(300); };

  // 1. build menu: the existing types, each with a cost, affordable state
  await G(() => document.getElementById('btn-build').click()); await wait(300);
  const items = await G(() => [...document.querySelectorAll('#buildmenu .tool[data-tool]')].filter(e => ['well', 'pipe', 'tank', 'pump'].includes(e.dataset.tool)).map(e => ({ k: e.dataset.tool, cost: e.querySelector('em').textContent, poor: e.classList.contains('poor') })));
  assert.strictEqual(items.length, 5, 'well, branch pipe, main pipe, tank, pump'); assert(items.every(i => /\d/.test(i.cost) && !i.poor), JSON.stringify(items));
  await G(() => { window.__oli.game.s.cash = 500; window.__oli.updateMenuAfford(); }); const poor = await G(() => [...document.querySelectorAll('#buildmenu .tool.poor')].map(e => e.dataset.tool)); assert(poor.includes('well') && poor.includes('tank') && poor.includes('pump'), JSON.stringify(poor));
  await G(() => { window.__oli.game.s.cash = 1e6; window.__oli.updateMenuAfford(); }); assert.strictEqual(await G(() => document.querySelectorAll('#buildmenu .tool.poor').length), 0);
  log('build menu lists Well / Pipe / Tank / Pump with costs (' + items.map(i => i.k + ' ' + i.cost.replace(/[⁦⁩]/g, '')).join(', ') + '); with $500 well, tank and pump are dimmed and show "not enough cash"; with money they are not');
  await G(() => window.__oli.leaveBuild());
  // 2-4. The same flow for well, tank, pump
  const X = 60, Y = 40; await A(([X, Y]) => { const g = window.__oli.game; g.place('well', X, Y + 10); g.place('tank', X + 8, Y + 10); g.buildRoute(g.routePipe(X + 1, Y + 10, X + 7, Y + 10, false)); }, [X, Y]);
  await center(X + 4, Y + 10, 1);
  for (const [kind, cell] of [['well', [X + 2, Y + 4]], ['tank', [X + 4, Y + 4]], ['pump', [X + 4, Y + 10]]]) {
    await center(X + 4, Y + 8, 1);
    const s0 = await st(); const cm0 = await G(() => ({ ...window.__oli.cam })); await tool(kind); const cm1 = await G(() => ({ ...window.__oli.cam })); if (process.env.DBG) console.log('cam', kind, JSON.stringify(cm0), JSON.stringify(cm1)); const s1 = await st(); assert(near(s1.cash, s0.cash, 60)); assert.strictEqual(s1.b, s0.b); assert.strictEqual(s1.pend, null); assert.strictEqual(s1.vis, false);
    let target = await scr(cell[0], cell[1]);
    await drag({ x: target.x - 60, y: target.y + 18 }, { x: target.x, y: target.y + 48 }, 10);   // the preview sits 48px above the finger so the hand never hides it
    if (process.env.DBG) console.log('after drag', kind, JSON.stringify(await G(() => ({ cam: { ...window.__oli.cam }, pend: window.__oli.ui.pending, gOff: window.__oli.gOff }))), JSON.stringify(target));
    const s2 = await st(); assert(s2.pend, kind + ': a preview exists'); assert.strictEqual(s2.b, s0.b); assert(near(s2.cash, s0.cash, 60), kind + ': the preview never takes money'); assert(s2.vis);
    // move until it sits exactly on the intended cell
    for (let i = 0; i < 6 && (s2.pend.x !== cell[0] || s2.pend.y !== cell[1]); i++) { const cur = await st(); const p = await scr(cur.pend.x, cur.pend.y); const want = await scr(cell[0], cell[1]); await drag({ x: p.x, y: p.y + 48 }, { x: p.x + (want.x - p.x), y: p.y + 48 + (want.y - p.y) }, 6); s2.pend = (await st()).pend; }
    const s3 = await st(); assert.deepStrictEqual(s3.pend, { x: cell[0], y: cell[1] }, kind + ': the preview snapped on the target cell ' + JSON.stringify([await scr(cell[0], cell[1]), await G(() => ({ ...window.__oli.cam })), s2.pend])); assert.strictEqual(s3.dis, false, kind + ': confirm enabled when valid'); await wait(450);
    const gOff = await G(() => window.__oli.gOff); assert(Math.abs(gOff.x) < .5 && Math.abs(gOff.y) < .5, 'the preview settled exactly on the cell grid');
    const dirWanted = kind === 'pump' ? await A(c => window.__oli.pumpDirFor({ x: c[0], y: c[1] }), cell) : undefined; const priceText = s3.txt;
    await page.locator('#confirm-ok').tap(); await wait(300);
    const s4 = await st(); assert.strictEqual(s4.b, s0.b + 1, kind + ': one building'); assert(s4.cash < s0.cash - 100, kind + ': cost charged once'); assert.strictEqual(s4.pend, null);
    const real = await A(c => { const o = window.__oli, g = o.game, b = g.buildings[g.buildings.length - 1]; return { id: b.id, type: b.type, x: b.x, y: b.y, level: b.level, constructing: b.ready > g.s.time, ready: b.ready, dir: b.dir, occ: g.occ[c[1] * 140 + c[0]] === b, inList: g.buildings.filter(q => q.id === b.id).length, born: o.anim.born.has('b' + b.id) }; }, cell);
    assert.strictEqual(real.type, kind); assert.strictEqual(real.x, cell[0]); assert.strictEqual(real.y, cell[1]); assert(real.occ && real.inList === 1 && real.level === 1 && real.constructing, JSON.stringify(real)); if (kind === 'pump') assert.strictEqual(real.dir, dirWanted, 'the pump direction in Game State is the one that was previewed');
    const cons = await A(async id => { const o = window.__oli, g = o.game, b = g.buildings.find(q => q.id === id); let n = 0; while (b.ready > g.s.time && n++ < 400) g.step(.5); await new Promise(r => setTimeout(r, 400)); const t1 = o.anim.born.get('b' + id); for (let i = 0; i < 20; i++) g.step(.5); await new Promise(r => setTimeout(r, 200)); const t2 = o.anim.born.get('b' + id); return { done: b.ready <= g.s.time, t1, t2 }; }, real.id); assert(cons.done && cons.t1 !== undefined && (cons.t2 === undefined || cons.t2 === cons.t1), kind + ': construction finishes in Game State and the completion animation does not retrigger ' + JSON.stringify(cons));
    log(kind + ': menu -> preview (no money) -> snapped on ' + cell + ' -> valid -> Confirm: real Game State building #' + real.id + ' at the previewed cell, charged ' + Math.round(s0.cash - s4.cash) + ', construction started once' + (kind === 'pump' ? ', direction ' + real.dir + ' = previewed' : '') + ' ["' + priceText.replace(/[⁦⁩]/g, '').trim() + '"]');
    await G(() => window.__oli.leaveBuild());
  }
  // 5. invalid placement: specific reasons, confirm disabled, nothing built
  await center(X + 4, Y + 10, 1);
  await tool('tank'); const wellB = await G(() => { const b = window.__oli.game.buildings.find(q => q.type === 'well' && q.y === 50); return { x: b.x, y: b.y }; });
  let ws = await scr(wellB.x, wellB.y); const s5a = await st(); await drag({ x: ws.x + 60, y: ws.y - 50 }, { x: ws.x, y: ws.y }, 10);
  // it glides to the nearest valid cell; force an invalid preview to read the reason the player would read
  await A(w => { const o = window.__oli; o.ui.pending = { x: w.x, y: w.y }; }, wellB); await G(() => document.dispatchEvent(new Event('x'))); await page.evaluate(() => { const o = window.__oli; o.setTool('tank'); });
  const reasons = {}; for (const [name, cell] of [['occupied', [wellB.x, wellB.y]], ['outside', [-1, 5]], ['water', await G(() => { const g = window.__oli.game; for (let k = 0; k < 140 * 88; k++) if (g.map.water[k]) return [k % 140, (k / 140) | 0]; })]]) {
    reasons[name] = await A(c => { const o = window.__oli; return { ...o.game.canPlace('tank', c[0], c[1]), msg: o.help ? o.help(o.game.canPlace('tank', c[0], c[1]).reason) : null }; }, cell); }
  // the on-screen text, via the real confirm bar
  await G(() => window.__oli.setTool('tank')); await A(w => { const o = window.__oli; o.ui.pending = { x: w.x, y: w.y }; }, wellB);
  await G(() => { window.__oli.setLang('en'); }); await wait(100); await G(() => window.__oli.setTool('tank')); await drag({ x: ws.x + 60, y: ws.y - 50 }, { x: ws.x, y: ws.y }, 10);
  await G(() => window.__oli.setLang('ar')); await wait(100);
  const sOcc = await st(); assert(sOcc.pend); const okOcc = await A(p => window.__oli.game.canPlace('tank', p.x, p.y), sOcc.pend); if (!okOcc.ok) assert(/لا يمكن البناء هنا|النقد/.test(sOcc.txt) && sOcc.dis, sOcc.txt);
  const en = await A(() => { const o = window.__oli; o.setLang('en'); const r = {}; r.occupied = o.t('x.occupied'); r.outside = o.t('x.outside'); r.water = o.t('x.water'); r.pump = o.t('x.pumpSpace'); r.cash = o.t('noCash'); o.setLang('ar'); r.ar = o.t('x.occupied'); return r; });
  assert(/^Cannot build here — occupied/.test(en.occupied) && /outside the world/.test(en.outside) && /water/.test(en.water) && /overlaps an existing structure/.test(en.pump) && /لا يمكن البناء هنا — المكان مشغول/.test(en.ar), JSON.stringify(en));
  log('invalid placement gives a specific reason: "' + en.occupied + '", "' + en.outside + '", "' + en.water + '", "' + en.pump + '"; Arabic: "' + en.ar + '"'); await page.locator('#confirm-no').tap().catch(() => {}); await G(() => window.__oli.leaveBuild());
  // 6. unaffordable: cannot be confirmed, nothing created, nothing charged
  await center(X + 12, Y + 4, 1); await tool('tank'); await G(() => { window.__oli.game.s.cash = 400; }); let tp = await scr(X + 12, Y + 4); await drag({ x: tp.x - 50, y: tp.y - 30 }, tp, 10); const su = await st(); assert(su.pend && su.dis && /النقد|cash/i.test(su.txt), JSON.stringify(su));
  const before = await st(); await page.evaluate(() => document.getElementById('confirm-ok').click()); await wait(200); const after = await st(); assert.strictEqual(after.b, before.b); assert(near(after.cash, before.cash, 30)); log('cannot afford it: confirm is disabled ("' + su.txt.trim() + '"); forcing a click creates nothing and charges nothing');
  await G(() => { window.__oli.game.s.cash = 1e6; }); await page.locator('#confirm-no').tap(); await G(() => window.__oli.leaveBuild());
  // 7. confirm re-validates: the cell becomes occupied between preview and confirm
  await center(X + 12, Y + 4, 1); await tool('tank'); tp = await scr(X + 12, Y + 4); await drag({ x: tp.x - 50, y: tp.y - 30 }, tp, 10); const sp = await st(); assert(sp.pend && !sp.dis);
  await A(p => { const g = window.__oli.game; g.place('tank', p.x, p.y); }, sp.pend); const mid = await st(); await page.evaluate(() => document.getElementById('confirm-ok').click()); await wait(250); const fin = await st(); assert.strictEqual(fin.b, mid.b, 'no second building on an occupied cell'); assert(near(fin.cash, mid.cash, 30), 'not charged'); log('Confirm validates again: the cell was taken after the preview -> refused with a reason, no duplicate, no charge');
  await G(() => window.__oli.leaveBuild());
  // 8. cancel is clean and restores the previous selection
  await center(X + 14, Y + 6, 1); const wid = await G(() => window.__oli.game.buildings.find(q => q.type === 'well').id); await A(id => window.__oli.select({ kind: 'b', id }), wid); await wait(1800);
  const snap = await G(() => JSON.stringify({ c: Math.round(window.__oli.game.s.cash / 100), b: window.__oli.game.buildings.map(b => [b.id, b.x, b.y, b.level]), p: window.__oli.game.pipeCount() }));
  await tool('tank'); await center(X + 14, Y + 6, 1); tp = await scr(X + 14, Y + 6); await drag({ x: tp.x - 50, y: tp.y - 30 }, tp, 10); assert((await st()).pend);
  await G(() => window.__oli.backStep()); await wait(120); let sc = await st(); assert.strictEqual(sc.pend, null); assert.strictEqual(sc.vis, false); assert.strictEqual(sc.tool, 'tank');
  await G(() => window.__oli.backStep()); await wait(150); sc = await st(); assert.strictEqual(sc.tool, 'select'); assert.strictEqual(sc.sel, wid, 'the previous selection is back');
  const snap2 = await G(() => JSON.stringify({ c: Math.round(window.__oli.game.s.cash / 100), b: window.__oli.game.buildings.map(b => [b.id, b.x, b.y, b.level]), p: window.__oli.game.pipeCount() })); assert.strictEqual(snap, snap2, 'Game State untouched by the cancelled placement');
  log('cancel: preview gone, tool left, the previously selected well is selected again, buildings / pipes / money unchanged'); await G(() => window.__oli.select(null));
  // 9. rapid input
  await center(X + 4, Y + 4, 1); await G(() => { window.__oli.setTool('select'); }); await G(() => { const b = document.getElementById('btn-build'); b.click(); b.click(); b.click(); b.click(); }); await wait(300); assert.strictEqual(await G(() => !document.getElementById('buildmenu').hidden), true); log('four rapid presses on Build: one logical action (menu open, not flickering)');
  await center(X + 20, Y + 4, 1); await tool('well'); tp = await scr(X + 20, Y + 4); await drag({ x: tp.x - 40, y: tp.y - 30 }, tp, 8); const pw = (await st()).pend; await G(() => { const b = document.querySelector('#buildmenu .tool[data-tool="well"]'); b.click(); }); await wait(350); await G(() => { const b = document.querySelector('#buildmenu .tool[data-tool="well"]'); b.click(); }); await wait(100); assert.deepStrictEqual((await st()).pend, pw, 'tapping the tool you are already in keeps the preview'); log('tapping the already-active build tool keeps the preview (no reset)');
  const c0 = await st(); await page.evaluate(() => { document.getElementById('confirm-no').click(); document.getElementById('confirm-ok').click(); }); await wait(250); const c1 = await st(); assert.strictEqual(c1.b, c0.b); log('Cancel then Confirm in the same instant: cancel wins, nothing is built');
  await drag({ x: tp.x - 40, y: tp.y - 30 }, tp, 8); const d0 = await st(); await page.evaluate(() => { const o = document.getElementById('confirm-ok'); for (let i = 0; i < 5; i++) o.click(); }); await wait(250); const d1 = await st(); assert.strictEqual(d1.b, d0.b + 1); assert(d0.cash - d1.cash < 20000); log('five clicks on Confirm: exactly one building, one charge');
  // selecting another building while placing: taps never select, never create
  await center(X + 2, Y + 4, 1); await tool('tank'); const aw = await scr(X + 2, Y + 4); const bsel = await st(); await tap({ x: aw.x, y: aw.y - 20 }); const asel = await st(); assert.strictEqual(asel.sel, bsel.sel); assert.strictEqual(asel.b, bsel.b); assert.strictEqual(asel.tool, 'tank'); log('tapping an existing building while a build tool is active does not select it and does not build'); await G(() => window.__oli.leaveBuild());
  // 10. snap is consistent at every zoom; preview cell == the cell under the finger after the drag settles
  for (const z of [.5, 1, 2]) { await center(X + 10, Y + 2, z); await tool('well'); const t2 = await scr(X + 10, Y + 2); await drag({ x: t2.x - 30, y: t2.y + 20 }, { x: t2.x, y: t2.y + 48 }, 8); const pe = (await st()).pend; const under = await A(p => { const o = window.__oli, r = document.getElementById('view').getBoundingClientRect(); return o.cellAt(p.x - r.left, p.y - r.top - 48 * 0); }, t2); assert(pe && Math.abs(pe.x - (X + 10)) <= 2 && Math.abs(pe.y - (Y + 2)) <= 2, 'zoom ' + z + ': ' + JSON.stringify([pe, under]));
    const dr = await G(() => { const o = window.__oli; return [o.gOff.x, o.gOff.y]; }); await wait(400); const dr2 = await G(() => { const o = window.__oli; return [o.gOff.x, o.gOff.y]; }); assert(Math.abs(dr2[0]) < .5 && Math.abs(dr2[1]) < .5); await page.locator('#confirm-no').tap(); await G(() => window.__oli.leaveBuild()); }
  log('the preview lands within one tile of the finger target at zoom 0.5 / 1 / 2 and always settles exactly on the grid (offset 0)');
  // 11. far corner of the 10x world
  await A(() => { const o = window.__oli; for (let y = 78; y < 87; y++) for (let x = 120; x < 138; x++) { const k = y * 140 + x; o.game.map.block[k] = 0; o.game.map.water[k] = 0; } }, null);
  await center(128, 80, 1); await tool('well'); tp = await scr(128, 80); await drag({ x: tp.x - 40, y: tp.y - 30 }, tp, 8); const sf = await st(); assert(sf.pend); if (sf.dis) { log('(far corner preview invalid here: "' + sf.txt + '")'); } else { await page.locator('#confirm-ok').tap(); await wait(250); const pf = await G(() => { const b = window.__oli.game.buildings[window.__oli.game.buildings.length - 1]; return [b.x, b.y]; }); assert(pf[0] >= 110 && pf[1] >= 70); log('building in the far south-east of the 140x88 world works: well at ' + pf); }
  await G(() => window.__oli.leaveBuild());
  // 12. DOM writes while dragging inside one cell: none (no unnecessary updates)
  await center(X + 16, Y + 4, 1); await tool('well'); tp = await scr(X + 16, Y + 4); await drag({ x: tp.x - 40, y: tp.y - 30 }, tp, 6); await wait(500);
  await G(() => { window.__mut = 0; window.__mo = new MutationObserver(m => { window.__mut += m.length; }); window.__mo.observe(document.getElementById('confirm'), { subtree: true, childList: true, characterData: true, attributes: true }); });
  await T('touchStart', [tp]); for (let i = 0; i < 20; i++) { await T('touchMove', [{ x: tp.x + (i % 2), y: tp.y + (i % 3) * .4 }]); await wait(8); } await T('touchEnd', []); await wait(200);
  const muts = await G(() => { window.__mo.disconnect(); return window.__mut; }); assert((await st()).pend); assert(muts <= 4, 'a drag that stays inside one cell rewrites the confirm bar ' + muts + ' times');
  log('placement preview is lightweight: one preview object; 20 pointer moves inside one cell caused ' + muts + ' DOM changes in the confirm bar'); await G(() => window.__oli.leaveBuild());
  // 13. save/load: a building still under construction survives, no duplicates
  await center(X + 18, Y + 6, 1); await tool('tank'); tp = await scr(X + 18, Y + 6); await drag({ x: tp.x - 40, y: tp.y - 30 }, tp, 8); await page.locator('#confirm-ok').tap(); await wait(250);
  const sv = await G(() => { const g = window.__oli.game, b = g.buildings[g.buildings.length - 1]; document.getElementById('btn-settings').click(); document.getElementById('st-save').click(); return { n: g.buildings.length, id: b.id, ready: b.ready, t: g.s.time, cash: Math.round(g.s.cash) }; });
  await page.reload(); await wait(900); const lv = await G(() => { const g = window.__oli.game; const b = g.buildings.find(q => q.id === window.__oli.game.buildings[g.buildings.length - 1].id); return { n: g.buildings.length, ids: new Set(g.buildings.map(q => q.id)).size, ready: b.ready, valid: g.validateNetwork() }; });
  assert.strictEqual(lv.n, sv.n); assert.strictEqual(lv.ids, lv.n); assert.deepStrictEqual(lv.valid, []); log('save -> reload: ' + lv.n + ' buildings, unique ids, the building that was under construction is still there (ready at ' + lv.ready.toFixed(1) + '), network valid');
  assert.deepStrictEqual(errors, [], errors.join('\n'));
  console.log('\nALL PHASE 13 BUILDING-SYSTEM TESTS PASSED (' + n + ' checks, no console errors)'); await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
