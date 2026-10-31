// Phase 2 on screen (real touch, phone): pump / valve / pipe panels, warnings bar, valve marks, oil dots that follow the simulation's flow.
const { chromium } = require('/tmp/legacy-pw.js');
const assert = require('assert');
const URL = process.argv[3] || 'file://' + __dirname + '/v2.html', OUT = process.argv[2] || '/tmp/oli-shots-p2'; require('fs').mkdirSync(OUT, { recursive: true });
const log = m => console.log('ok   ' + m);
(async () => {
  const browser = await chromium.launch(), errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2.75, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(URL + (process.argv[4] || '')); await page.waitForTimeout(1500);
  const G = fn => page.evaluate(fn), A = (fn, a) => page.evaluate(fn, a), wait = ms => page.waitForTimeout(ms);
  const TE = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
  const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const tap = async p => { await TE('touchStart', [p]); await frame(); await TE('touchEnd', []); await frame(); await wait(120); };
  const tapEl = async sel => { if (process.env.CLICK) { await A(s => document.querySelector(s).click(), sel); await wait(150); return; } const r = await A(s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, sel); assert(r, 'element ' + sel); await tap(r); };
  const sT = (x, y, dy = 0) => A(([x, y, dy]) => { const v = window.__v2, c = v.tc(x, y); return v.camApi.w2s(c.x, c.y + dy); }, [x, y, dy]);
  const panel = () => G(() => ({ title: document.querySelector('#pn-title').textContent, hidden: document.querySelector('#panel').hidden, rows: Object.fromEntries([...document.querySelectorAll('#pn-rows li')].map(li => [li.querySelector('small').textContent, li.querySelector('b').textContent])), cls: [...document.querySelectorAll('#pn-rows li')].map(li => li.className), btns: [...document.querySelectorAll('#pn-btns button')].map(b => b.dataset.act + (b.classList.contains('on') ? '*' : '')) }));
  const sim = sec => A(sec => { const g = window.__v2.game; for (let i = 0; i < sec * 10; i++) g.step(.1); }, sec);

  // layout (core): a straight main line well -> tank; the pump and the valve are placed through the UI below
  const L0 = await G(() => { const v = window.__v2, g = v.game; g.s.cash = 1e7; window.OliCore.CFG.BUILD = { well: 0, tank: 0, pump: 0, pipeTile: 0, pipeMax: 0 };
    for (const a of g.areas) if (a.st !== 2) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; }
    for (let y = 22; y < 60; y++) for (let x = 32; x < 90; x++) { if (!g.canPlace('well', x, y).ok || !g.canPlace('tank', x + 40, y).ok) continue;
      const w = g.place('well', x, y, 'large').building, t = g.place('tank', x + 40, y).building; v.view.scene.paintGround(true);
      const r = g.routeNodes('B' + w.id, 'B' + t.id, 1); if (!r.ok) { g.removeAt(w.x, w.y); g.removeAt(t.x, t.y); continue; }
      const L = g.buildLine(r).line; for (let i = 0; i < 200; i++) g.step(.1);
      return { X: x, Y: y, W: w.id, T: t.id, L: L.id, cells: L.cells.slice() }; } });
  assert(L0, 'layout'); const cell = i => ({ x: L0.cells[i] % 140, y: (L0.cells[i] / 140) | 0 });
  await A(([x, y]) => { const v = window.__v2, c = v.tc(x, y); v.view.cam.setZoom(1.0); v.view.cam.centerOn(c.x, c.y); v.camApi.clamp(); }, [L0.X + 20, L0.Y]); await wait(400);
  const N = L0.cells.length, IP = 12, IV = N - 14, IA = N - 6; assert(N > 30, 'line length ' + N);
  const look = async (x, y) => { await A(([x, y]) => { const v = window.__v2, c = v.tc(x, y); v.view.cam.centerOn(c.x, c.y + 190 / v.view.cam.zoom); v.camApi.clamp(); }, [x, y]); await wait(250); };   // bring the spot to the upper part of the phone screen (the info panel covers the lower half)
  const flowAt = i => A(k => window.__v2.game.net.flowK[k], L0.cells[i]);

  // ---- 1. the pump button is in the build menu; place a pump on the pipe with real taps (tool -> tap the pipe -> confirm)
  await tapEl('#b-build'); const hasPump = await G(() => !!document.querySelector('#buildmenu [data-tool="pump"]')); assert(hasPump, 'pump button');
  const f0 = await flowAt(IA);
  await tapEl('#buildmenu [data-tool="pump"]'); const pc = cell(IP); await look(pc.x, pc.y); await tap(await sT(pc.x, pc.y)); await wait(200);
  await wait(300);   // release = build when the spot is valid (the same one-gesture placement as for wells and tanks)
  const pumpB = await G(() => { const b = window.__v2.game.buildings.find(q => q.type === 'pump'); return b ? { id: b.id, x: b.x, y: b.y } : null; }); assert(pumpB, 'pump placed through the UI');
  await sim(40); const f1 = await flowAt(IA);
  assert(f1 > f0 + 1, 'the new pump raised the flow: ' + f0 + ' -> ' + f1);
  log('1. pump placed with real taps (menu -> tap the pipe -> confirm): flow ' + f0.toFixed(1) + ' -> ' + f1.toFixed(1) + ' bbl/min');

  // ---- 2. pump panel (tap the pump): Status, Flow, Pressure In/Out, Boost, Head, Operating cost - the numbers of the simulation
  await look(pumpB.x, pumpB.y); await tap(await sT(pumpB.x, pumpB.y, -10)); let p = await panel(); assert(!p.hidden && /^مضخة #/.test(p.title), JSON.stringify(p));
  for (const k of ['الحالة', 'التدفق', 'ضغط الدخول', 'ضغط الخروج', 'دفع الضغط', 'رأس المضخة', 'تكلفة التشغيل']) assert(k in p.rows, 'pump row ' + k + ': ' + JSON.stringify(p));
  const ph = await A(id => { const g = window.__v2.game; return g.pumpHyd(g.buildings.find(b => b.id === id)); }, pumpB.id);
  assert.strictEqual(p.rows['الحالة'], 'تعمل'); assert(p.rows['دفع الضغط'].includes(ph.boost.toFixed(1)) && ph.boost > 1, JSON.stringify([p.rows, ph]));
  await page.screenshot({ path: `${OUT}/p2-pump-on.png` });
  log('2. pump panel: ' + Object.entries(p.rows).map(r => r.join(' ')).join(' | '));

  // ---- 2b. phone-friendly: the pump is selected from several taps around its picture, and using the panel never moves the camera
  const camNow = () => G(() => { const c = window.__v2.view.cam; return [c.scrollX, c.scrollY, c.zoom]; });
  const oth = cell(IP + 6); let hit = 0, tries = 0;
  for (const [dx, dy] of [[0, -10], [-22, -4], [22, -16], [-10, -26], [14, 4], [0, -34]]) {
    await look(oth.x, oth.y); await tap(await sT(oth.x, oth.y)); const t1 = (await panel()).title; assert(!/^مضخة #/.test(t1), 'other tile first: ' + t1);
    await look(pumpB.x, pumpB.y); const sp = await sT(pumpB.x, pumpB.y, 0); await tap({ x: sp.x + dx, y: sp.y + dy }); tries++; if (/^مضخة #/.test((await panel()).title)) hit++;
  }
  assert(hit >= 5, 'pump selectable from taps around its picture: ' + hit + '/' + tries); log('2b. pump selected by ' + hit + '/' + tries + ' taps around its picture (phone finger size)');
  await look(pumpB.x, pumpB.y); await tap(await sT(pumpB.x, pumpB.y, -10)); const cam0 = await camNow();
  for (const a of ['pumpToggle', 'pumpToggle']) { await tapEl('[data-act="' + a + '"]'); await wait(200); }
  const cam1 = await camNow(); assert(cam0.every((v, i) => Math.abs(v - cam1[i]) < 1e-6), 'camera moved while using the pump panel: ' + cam0 + ' -> ' + cam1);
  await A(id => { window.__v2.game.hyd.dirty = true; }, 0); await sim(10);
  log('2c. camera unchanged while tapping the pump panel buttons: ' + cam0.map(v => v.toFixed(2)).join(','));
  // ---- 3. pump OFF through the panel button: boost disappears, the flow falls (not just a label)
  await tapEl('[data-act="pumpToggle"]'); await sim(40); await wait(300); p = await panel();
  const f2 = await flowAt(IA), ph2 = await A(id => { const g = window.__v2.game; return g.pumpHyd(g.buildings.find(b => b.id === id)); }, pumpB.id);
  assert.strictEqual(p.rows['الحالة'], 'متوقفة'); assert.strictEqual(ph2.boost, 0); assert(f2 < f1 - 1, 'flow fell: ' + f1 + ' -> ' + f2);
  await page.screenshot({ path: `${OUT}/p2-pump-off.png` });
  log('3. pump OFF (tap): state ' + p.rows['الحالة'] + ', boost 0, flow ' + f1.toFixed(1) + ' -> ' + f2.toFixed(1)); await tapEl('[data-act="pumpToggle"]'); await sim(40);

  // ---- 4. tap the pipe, add a valve with the panel, close it: flow 0 after it, oil dots stop, warning bar says VALVE CLOSED
  const vc = cell(IV); await look(vc.x, vc.y); const vs = await sT(vc.x, vc.y); await tap(vs); p = await panel()
  for (const k of ['التدفق', 'السعة', 'الاستخدام', 'ضغط الدخول', 'ضغط الخروج', 'فقد الضغط']) assert(k in p.rows, 'pipe row ' + k + ' ' + JSON.stringify(p));
  assert(p.btns.includes('valveAdd'), JSON.stringify(p.btns));
  await tapEl('[data-act="valveAdd"]'); await sim(20); p = await panel();
  assert(p.btns.includes('valve1*') && p.rows['الصمام'] === 'مفتوح', JSON.stringify(p));
  const vk = await G(() => { const g = window.__v2.game; for (const k of g.vlist) return k; });
  const dotsOpen = await G(() => window.__v2.view.scene.fxDots); assert(dotsOpen > 0, 'oil dots while open');
  await page.screenshot({ path: `${OUT}/p2-valve-open.png` });
  for (const k of ['تدفق الصمام', 'ضغط قبل الصمام', 'ضغط بعد الصمام']) assert(k in p.rows, 'valve row ' + k);
  log('4a. valve added from the pipe panel: ' + p.rows['الصمام'] + ', flow ' + p.rows['تدفق الصمام'] + ', before ' + p.rows['ضغط قبل الصمام'] + ' / after ' + p.rows['ضغط بعد الصمام']);
  const tank0 = await A(id => window.__v2.game.buildings.find(b => b.id === id).amt, L0.T);
  const r3 = await A(() => { const b = document.querySelector('[data-act="valve3"]').getBoundingClientRect(); const e = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return [b.x, b.y, b.width, b.height, e && e.outerHTML.slice(0, 80)]; }); console.log('DBGB', JSON.stringify(r3));
  await tapEl('[data-act="valve3"]'); console.log('DBGV', await A(k => window.__v2.game.valve[k], vk)); await sim(25); await wait(500); p = await panel();
  const fAfter = await flowAt(IA), tank1 = await A(id => window.__v2.game.buildings.find(b => b.id === id).amt, L0.T), vh = await A(k => window.__v2.game.valveHyd(k), vk);
  assert.strictEqual(p.rows['الصمام'], 'مغلق'); assert.strictEqual(fAfter, 0); assert.strictEqual(vh.flow, 0);
  await sim(20); const tank2 = await A(id => window.__v2.game.buildings.find(b => b.id === id).amt, L0.T); assert(Math.abs(tank2 - tank1) < 1e-9, 'tank frozen');
  const dotsClosed = await G(() => window.__v2.view.scene.fxDots); assert.strictEqual(dotsClosed, 0, 'no oil dots with the valve closed');
  const wbar = await G(() => ({ hidden: document.querySelector('#warns').hidden, text: document.querySelector('#warns').textContent })); assert(!wbar.hidden && /صمام مغلق/.test(wbar.text), JSON.stringify(wbar));
  await page.screenshot({ path: `${OUT}/p2-valve-closed.png` });
  log('4b. valve CLOSED (tap): flow after it ' + fAfter + ', tank frozen at ' + tank2.toFixed(0) + ' bbl, oil dots ' + dotsOpen + ' -> ' + dotsClosed + ', pressure before ' + p.rows['ضغط قبل الصمام'] + ' / after ' + p.rows['ضغط بعد الصمام'] + ', warning: ' + wbar.text);
  await tapEl('[data-act="valve1"]'); await sim(40); const fRe = await flowAt(IA); assert(fRe > 5, 'reopened'); log('4c. valve reopened (tap): flow ' + fRe.toFixed(1) + ' bbl/min');

  // ---- 5. bottleneck: the part before the pump is a small pipe; the bar says BOTTLENECK, tapping it opens the pipe, upgrading fixes it
  await A(o => { const g = window.__v2.game; for (let i = 0; i < o.IP; i++) g.pipeType[o.cells[i]] = 0; g.rebuildNetwork(); for (let j = 0; j < 400; j++) g.step(.1); }, Object.assign({ IP }, L0)); await wait(500);
  const bw = await G(() => ({ text: document.querySelector('#warns').textContent, n: document.querySelectorAll('#warns button').length })); assert(/اختناق/.test(bw.text), JSON.stringify(bw));
  await tapEl('#warns .w-bottleneck'); p = await panel(); assert(p.cls.includes('u-bottleneck') && /اختناق/.test(p.rows['الاستخدام']), JSON.stringify(p));
  const fb = await flowAt(5); await page.screenshot({ path: `${OUT}/p2-bottleneck.png` });
  await tapEl('[data-act="pipeUp"]'); await sim(40); await wait(500); const fa = await flowAt(5); assert(fa > fb + 2, 'upgrade lifts the flow: ' + fb + ' -> ' + fa);
  log('5. bottleneck: warning "' + bw.text + '" -> tap opens the pipe (' + p.rows['الاستخدام'] + '); upgrade from the panel: flow ' + fb.toFixed(1) + ' -> ' + fa.toFixed(1));

  // ---- 6. starvation: depleted well -> pump STARVED (state + warning), the panel says so
  await A(o => { const g = window.__v2.game; g.areas[g.buildings.find(b => b.id === o.W).area].remaining = 0; g.hyd.dirty = true; for (let i = 0; i < 300; i++) g.step(.1); }, L0); await wait(500);
  await look(pumpB.x, pumpB.y); await tap(await sT(pumpB.x, pumpB.y, -10)); p = await panel(); const wb2 = await G(() => document.querySelector('#warns').textContent);
  assert(/جائعة/.test(p.rows['الحالة']) && /جائعة/.test(wb2), JSON.stringify([p.rows, wb2])); await page.screenshot({ path: `${OUT}/p2-starved.png` });
  log('6. well depleted: pump state "' + p.rows['الحالة'] + '", flow ' + p.rows['التدفق'] + ', warning "' + wb2 + '"');

  // ---- 7. English texts exist for every new label
  const lang = require('fs').readFileSync(__dirname + '/v2-lang.js', 'utf8'), src = require('fs').readFileSync(__dirname + '/v2.js', 'utf8');
  const miss = [...src.matchAll(/T\('((?:[^'\\]|\\.)*)'\)/g)].map(m => m[1]).filter(k => !lang.includes("'" + k + "':")); assert.deepStrictEqual(miss, [], 'untranslated: ' + miss);
  log('7. every text of the new panels has an English translation');
  assert.deepStrictEqual(errors, [], errors.join('\n')); log('no page errors'); await browser.close(); console.log('ALL PHASE 2 UI TESTS PASSED');
})().catch(e => { console.log('FAIL', e.stack || e); process.exit(1); });
