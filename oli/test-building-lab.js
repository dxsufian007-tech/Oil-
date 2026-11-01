// Phase 2 building lab: real pointer drags in a real browser on the Phase 1 world.   NODE_PATH=/opt/npm-tools/node_modules node test-building-lab.js [shots-dir]
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const shots = process.argv[2] && path.resolve(process.argv[2]); if (shots) fs.mkdirSync(shots, { recursive: true });
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 412, height: 866 }, deviceScaleFactor: 1 }), p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const url = 'http://localhost:' + srv.address().port + '/?lab=1&lang=en', idle = async () => { await p.waitForTimeout(350); await p.waitForFunction(() => __wp.idle(), null, { timeout: 90000 }); await p.waitForTimeout(150); };
  const shot = async nm => { if (shots) { await idle(); await p.screenshot({ path: path.join(shots, nm + '.png') }); } };
  await p.goto(url); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 });
  await p.evaluate(() => { localStorage.clear(); __lab.reset(); __lab.store.cash = 5e9; __lab.updateCash(); });

  // ---- helpers that run IN the page: a spiral search for a legal spot around the screen centre, then a REAL mouse drag from the palette chip
  await p.evaluate(() => {
    const FULL = new OliBuildings.BuildingStore(OliBuildings.fromWorld(OliWorld.createWorld()), { cash: 1e12 });       // a full-terrain twin that shares the lab's occupancy: finds legal spots even where chunks are not loaded yet
    window.__full = FULL; window.findFar = (def, r, from, maxD) => { const S = __lab.store; FULL.items = S.items; FULL.occ = S.occ; FULL.bucket = S.bucket; const c = from || __wp.cam; for (let d = 0; d < (maxD || 160); d += 1) for (let dy = -d; dy <= d; dy += 1) for (let dx = -d; dx <= d; dx += 1) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue; const x = Math.round(c.x) + dx, y = Math.round(c.y) + dy; if (FULL.validate(def, x, y, r || 0, { ignoreCash: true }).ok) return { x, y }; } return null; };
    window.findSpot = (def, r) => { const S = __lab.store, c = __wp.cam; for (let d = 0; d < 40; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue; const x = Math.round(c.x) + dx, y = Math.round(c.y) + dy; const v = S.validate(def, x, y, r || 0, { ignoreCash: true }); if (v.ok) return { x, y, w: v.w, h: v.h }; } return null; };
  });
  const dragBuild = async (def, spot, rot) => {
    const chip = await p.$('.chip[data-def="' + def + '"]'); await chip.scrollIntoViewIfNeeded(); const bb = await chip.boundingBox();
    const pt = await p.evaluate(s => { const c = { x: s.x + s.w / 2, y: s.y + s.h / 2 }; return { x: __wp.sx(c.x, c.y), y: __wp.sy(c.x, c.y) }; }, spot);
    await p.mouse.move(bb.x + 20, bb.y + 20); await p.mouse.down(); await p.mouse.move(bb.x + 30, bb.y - 40, { steps: 4 }); await p.mouse.move(pt.x, pt.y, { steps: 6 }); await p.mouse.up();
    return pt;
  };
  const verdict = () => p.evaluate(() => { const g = __lab.state.pending; return g && { ok: g.verdict.ok, reason: g.verdict.reason, kind: g.verdict.kind, x: g.x, y: g.y, r: g.r, def: g.def, conns: g.verdict.connections.length }; });
  const count = def => p.evaluate(d => __lab.store.list().filter(b => b.d === d).length, def);
  const camNow = () => p.evaluate(() => [__wp.cam.x, __wp.cam.y, __wp.cam.z]);

  const tab = async sec => { await p.click('#tabs button[data-sec="' + sec + '"]'); await p.waitForTimeout(80); };
  const SEC = { oil_well: 'EXTRACTION', pump_station_s: 'EXTRACTION', pump_station_l: 'EXTRACTION', valve: 'PIPELINE', junction: 'PIPELINE', crude_tank_s: 'CRUDE STORAGE', crude_tank_m: 'CRUDE STORAGE', crude_tank_l: 'CRUDE STORAGE', separator: 'PROCESSING', refinery_s: 'PROCESSING', refinery_m: 'PROCESSING', refinery_l: 'PROCESSING', refinery_x: 'PROCESSING',
    gasoline_tank_s: 'PRODUCT STORAGE', gasoline_tank_m: 'PRODUCT STORAGE', gasoline_tank_l: 'PRODUCT STORAGE', diesel_tank_s: 'PRODUCT STORAGE', diesel_tank_m: 'PRODUCT STORAGE', diesel_tank_l: 'PRODUCT STORAGE', jet_tank_s: 'PRODUCT STORAGE', jet_tank_m: 'PRODUCT STORAGE', jet_tank_l: 'PRODUCT STORAGE', gas_sphere_s: 'PRODUCT STORAGE', gas_sphere_m: 'PRODUCT STORAGE', gas_sphere_l: 'PRODUCT STORAGE' };
  console.log('BUILD MENU (5 sections)');
  ok((await p.$$eval('#tabs button', bs => bs.map(x => x.textContent))).join('|') === 'EXTRACTION|PIPELINE|CRUDE STORAGE|PROCESSING|PRODUCT STORAGE', 'the menu has the 5 sections: EXTRACTION / PIPELINE / CRUDE STORAGE / PROCESSING / PRODUCT STORAGE');
  for (const [sec, n2] of [['EXTRACTION', 3], ['PIPELINE', 2], ['CRUDE STORAGE', 3], ['PROCESSING', 5], ['PRODUCT STORAGE', 12]]) { await tab(sec); ok((await p.$$('#pal .chip')).length === n2, sec + ' lists ' + n2 + ' buildings'); }
  { await tab('EXTRACTION'); const bb = await (await p.$('#pal .chip')).boundingBox(); ok(bb.height >= 60 && bb.width >= 70, 'palette chips are big enough for a finger (' + Math.round(bb.width) + 'x' + Math.round(bb.height) + ' px)'); }

  console.log('PLACE EVERY BUILDING (real mouse drag from the palette + Build button)');
  await p.click('#tFields'); await idle();
  let spot = await p.evaluate(() => findSpot('oil_well')); ok(spot, 'a legal well spot exists inside the drillable field'); await tab('EXTRACTION');
  const cam0 = await camNow(); await dragBuild('oil_well', spot); let v = await verdict(); ok(v && v.ok && v.def === 'oil_well', 'drag Oil Well: the ghost is VALID on the field and waits for Build');
  ok((await camNow()).join() === cam0.join(), 'camera isolation: the camera did not move during the well drag');
  await shot('01-ghost-valid-well'); await p.click('#bBuild'); ok(await count('oil_well') === 1, '1. Oil Well placed');
  await p.evaluate(() => { const sr = __wp.world.regions.find(r => r.starter); __wp.goto(sr.x0 + 200, sr.y0 + 230, .55); }); await idle();
  const rest = ['pump_station_s', 'pump_station_l', 'valve', 'junction', 'crude_tank_s', 'crude_tank_m', 'crude_tank_l', 'separator', 'gasoline_tank_s', 'diesel_tank_m', 'jet_tank_s', 'gas_sphere_s', 'gas_sphere_m'];
  let idx = 2;
  for (const def of rest) { const far = await p.evaluate(d => findFar(d), def); ok(far, 'a legal spot exists for ' + def); await p.evaluate(f => __wp.goto(f.x + 1, f.y + 1, .55), far); await idle(); await tab(SEC[def]);
    const s = await p.evaluate(d => findSpot(d), def); await dragBuild(def, s); v = await verdict(); ok(v && v.ok, 'drag ' + def + ': VALID'); await p.click('#bBuild'); ok(await count(def) === 1, (idx++) + '. ' + def + ' placed'); }
  await p.click('#tRef'); await idle(); await tab('PROCESSING');
  for (const def of ['refinery_m']) { const rf = await p.evaluate(d => findFar(d, 0, __wp.cam, 40), def); await p.evaluate(f => __wp.goto(f.x + 4, f.y + 3, .5), rf); await idle(); const rs = await p.evaluate(d => findSpot(d), def);
    await dragBuild(def, rs); v = await verdict(); ok(v && v.ok, 'drag ' + def + ' into the refinery zone: VALID'); await shot('02-ghost-refinery'); await p.click('#bBuild'); ok(await count(def) === 1, (idx++) + '. ' + def + ' placed'); }
  { const types = await p.evaluate(() => new Set(__lab.store.list().map(b => __lab.B.DEFS[b.d].type)).size); ok(types === 8, 'well, pump, valve, junction, tank, gas storage, separator, refinery all stand in one store (' + types + ' types)'); }
  await shot('03-refinery-built');

  console.log('INVALID PLACEMENTS ARE REFUSED');
  const refin = await p.evaluate(() => __lab.store.list().find(b => b.d === 'refinery_m')); await p.evaluate(r => __wp.goto(r.x + 4, r.y + 3, .55), refin); await idle(); await tab('CRUDE STORAGE');
  await dragBuild('crude_tank_s', { x: refin.x + 1, y: refin.y + 1, w: 2, h: 2 }); v = await verdict(); ok(v && !v.ok && (v.kind === 'OVERLAP' || v.kind === 'CLEARANCE'), 'overlap: a tank dropped on the refinery is red (' + (v && v.kind) + ')');
  ok(await p.evaluate(() => document.getElementById('bBuild').disabled), 'the Build button is disabled while the ghost is invalid'); const before = await p.evaluate(() => __lab.store.list().length); await shot('04-ghost-invalid-overlap');
  await p.evaluate(() => document.getElementById('bBuild').disabled = false); await p.click('#bBuild', { force: true }); ok(await p.evaluate(() => __lab.store.list().length) === before, 'pressing Build on an invalid ghost builds nothing');
  await p.click('#bCancel'); ok(!(await verdict()), 'Cancel removes the ghost');
  const water = await p.evaluate(() => { const w = OliWorld.createWorld(), sr = w.regions.find(r => r.starter); for (let y = sr.y0; y < sr.y0 + 320; y++) for (let x = sr.x0; x < sr.x0 + 320; x++) { const t = w.tile(x, y); if (t.terrain === 'WATER_WADI' && w.tile(x + 1, y).terrain === 'WATER_WADI') return { x, y }; } return null; });
  await p.evaluate(wt => __wp.goto(wt.x, wt.y, .6), water); await idle(); await dragBuild('crude_tank_s', { x: water.x, y: water.y, w: 2, h: 2 }); v = await verdict(); ok(v && !v.ok && v.kind === 'TERRAIN', 'invalid terrain: a tank on water is refused (' + (v && v.reason) + ')'); await p.click('#bCancel');
  await p.evaluate(() => __wp.goto(3, 3, .8)); await idle(); const pt0 = await p.evaluate(() => ({ x: __wp.sx(-3, -3), y: __wp.sy(-3, -3) }));
  { const chip = await p.$('.chip[data-def="crude_tank_s"]'); const bb = await chip.boundingBox(); await p.mouse.move(bb.x + 20, bb.y + 20); await p.mouse.down(); await p.mouse.move(bb.x + 30, bb.y - 40, { steps: 4 }); await p.mouse.move(pt0.x, pt0.y, { steps: 6 }); await p.mouse.up(); }
  v = await verdict(); ok(v && !v.ok && v.kind === 'OUT_OF_BOUNDS', 'map bounds: dropping outside the world is refused (' + (v && v.kind) + ')'); await p.click('#bCancel');
  { const far = await p.evaluate(() => findFar('pump_station_s')); const nf = far; const nf0 = await p.evaluate(() => { const sr = __wp.world.regions.find(r => r.starter); return { x: sr.x0 + 200, y: sr.y0 + 230 }; }); await p.evaluate(f => __wp.goto(f.x + 1, f.y + 1, .6), nf); await idle(); await tab('EXTRACTION'); const s2 = await p.evaluate(() => findSpot('pump_station_s'));
    const chip = await p.$('.chip[data-def="oil_well"]'); const bb = await chip.boundingBox(); const pt = await p.evaluate(s => ({ x: __wp.sx(s.x + .5, s.y + .5), y: __wp.sy(s.x + .5, s.y + .5) }), s2 || { x: nf.x, y: nf.y });
    await p.mouse.move(bb.x + 20, bb.y + 20); await p.mouse.down(); await p.mouse.move(bb.x + 30, bb.y - 40, { steps: 4 }); await p.mouse.move(pt.x, pt.y, { steps: 6 }); await p.mouse.up(); v = await verdict(); ok(v && !v.ok && v.kind === 'OIL', 'a well outside any oil field is refused (' + (v && v.reason) + ')'); await p.click('#bCancel'); }

  console.log('DRAG CANCELLATION + ROTATION');
  { await tab('CRUDE STORAGE'); const chip = await p.$('.chip[data-def="crude_tank_s"]'); const bb = await chip.boundingBox(); const n0 = await p.evaluate(() => __lab.store.list().length);
    await p.mouse.move(bb.x + 20, bb.y + 20); await p.mouse.down(); await p.mouse.move(bb.x + 30, bb.y - 60, { steps: 3 }); await p.mouse.move(200, 400, { steps: 4 }); ok(await p.evaluate(() => !!__lab.state.drag), 'a drag is running'); await p.mouse.move(bb.x + 20, bb.y + 30, { steps: 4 }); await p.mouse.up();
    ok(await p.evaluate(() => !__lab.state.drag && !__lab.state.pending) && await p.evaluate(() => __lab.store.list().length) === n0, 'releasing over the palette cancels: nothing pending, nothing built');
    await p.mouse.move(bb.x + 20, bb.y + 20); await p.mouse.down(); await p.mouse.move(bb.x + 30, bb.y - 60, { steps: 3 }); await p.mouse.move(210, 420, { steps: 4 }); await p.keyboard.press('Escape'); await p.mouse.up(); ok(await p.evaluate(() => !__lab.state.drag && !__lab.state.pending), 'Escape cancels a running drag'); }
  { await p.evaluate(() => { const sr = __wp.world.regions.find(r => r.starter); __wp.goto(sr.x0 + 215, sr.y0 + 245, .6); }); await idle(); await tab('EXTRACTION'); const fs0 = await p.evaluate(() => findFar('pump_station_s')); await p.evaluate(f => __wp.goto(f.x + 1, f.y + 1, .6), fs0); await idle(); const s = await p.evaluate(() => findSpot('pump_station_s')); await dragBuild('pump_station_s', s);
    const a = await p.evaluate(() => { const g = __lab.state.pending; return { r: g.r, c: g.verdict.connections.map(c => [c.id, c.side, c.ax - g.x, c.ay - g.y]) }; }); await p.click('#bRot'); const b2 = await p.evaluate(() => { const g = __lab.state.pending; return { r: g.r, c: g.verdict.connections.map(c => [c.id, c.side, c.ax - g.x, c.ay - g.y]) }; });
    ok(b2.r === (a.r + 1) % 4 && JSON.stringify(a.c) !== JSON.stringify(b2.c), 'Rotate turns the ghost 90 degrees and its connection points move with it'); for (let i = 0; i < 3; i++) await p.click('#bRot'); ok((await p.evaluate(() => __lab.state.pending.r)) === a.r, 'four rotations return to the start'); await p.click('#bCancel'); }

  console.log('PIPES: PRODUCT CONNECTIONS THROUGH THE UI');
  await p.evaluate(() => { __lab.reset(); __lab.store.cash = 5e9; __lab.state.rot = {}; }); await p.evaluate(() => { const sr = __wp.world.regions.find(r => r.starter); __wp.goto(sr.x0 + 205, sr.y0 + 235, .7); }); await idle();
  const sp0 = await p.evaluate(() => { const S = __lab.store, c = __wp.cam; for (let d = 0; d < 120; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue; const x = Math.round(c.x) + dx, y = Math.round(c.y) + dy; if (S.validate('refinery_s', x, y, 0).ok === false && S.validate('gasoline_tank_s', x, y, 0).ok && S.validate('gasoline_tank_s', x + 12, y, 0).ok && S.validate('crude_tank_s', x + 12, y + 8, 0).ok && S.validate('pump_station_s', x, y + 8, 0).ok && S.validate('crude_tank_s', x + 8, y + 8, 0).ok) return { x, y }; } return null; });
  ok(sp0, 'found open ground for the pipe tests'); await p.evaluate(q => __wp.goto(q.x + 6, q.y + 4, .7), sp0); await idle();
  const mk = (def, x, y) => p.evaluate(([d, x, y]) => { const S = __lab.store, sn = S.snap(d, x, y, 0, { radius: 4, ignoreCash: true }); return sn ? S.place(d, sn.x, sn.y, sn.r, { instant: true }).ok : false; }, [def, x, y]);
  await mk('pump_station_s', sp0.x, sp0.y + 8); await mk('crude_tank_s', sp0.x + 8, sp0.y + 8); await mk('gasoline_tank_s', sp0.x + 12, sp0.y); await mk('crude_tank_s', sp0.x + 12, sp0.y + 8 + 6 > 0 ? sp0.y + 8 + 8 : 0);
  await p.evaluate(() => { for (const b of __lab.store.list()) b.st = 'OPERATIONAL'; }); ok(await p.evaluate(() => __lab.store.list().length) === 4, 'pump, 2 crude tanks and a gasoline tank stand');
  const portPt = (bi, pid) => p.evaluate(([bi, pid]) => { const b = __lab.store.list()[bi], w = __lab.B.worldPoints(b).find(q => q.id === pid); return { x: __wp.sx(w.ax + .5, w.ay + .5), y: __wp.sy(w.ax + .5, w.ay + .5), id: b.id }; }, [bi, pid]);
  const drag = async (A, Z) => { await p.mouse.move(A.x, A.y); await p.mouse.down(); await p.mouse.move((A.x + Z.x) / 2, (A.y + Z.y) / 2, { steps: 5 }); await p.mouse.move(Z.x, Z.y, { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(100); };
  await p.click('#tPipe'); const cam1 = await camNow();
  let A = await portPt(0, 'OUTPUT'), Z = await portPt(1, 'INPUT_W'); await drag(A, Z); ok((await camNow()).join() === cam1.join(), 'camera isolation: the pipe drag did not pan the map');
  ok(await p.evaluate(() => __lab.pipes.lines.size) === 1, 'VALID: pump OUTPUT -> crude tank INPUT: the pipeline is laid'); const L1 = await p.evaluate(() => { const l = [...__lab.pipes.lines.values()][0]; return { product: l.product, dia: l.dia, len: l.path.length }; }); ok(L1.product === 'CRUDE' && L1.dia === 16, 'the line knows its ProductType (CRUDE, carried through the transparent pump) and diameter (16")');
  await shot('07-pipe-valid');
  const nBefore = await p.evaluate(() => __lab.pipes.lines.size); A = await portPt(1, 'OUTPUT_E'); Z = await portPt(2, 'INPUT_W'); await drag(A, Z);
  ok(await p.evaluate(() => __lab.pipes.lines.size) === nBefore, 'INVALID: crude tank OUTPUT -> gasoline tank INPUT builds nothing'); ok(/لا يمكن ربط هذين المنتجين/.test(await p.textContent('#toast')), 'the player sees "INVALID PRODUCT CONNECTION"'); await shot('08-pipe-invalid-product');
  A = await portPt(1, 'OUTPUT_S'); Z = await portPt(3, 'INPUT_N'); await drag(A, Z); ok(await p.evaluate(() => __lab.pipes.lines.size) === nBefore + 1, 'VALID: crude tank OUTPUT -> second crude tank INPUT'); await p.click('#tPipe');
  { const t = await p.evaluate(() => { const l = [...__lab.pipes.lines.values()][0], q = l.path[Math.floor(l.path.length / 2)]; return { x: __wp.sx(q[0] + .5, q[1] + .5), y: __wp.sy(q[0] + .5, q[1] + .5) }; }); await p.mouse.click(t.x, t.y); await p.waitForTimeout(150); const txt = await p.textContent('#info'); ok(/خط أنابيب/.test(txt) && /نفط خام/.test(txt) && /القطر/.test(txt) && /الطول/.test(txt) && /السعة/.test(txt) && /التدفق/.test(txt) && /الضغط/.test(txt), 'tapping a pipe shows Product, Diameter, Length, Capacity, Pressure, Current flow'); }
  { await p.evaluate(() => { const t = __lab.store.list()[1]; t.s = t.s || {}; __lab.sim.ensure(t); t.s.vol = 3000; __lab.showBuilding(t.id); }); const txt = await p.textContent('#info'); ok(/Level/.test(txt) && /Capacity/.test(txt) && /Fill/.test(txt) && !/Boost/.test(txt), 'tank panel shows Level / Capacity / Fill and no pump indicators'); ok(/تفاصيل/.test(txt), 'a Details button reveals the rest'); await p.click('#bMore'); ok(/Temperature/.test(await p.textContent('#info')), 'Details shows Pressure / Temperature / Available capacity');
    await p.evaluate(() => __lab.showBuilding(__lab.store.list()[0].id)); const t2 = await p.textContent('#info'); ok(/Pressure In/.test(t2) && /Power/.test(t2), 'pump panel shows Pressure In / Power / Flow'); }

  console.log('DEMOLISH');
  { const n = await p.evaluate(() => __lab.store.list().length); await p.evaluate(() => __lab.showBuilding(__lab.store.list()[1].id)); await p.click('#bDemo'); ok(await p.evaluate(() => __lab.store.list().length) === n, 'Demolish… only asks: nothing is removed by one tap');
    await p.click('#bDemoYes'); ok(/connected/.test(await p.textContent('#info')), 'a building with connected pipes asks a SECOND confirmation'); await p.click('#bDemoYes'); ok(await p.evaluate(() => __lab.store.list().length) === n - 1, 'confirmed twice: the building is removed and the pipes stay (open end)'); }

  console.log('THE FULL CHAIN IN THE GAME + SAVE / LOAD');
  { const r = await p.evaluate(() => __lab.buildDemo()); ok(r.ok && r.total === 12, 'OIL FIELD -> WELLS -> JUNCTION -> PUMP -> PIPE -> SEPARATOR -> CRUDE STORAGE -> REFINERY -> GASOLINE/DIESEL/JET/GAS built in the game (' + r.total + ' buildings, ' + r.pipelines + ' pipelines)'); const ch = r.chain;
    await p.evaluate(() => __lab.sim.run(3)); const st = await p.evaluate(c => Object.values(c).map(id => __lab.sim.status(__lab.store.get(id))), ch); ok(st.every(s => s === 'RUNNING'), 'every building is RUNNING after 3 simulated days (' + st.join(',') + ')');
    const flows = await p.evaluate(c => ({ g: __lab.store.get(c.gasoline).s.vol, d: __lab.store.get(c.diesel).s.vol, j: __lab.store.get(c.jet).s.vol, l: __lab.store.get(c.gas).s.vol }), ch); ok(flows.g > 0 && flows.d > 0 && flows.j > 0 && flows.l > 0, 'gasoline, diesel, jet and gas storage all received product ' + JSON.stringify(flows));
    await p.evaluate(c => { __lab.showBuilding(c.refinery); }, ch); await p.evaluate(c => __wp.goto(__lab.store.get(c.refinery).x, __lab.store.get(c.refinery).y, .55), ch); await idle(); await shot('09-chain-refinery'); await p.evaluate(c => { __lab.showBuilding(c.refinery); }, ch);
    const rt = await p.textContent('#info'); ok(/Feed/.test(rt) && /Throughput/.test(rt) && /Gasoline/.test(rt) && /Efficiency/.test(rt), 'refinery panel shows Feed / Throughput / Products / Efficiency');
    const snap = await p.evaluate(() => { __lab.save(); return JSON.stringify({ s: __lab.store.toJSON(), n: __lab.pipes.toJSON(), c: __lab.store.cash }); });
    await p.reload(); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 }); const snap2 = await p.evaluate(() => JSON.stringify({ s: __lab.store.toJSON(), n: __lab.pipes.toJSON(), c: __lab.store.cash }));
    ok(snap === snap2, 'Save -> Reload -> same buildings, positions, rotations, storage volumes, pipelines, product types and cash');
    const st2 = await p.evaluate(c => { __lab.sim.run(2); return Object.values(c).map(id => __lab.sim.status(__lab.store.get(id))); }, ch); ok(st2.every(s => s === 'RUNNING'), 'after the reload the chain keeps running (' + st2.join(',') + ')'); }

  console.log('RAPID TOUCH + STUCK STATES');
  { await p.evaluate(() => { __lab.reset(); __lab.store.cash = 5e9; const sr = __wp.world.regions.find(r => r.starter); __wp.goto(sr.x0 + 205, sr.y0 + 235, .6); }); await idle(); await tab('PRODUCT STORAGE');
    const errs0 = errs.length, cam2 = await camNow(); const chip = await p.$('.chip[data-def="gasoline_tank_s"]'); const bb = await chip.boundingBox();
    for (let i = 0; i < 25; i++) { await p.mouse.move(bb.x + 20, bb.y + 20); await p.mouse.down(); await p.mouse.move(bb.x + 25 + i, bb.y - 30 - i, { steps: 2 }); await p.mouse.move(150 + i * 5, 300 + i * 4, { steps: 2 }); await p.mouse.move(bb.x + 20, bb.y + 20, { steps: 2 }); await p.mouse.up(); }
    ok(await p.evaluate(() => !__lab.state.drag) && errs.length === errs0, '25 rapid drags + cancels: no stuck drag, no errors'); ok(await p.evaluate(() => __lab.store.list().length) === 0, 'rapid dragging built nothing without a Build press'); await p.evaluate(() => __lab.cancelAll(true));
    for (let i = 0; i < 10; i++) { await p.mouse.click(120 + i * 10, 300); } ok(await p.evaluate(() => !__lab.state.drag && !__lab.state.pending), 'rapid taps on the map leave no ghost behind'); }

  console.log('PERFORMANCE (desktop Chromium, software canvas)');
  { const r = await p.evaluate(() => __lab.buildDemo()); await p.evaluate(c => __wp.goto(__lab.store.get(c.separator).x, __lab.store.get(c.separator).y, .5), r.chain); await idle();
    const stat = await p.evaluate(() => { const t = performance.now(); for (let i = 0; i < 40; i++) { __wp.cam.x += .5; __wp.draw(); } const dr = (performance.now() - t) / 40, t2 = performance.now(); for (let i = 0; i < 400; i++) __lab.sim.step(.01); return { dr, sim: (performance.now() - t2) / 400 }; });
    console.log('  draw ms:', stat.dr.toFixed(2), ' sim step ms:', stat.sim.toFixed(3)); ok(stat.sim < 1, 'one simulation step of the whole chain costs ' + stat.sim.toFixed(3) + ' ms (no per-frame heavy work)'); }
  ok(errs.length === 0, 'no console / page errors: ' + errs.slice(0, 3).join(' | '));
  console.log('BUILDING LAB TESTS PASSED (' + n + ' checks)'); await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
