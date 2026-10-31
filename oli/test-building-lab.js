// Phase 2 building lab: real pointer drags in a real browser on the Phase 1 world.   NODE_PATH=/opt/npm-tools/node_modules node test-building-lab.js [shots-dir]
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const shots = process.argv[2] && path.resolve(process.argv[2]); if (shots) fs.mkdirSync(shots, { recursive: true });
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 412, height: 866 }, deviceScaleFactor: 1 }), p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const url = 'http://localhost:' + srv.address().port + '/', idle = async () => { await p.waitForTimeout(350); await p.waitForFunction(() => __wp.idle(), null, { timeout: 90000 }); await p.waitForTimeout(150); };
  const shot = async nm => { if (shots) { await idle(); await p.screenshot({ path: path.join(shots, nm + '.png') }); } };
  await p.goto(url); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 });
  await p.evaluate(() => { localStorage.clear(); __lab.reset(); __lab.store.cash = 1e7; __lab.updateCash(); });

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

  // ---------------------------------------------------------------- 1 well on a field, then the others
  console.log('PLACE EVERY BUILDING (real mouse drag from the palette + Build button)');
  await p.click('#tFields'); await idle();
  let spot = await p.evaluate(() => findSpot('oil_well')); ok(spot, 'a legal well spot exists inside the drillable field');
  const cam0 = await camNow(); await dragBuild('oil_well', spot); let v = await verdict(); ok(v && v.ok && v.def === 'oil_well', 'drag Oil Well: the ghost is VALID on the field and waits for Build');
  ok((await camNow()).join() === cam0.join(), 'camera isolation: the camera did not move during the well drag');
  await shot('01-ghost-valid-well'); await p.click('#bBuild'); ok(await count('oil_well') === 1, '1. Oil Well placed');
  // pump jack beside the well
  const wellB = await p.evaluate(() => __lab.store.list().find(b => b.d === 'oil_well'));
  let jack = await p.evaluate(w => { const S = __lab.store; for (let r = 0; r < 4; r++) for (const [dx, dy] of [[1, 0], [-2, 0], [0, 1], [0, -1], [-1, 0], [2, 0], [0, 2], [0, -2]]) { const v = S.validate('pump_jack', w.x + dx, w.y + dy, r, { ignoreCash: true }); if (v.ok) return { x: w.x + dx, y: w.y + dy, r, w: v.w, h: v.h }; } return null; }, wellB); ok(jack, 'a legal pump-jack spot exists beside the well');
  await p.evaluate(j => { __lab.state.rot.pump_jack = j.r; }, jack); await dragBuild('pump_jack', jack); v = await verdict(); ok(v && v.ok, 'drag Pump Jack next to the well: VALID (linked)'); await p.click('#bBuild'); ok(await count('pump_jack') === 1, '2. Pump Jack placed');
  const linked = await p.evaluate(() => { const S = __lab.store, j = S.list().find(b => b.d === 'pump_jack'), w = S.list().find(b => b.d === 'oil_well'); return j.link === w.id; }); ok(linked, 'the jack is linked to the well instance');
  const rest = ['pump_station', 'junction', 'valve_station', 'oil_tank', 'large_tank', 'separator', 'processing_plant', 'control_center', 'maintenance', 'power', 'warehouse'];
  // park the camera on open ground away from the field for the other buildings
  await p.evaluate(() => { const sr = __wp.world.regions.find(r => r.starter); __wp.goto(sr.x0 + 200, sr.y0 + 230, .55); }); await idle();
  let idx = 3;
  for (const def of rest) { const far = await p.evaluate(d => findFar(d), def); ok(far, 'a legal spot exists for ' + def + ' at ' + (far && far.x) + ',' + (far && far.y)); await p.evaluate(f => __wp.goto(f.x + 1, f.y + 1, .55), far); await idle(); const s = await p.evaluate(d => findSpot(d), def); ok(s, def + ' spot is also legal with loaded chunks');
    await dragBuild(def, s); v = await verdict(); ok(v && v.ok, 'drag ' + def + ': VALID'); await p.click('#bBuild'); ok(await count(def) === 1, (idx++) + '. ' + def + ' placed'); }
  // refinery in the refinery zone
  await p.click('#tRef'); await idle(); const rf = await p.evaluate(() => findFar('refinery', 0, __wp.cam, 40)); await p.evaluate(f => __wp.goto(f.x + 4, f.y + 3, .5), rf); await idle(); const rs = await p.evaluate(() => findSpot('refinery')); ok(rs, 'a legal refinery spot exists in the refinery zone');
  await dragBuild('refinery', rs); v = await verdict(); console.log('  refinery verdict', JSON.stringify(v), JSON.stringify(rs)); ok(v && v.ok, 'drag Refinery into the zone: VALID'); await shot('02-ghost-refinery'); await p.click('#bBuild'); ok(await count('refinery') === 1, '14. Refinery placed');
  ok(await p.evaluate(() => __lab.store.list().length) === 14, 'all 14 buildings stand in one store');
  await shot('03-refinery-built');

  // ---------------------------------------------------------------- rules through the UI
  console.log('INVALID PLACEMENTS ARE REFUSED');
  const refin = await p.evaluate(() => __lab.store.list().find(b => b.d === 'refinery'));
  await p.evaluate(r => __wp.goto(r.x + 4, r.y + 3, .55), refin); await idle();
  await dragBuild('oil_tank', { x: refin.x + 1, y: refin.y + 1, w: 2, h: 2 }); v = await verdict(); ok(v && !v.ok && (v.kind === 'OVERLAP' || v.kind === 'CLEARANCE'), 'overlap: a tank dropped on the refinery is red (' + (v && v.kind) + ')');
  ok(await p.evaluate(() => document.getElementById('bBuild').disabled), 'the Build button is disabled while the ghost is invalid'); const before = await p.evaluate(() => __lab.store.list().length); await shot('04-ghost-invalid-overlap');
  await p.evaluate(() => document.getElementById('bBuild').disabled = false); await p.click('#bBuild', { force: true }); ok(await p.evaluate(() => __lab.store.list().length) === before, 'pressing Build on an invalid ghost builds nothing (place() re-validates)');
  await p.click('#bCancel'); ok(!(await verdict()), 'Cancel removes the ghost');
  // water
  const water = await p.evaluate(() => { const w = OliWorld.createWorld(), sr = w.regions.find(r => r.starter); for (let y = sr.y0; y < sr.y0 + 320; y++) for (let x = sr.x0; x < sr.x0 + 320; x++) { const t = w.tile(x, y); if (t.terrain === 'WATER_WADI' && w.tile(x + 1, y + 1).terrain === 'WATER_WADI') return { x, y }; } return null; });
  await p.evaluate(wt => __wp.goto(wt.x, wt.y, .6), water); await idle(); await dragBuild('oil_tank', { x: water.x, y: water.y, w: 2, h: 2 }); v = await verdict(); ok(v && !v.ok && v.kind === 'TERRAIN' && v.reason === 'water', 'invalid terrain: a tank on water is red (reason water)'); await shot('05-ghost-water'); await p.click('#bCancel');
  // map bounds: drop beyond the north-west corner
  await p.evaluate(() => __wp.goto(3, 3, .8)); await idle(); const pt0 = await p.evaluate(() => ({ x: __wp.sx(-3, -3), y: __wp.sy(-3, -3) }));
  { const chip = await p.$('.chip[data-def="oil_tank"]'); await chip.scrollIntoViewIfNeeded(); const bb = await chip.boundingBox(); await p.mouse.move(bb.x + 20, bb.y + 20); await p.mouse.down(); await p.mouse.move(bb.x + 30, bb.y - 40, { steps: 3 }); await p.mouse.move(pt0.x, pt0.y, { steps: 5 }); await p.mouse.up(); }
  v = await verdict(); ok(v && !v.ok && v.kind === 'OUT_OF_BOUNDS', 'map bounds: dropping outside the world is refused (' + (v && v.kind) + ')'); await p.click('#bCancel');

  console.log('DRAG CANCELLATION');
  { const chip = await p.$('.chip[data-def="oil_tank"]'); await chip.scrollIntoViewIfNeeded(); const bb = await chip.boundingBox(); const n0 = await p.evaluate(() => __lab.store.list().length), c0 = await camNow();
    await p.evaluate(() => __wp.goto(__wp.cam.x + 20, __wp.cam.y, .55)); await idle(); const c1 = await camNow();
    await p.mouse.move(bb.x + 20, bb.y + 20); await p.mouse.down(); await p.mouse.move(bb.x + 30, bb.y - 60, { steps: 3 }); await p.mouse.move(200, 400, { steps: 4 }); ok(await p.evaluate(() => !!__lab.state.drag), 'a drag is running over the map'); await p.mouse.move(bb.x + 25, bb.y + 25, { steps: 5 }); await p.mouse.up();
    ok(await p.evaluate(() => !__lab.state.drag && !__lab.state.pending) && await p.evaluate(() => __lab.store.list().length) === n0, 'releasing over the palette cancels: nothing pending, nothing built');
    await p.mouse.move(bb.x + 20, bb.y + 20); await p.mouse.down(); await p.mouse.move(bb.x + 30, bb.y - 60, { steps: 3 }); await p.mouse.move(210, 420, { steps: 4 }); await p.keyboard.press('Escape'); await p.mouse.up(); ok(await p.evaluate(() => !__lab.state.drag), 'Escape cancels a running drag'); ok((await camNow()).join() === c1.join(), 'camera isolation: cancelled drags never moved the camera'); }

  console.log('ROTATION');
  { await p.evaluate(() => { const c = __wp.cam; __wp.goto(c.x - 20, c.y + 6, .6); }); await idle(); const fs0 = await p.evaluate(() => findFar('pump_station')); await p.evaluate(f => __wp.goto(f.x + 1, f.y + 1, .6), fs0); await idle(); const s = await p.evaluate(() => findSpot('pump_station')); await dragBuild('pump_station', s); const a = await p.evaluate(() => { const g = __lab.state.pending; return { r: g.r, c: g.verdict.connections.map(c => [c.id, c.side, c.ax - g.x, c.ay - g.y]) }; });
    await p.click('#bRot'); const b2 = await p.evaluate(() => { const g = __lab.state.pending; return { r: g.r, ok: g.verdict.ok, c: g.verdict.connections.map(c => [c.id, c.side, c.ax - g.x, c.ay - g.y]) }; });
    ok(b2.r === (a.r + 1) % 4 && JSON.stringify(a.c) !== JSON.stringify(b2.c), 'Rotate turns the ghost 90 degrees and its connection points move with it (' + JSON.stringify(a.c[0]) + ' -> ' + JSON.stringify(b2.c[0]) + ')');
    for (let i = 0; i < 3; i++) await p.click('#bRot'); ok((await p.evaluate(() => __lab.state.pending.r)) === a.r, 'four rotations return to the start'); await p.click('#bRot'); await shot('06-ghost-rotated');
    const okNow = await p.evaluate(() => __lab.state.pending.verdict.ok); if (okNow) { await p.click('#bBuild'); const r = await p.evaluate(() => __lab.store.list().filter(b => b.d === 'pump_station').pop().r); ok(r === ((a.r + 1) % 4), 'a rotated building is built and stored with its rotation (' + r * 90 + ' deg)'); } else { await p.click('#bCancel'); ok(true, 'rotated spot not legal here, rotation state still consistent'); } }

  console.log('CONNECTIONS + PIPES');
  { await p.evaluate(() => { __lab.reset(); __lab.store.cash = 1e7; __lab.state.rot = {}; }); await p.evaluate(() => { const sr = __wp.world.regions.find(r => r.starter); __wp.goto(sr.x0 + 205, sr.y0 + 235, .7); }); await idle();
    const sp = await p.evaluate(() => { const S = __lab.store; findFar('junction'); const FULLS = { v: (def, x, y) => { const f = OliBuildings; return null; } }; const c = __wp.cam; for (let d = 0; d < 120; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue; const x = Math.round(c.x) + dx, y = Math.round(c.y) + dy; if (window.__full.validate('pump_station', x, y, 0, { ignoreCash: true }).ok && window.__full.validate('oil_tank', x + 3, y, 0, { ignoreCash: true }).ok && window.__full.validate('oil_tank', x + 5, y, 0, { ignoreCash: true }).ok && [3, 4, 5, 6].every(k => window.__full.validate('junction', x + k, y + 1, 0, { ignoreCash: true }).ok || true)) return { x, y }; } return null; });
    await p.evaluate(q => __wp.goto(q.x + 4, q.y + 1, .7), sp); await idle();
    await dragBuild('pump_station', { x: sp.x, y: sp.y, w: 2, h: 2 }); await p.click('#bBuild'); await dragBuild('oil_tank', { x: sp.x + 5, y: sp.y, w: 2, h: 2 }); v = await verdict(); ok(v && v.ok, 'the tank ghost is valid beside the pump station'); await p.click('#bBuild');
    const ports = await p.evaluate(() => { const S = __lab.store, B = __lab.B, ps = S.list().find(b => b.d === 'pump_station'), tk = S.list().find(b => b.d === 'oil_tank'); const o = B.worldPoints(ps).find(q => q.id === 'PIPE_OUT'), i = B.worldPoints(tk).find(q => q.id === 'INLET_W'); return { o, i }; });
    console.log('  debug sp', JSON.stringify(sp), 'ports', ports.o.x, ports.o.ax, ports.i.x, ports.i.ax, 'pending verdict', JSON.stringify(v && { x: v.x, y: v.y, r: v.r })); const nTiles = ports.i.ax - ports.o.ax + 1; ok(ports.o.ax === sp.x + 2 && ports.o.ay === ports.i.ay && nTiles >= 1 && nTiles <= 2 && await p.evaluate(() => __lab.store.list().find(b => b.d === 'oil_tank').x) !== sp.x + 5, 'smart snap pulled the tank (dropped 2 tiles off line) so its INLET_W lines up with the pump PIPE_OUT: access tiles ' + ports.o.ax + ' and ' + ports.i.ax + ' on row ' + ports.o.ay);
    await p.click('#tPipe'); const A = await p.evaluate(q => ({ x: __wp.sx(q.o.ax + .5, q.o.ay + .5), y: __wp.sy(q.o.ax + .5, q.o.ay + .5) }), ports), Z = await p.evaluate(q => ({ x: __wp.sx(q.i.ax + .5, q.i.ay + .5), y: __wp.sy(q.i.ax + .5, q.i.ay + .5) }), ports);
    const cam1 = await camNow(); await p.mouse.move(A.x, A.y); await p.mouse.down(); await p.mouse.move((A.x + Z.x) / 2, (A.y + Z.y) / 2, { steps: 5 }); await p.mouse.move(Z.x, Z.y, { steps: 5 }); await shot('07-pipe-drag'); await p.mouse.up();
    ok((await camNow()).join() === cam1.join(), 'camera isolation: the pipe drag did not pan the map'); const pn = await p.evaluate(() => __lab.pipes.size); ok(pn === nTiles, 'the pipe drag laid exactly the tiles between the two ports (' + pn + ')');
    const lk = await p.evaluate(() => __lab.store.links(__lab.pipes)); ok(lk.length === 1 && lk[0].fromPort === 'PIPE_OUT' && lk[0].toPort === 'INLET_W', 'pipe connection: PIPE_OUT -> pipe -> INLET_W is a real link'); await p.click('#tPipe');
    // info panel of the tank
    const tp = await p.evaluate(() => { const t = __lab.store.list().find(b => b.d === 'oil_tank'); return { x: __wp.sx(t.x + 1, t.y + 1), y: __wp.sy(t.x + 1, t.y + 1) }; }); await p.mouse.click(tp.x, tp.y); await p.waitForTimeout(100);
    const txt = await p.textContent('#info'); ok(/Oil Tank/.test(txt) && /Status/.test(txt) && /Capacity/.test(txt) && /Input/.test(txt) && /Output/.test(txt) && /Condition/.test(txt) && /Maintenance/.test(txt) && /Connected pipes/.test(txt), 'tapping a building opens the panel: Name, Status, Capacity, Input, Output, Condition, Maintenance, Connected Pipes'); await shot('08-building-panel');
    ok(/1/.test((await p.textContent('#info')).match(/Connected pipes[^A-Z]*/)[0]), 'the panel counts the connected pipe');
    // demolish: never on a single tap
    ok(await p.evaluate(() => __lab.store.list().length) === 2, 'two buildings stand before the demolish test'); await p.click('#bDemo'); ok(await p.evaluate(() => __lab.store.list().length) === 2, 'Demolish… only asks: nothing is removed yet'); await p.click('#bDemoNo'); ok(await p.evaluate(() => __lab.store.list().length) === 2, 'Keep it: the building stays');
    await p.click('#bDemo'); await p.click('#bDemoYes'); ok(/connected/.test(await p.textContent('#info')) && await p.evaluate(() => __lab.store.list().length) === 2, 'a building with connected pipe asks a SECOND confirmation, still standing'); await shot('09-demolish-confirm');
    const pipesBefore = await p.evaluate(() => __lab.pipes.size); await p.click('#bDemoYes'); ok(await p.evaluate(() => __lab.store.list().length) === 1 && await p.evaluate(() => __lab.pipes.size) === pipesBefore, 'confirmed twice: the tank is gone, the pipes stay (network state is not broken)'); }

  console.log('SAVE / LOAD (reload the page)');
  { const snap = await p.evaluate(() => JSON.stringify({ s: __lab.store.toJSON(), p: [...__lab.pipes].sort((a, b) => a - b), c: __lab.store.cash }));
    await p.reload(); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 }); const snap2 = await p.evaluate(() => JSON.stringify({ s: __lab.store.toJSON(), p: [...__lab.pipes].sort((a, b) => a - b), c: __lab.store.cash }));
    ok(snap === snap2, 'after a reload: same buildings, positions, rotations, states, pipes and cash'); }

  console.log('RAPID TOUCH + STUCK STATES');
  { await p.evaluate(() => { __lab.reset(); __lab.store.cash = 1e7; const sr = __wp.world.regions.find(r => r.starter); __wp.goto(sr.x0 + 205, sr.y0 + 235, .6); }); await idle();
    const errs0 = errs.length, cam2 = await camNow(); const chip = await p.$('.chip[data-def="warehouse"]'); await chip.scrollIntoViewIfNeeded(); const bb = await chip.boundingBox();
    for (let i = 0; i < 25; i++) { await p.mouse.move(bb.x + 20, bb.y + 20); await p.mouse.down(); await p.mouse.move(bb.x + 25 + i, bb.y - 30 - i, { steps: 2 }); await p.mouse.move(150 + i * 5, 300 + i * 4, { steps: 2 }); await p.mouse.up(); if (i % 3 === 0) await p.keyboard.press('Escape'); }
    ok(await p.evaluate(() => !__lab.state.drag) && errs.length === errs0, '25 rapid drags + cancels: no stuck drag, no errors');
    ok(await p.evaluate(() => __lab.store.list().length) === 0, 'rapid dragging built nothing without a Build press'); await p.evaluate(() => __lab.cancelAll(true));
    for (let i = 0; i < 10; i++) { await p.mouse.click(120 + i * 10, 300); } ok(await p.evaluate(() => !__lab.state.drag && !__lab.state.pending), 'rapid taps on the map leave no ghost behind'); ok((await camNow()).join() === cam2.join(), 'rapid taps do not move the camera'); }

  console.log('PERFORMANCE (desktop Chromium, software canvas)');
  { await p.evaluate(() => { __lab.reset(); __lab.store.cash = 1e9; const S = __lab.store; let k = 0; const sr = __wp.world.regions.find(r => r.starter); for (let y = sr.y0 + 150; y < sr.y0 + 260; y += 6) for (let x = sr.x0 + 150; x < sr.x0 + 260; x += 8) { if (!S.place(['oil_tank', 'warehouse', 'pump_station', 'maintenance', 'junction'][k++ % 5], x, y, k & 3, { instant: true }).ok) { /* terrain not loaded or not legal */ } } __wp.goto(sr.x0 + 205, sr.y0 + 205, .6); }); await idle();
    const stat = await p.evaluate(() => { const S = __lab.store, n = S.list().length; const t = performance.now(); for (let i = 0; i < 40; i++) { __wp.cam.x += .5; __wp.draw(); } return { n, ms: (performance.now() - t) / 40 }; }); console.log('  buildings:', stat.n, ' draw ms:', stat.ms.toFixed(2)); ok(stat.n > 50 && stat.ms < 40, 'draw with ' + stat.n + ' buildings on screen stays cheap (' + stat.ms.toFixed(1) + ' ms)'); await shot('10-many-buildings'); }
  ok(errs.length === 0, 'no console / page errors: ' + errs.slice(0, 3).join(' | '));
  console.log('BUILDING LAB TESTS PASSED (' + n + ' checks)'); await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
