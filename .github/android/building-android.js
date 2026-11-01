// Phase 2 building lab on a real Android system (emulator, Android 14, the actual APK and its WebView). REAL TOUCH events (DevTools Input.dispatchTouchEvent) drive the page:
// palette drag -> ghost -> snap -> Build / Cancel / Rotate -> panel -> demolish -> pipes -> save/load, plus frame times while dragging. Emulator = software GL: NOT a real device.
const CDP = require('chrome-remote-interface'); const fs = require('fs'); const path = require('path');
const W = require(path.join(__dirname, '../../oli/worldmap.js')), B = require(path.join(__dirname, '../../oli/buildings.js'));
const results = []; let fails = 0, out = {};
const check = (n, ok, info) => { results.push({ n, ok: !!ok }); if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (info ? '  — ' + info : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let client, Runtime, Page, Input; const errors = [];
  const attach = async () => { let t = null; for (let i = 0; i < 30 && !t; i++) { try { t = (await CDP.List({ port: 9222 })).find(x => x.type === 'page'); } catch (e) { } if (!t) await sleep(1500); } if (!t) return false;
    client = await CDP({ port: 9222, target: t, local: true }); ({ Runtime, Page, Input } = client); await Runtime.enable(); await Page.enable();
    Runtime.exceptionThrown(e => errors.push('exception: ' + (e.exceptionDetails.exception && e.exceptionDetails.exception.description || e.exceptionDetails.text))); Runtime.consoleAPICalled(e => { if (e.type === 'error') errors.push(e.args.map(a => a.value || a.description).join(' ')); }); return true; };
  if (!(await attach())) { console.log('FAIL no WebView page'); return; }
  // the emulator sometimes kills the WebView renderer when Google Play Services crash-loops (not a game failure): reconnect, wait for the game, redo that section
  const reconnect = async () => { try { await client.close(); } catch (e) { } await sleep(5000); if (!(await attach())) return false; for (let i = 0; i < 60; i++) { if (await ev('return !!(window.__lab && __lab.restored);').catch(() => false)) return true; await sleep(1000); } return false; };
  const guard = async (name, fn) => { for (let a = 0; a < 3; a++) { try { await fn(); return; } catch (e) { console.log('NOTE section "' + name + '" interrupted (' + String(e.message).slice(0, 80) + ') - reconnecting after a WebView renderer kill'); out.reconnects = (out.reconnects || 0) + 1; if (!(await reconnect())) break; } } check('section "' + name + '" completed', false); };
  const ev = async expr => { const r = await Runtime.evaluate({ expression: '(async () => { ' + expr + ' })()', awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value; };
  const shot = async name => { try { const r = await Page.captureScreenshot({ format: 'png' }); fs.writeFileSync('results/' + name + '.png', Buffer.from(r.data, 'base64')); } catch (e) { console.log('shot failed ' + name); } };
  const waitFor = async (expr, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 60000)) { if (await ev('return !!(' + expr + ');').catch(() => false)) return true; await sleep(250); } return false; };
  const idle = async () => { await sleep(500); return waitFor('window.__wp.idle()', 90000); };
  const touch = (type, x, y) => Input.dispatchTouchEvent({ type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 12, radiusY: 12, force: 1 }] });
  const tap = async (x, y) => { await touch('touchStart', x, y); await sleep(60); await touch('touchEnd'); await sleep(120); };
  const path2 = async (pts, dt) => { await touch('touchStart', pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) { await sleep(dt || 22); await touch('touchMove', pts[i][0], pts[i][1]); } };
  const lerp = (a, b, n) => Array.from({ length: n }, (_, i) => [a[0] + (b[0] - a[0]) * (i + 1) / n, a[1] + (b[1] - a[1]) * (i + 1) / n]);
  const chipPt = async def => ev(`const sec = __lab.B.DEFS['${def}'].section; document.querySelector('#tabs button[data-sec="' + sec + '"]').click(); await new Promise(r => setTimeout(r, 120)); const p = document.getElementById('pal'), c = p.querySelector('.chip[data-def="${def}"]'); p.scrollLeft = Math.max(0, c.offsetLeft - 8); await new Promise(r => setTimeout(r, 150)); const r = c.getBoundingClientRect(); return [r.x + r.width / 2, r.y + 22];`);
  const spotPt = spot => ev(`const c = { x: ${spot.x} + ${spot.w} / 2, y: ${spot.y} + ${spot.h} / 2 }; return [__wp.sx(c.x, c.y), __wp.sy(c.x, c.y)];`);
  const pending = () => ev('const g = __lab.state.pending; return g && { ok: g.verdict.ok, reason: g.verdict.reason, kind: g.verdict.kind, x: g.x, y: g.y, r: g.r, def: g.def, aligned: !!g.aligned };');
  const cam = () => ev('return [__wp.cam.x, __wp.cam.y, __wp.cam.z];');
  const count = def => ev(`return __lab.store.list().filter(b => b.d === ${JSON.stringify(def)}).length;`);
  const btn = id => ev(`const r = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2];`);
  const dropAndRead = async (def, spot) => { const a = await chipPt(def), b = await spotPt(spot); b[1] += 58; await path2([a].concat(lerp(a, [a[0] + 5, a[1] - 60], 4), lerp([a[0] + 5, a[1] - 60], b, 10)), 24); await sleep(250); await touch('touchEnd'); await sleep(300); return pending(); };

  let ready = false; for (let i = 0; i < 90 && !ready; i++) { ready = await ev('return !!(window.__lab && __lab.restored);').catch(() => false); if (!ready) await sleep(1000); } check('the game (map + building system) is running in the Android WebView', ready);
  if (!ready) return;
  // these legacy checks drive the developer lab (full palette, English): switch it on with the stored flags, then reload
  await ev('localStorage.setItem("oli-labui","1"); localStorage.setItem("oli-lang","en");'); await Page.reload(); await sleep(3000); ready = false; for (let i = 0; i < 90 && !ready; i++) { ready = await ev('return !!(window.__lab && __lab.restored);').catch(() => false); if (!ready) await sleep(1000); }
  if (!ready) return;
  out.env = await ev('return { ua: navigator.userAgent, dpr: devicePixelRatio, w: innerWidth, h: innerHeight };'); console.log('ENV ' + JSON.stringify(out.env));
  await ev('localStorage.clear(); localStorage.setItem("oli-labui","1"); localStorage.setItem("oli-lang","en"); __lab.reset(); __lab.store.cash = 5e9; __lab.state.rot = {}; __lab.updateCash();');
  check('the world map loaded (1920x1280 tiles)', await ev('return __wp.world.W === 1920 && __wp.world.H === 1280;'));
  check('the build menu has the 5 sections', (await ev('return [...document.querySelectorAll("#tabs button")].map(b => b.textContent).join("|");')) === 'EXTRACTION|PIPELINE|CRUDE STORAGE|PROCESSING|PRODUCT STORAGE');
  await shot('b-menu-extraction');

  // spots on the real terrain (same seed in Node), claimed one after another
  const world = W.createWorld(), ts = B.fromWorld(world), ACC = new B.BuildingStore(ts, { cash: 1e12 }), SR = world.regions.find(r => r.starter), spots = {};
  const claim = (def, from, span) => { const [x0, y0] = from; for (let d = 0; d < (span || 120); d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue; const x = x0 + dx, y = y0 + dy; if (ACC.validate(def, x, y, 0, {}).ok) { ACC.place(def, x, y, 0, { instant: true }); const [w, h] = B.DEFS[def].footprint; return { x, y, w, h }; } } return null; };
  const base = [SR.x0 + 205, SR.y0 + 235]; for (const def of ['pump_station_s', 'valve', 'junction', 'crude_tank_s', 'separator', 'gasoline_tank_s', 'diesel_tank_s', 'jet_tank_s', 'gas_sphere_s']) spots[def] = claim(def, base);
  const rz = world.refineryZones(SR.id)[0]; spots.refinery_s = claim('refinery_s', [rz.x + 10, rz.y + 6], 40);
  check('legal spots for 10 building types found on the real terrain', Object.values(spots).every(Boolean), JSON.stringify(Object.fromEntries(Object.entries(spots).map(([k, v]) => [k, v && v.x + ',' + v.y]))));

  const placeByTouch = async (def, spot) => { await ev(`__wp.goto(${spot.x + spot.w / 2}, ${spot.y + spot.h / 2}, .55);`); await idle(); const c0 = await cam(); const v = await dropAndRead(def, spot); const c1 = await cam();
    const ok1 = v && v.ok; if (ok1) { const [bx, by] = await btn('bBuild'); await tap(bx, by); await sleep(250); } const placed = ok1 && await count(def) >= 1; return { ok: !!placed, v, camMoved: Math.abs(c0[0] - c1[0]) + Math.abs(c0[1] - c1[1]) + Math.abs(c0[2] - c1[2]) }; };
  await ev('document.getElementById("tFields").click();'); await idle(); await sleep(600);
  const wspot = await ev(`const S = __lab.store, c = __wp.cam; for (let d = 0; d < 20; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue; const x = Math.round(c.x) + dx, y = Math.round(c.y) + dy; if (S.validate('oil_well', x, y, 0, {}).ok) return { x, y, w: 1, h: 1 }; } return null;`);
  check('a legal well spot exists on the drillable oil field', !!wspot, JSON.stringify(wspot)); let camMovedMax = 0, nPlaced = 0;
  if (wspot) { const r = await placeByTouch('oil_well', wspot); camMovedMax = Math.max(camMovedMax, r.camMoved); await shot('b-ghost-then-built-well'); check('1. Oil Well: touch drag -> valid ghost -> Build', r.ok, JSON.stringify(r.v)); nPlaced += r.ok ? 1 : 0; }
  let idx = 2;
  for (const def of ['pump_station_s', 'valve', 'junction', 'crude_tank_s', 'separator', 'gasoline_tank_s', 'diesel_tank_s', 'jet_tank_s', 'gas_sphere_s', 'refinery_s']) { try { const r = await placeByTouch(def, spots[def]); camMovedMax = Math.max(camMovedMax, r.camMoved); check((idx++) + '. ' + def + ': touch drag -> valid ghost -> Build', r.ok, JSON.stringify(r.v)); nPlaced += r.ok ? 1 : 0; } catch (e) { check(def + ' placement', false, e.message); } }
  check('all 11 building types stand after touch placement', await ev('return __lab.store.list().length;') === 11, 'placed by touch: ' + nPlaced);
  check('camera isolation: the camera never moved during any building drag (max change ' + camMovedMax.toFixed(4) + ')', camMovedMax < 1e-6);
  await ev(`__wp.goto(${spots.refinery_s.x + 3}, ${spots.refinery_s.y + 2}, .5);`); await idle(); await shot('b-refinery-built');

  // invalid placements
  const refin = await ev('return __lab.store.list().find(b => b.d === "refinery_s");');
  let v = null; for (let i = 0; i < 6 && !v; i++) { v = await dropAndRead('crude_tank_s', { x: refin.x + 2, y: refin.y + 1, w: 2, h: 2 }); if (!v) await sleep(500); }
  const onTop = v && !(v.x + 2 <= refin.x || v.x >= refin.x + 6 || v.y + 2 <= refin.y || v.y >= refin.y + 5); check('overlap: a tank dropped on the refinery is never built on top of it (ghost red, or smart-snapped to free ground: ok=' + (v && v.ok) + ' at ' + (v && v.x) + ',' + (v && v.y) + ')', v && (!v.ok || !onTop));
  check('the Build button is disabled while a ghost is red', v && (v.ok || await ev('return document.getElementById("bBuild").disabled;'))); await shot('b-ghost-invalid'); let c = await btn('bCancel'); await tap(c[0], c[1]); check('Cancel removes the ghost', !(await pending()));
  const water = (() => { for (let y = SR.y0; y < SR.y0 + 320; y++) for (let x = SR.x0; x < SR.x0 + 320; x++) { const t = world.tile(x, y), t2 = world.tile(x + 1, y + 1); if (t.terrain === 'WATER_WADI' && t2.terrain === 'WATER_WADI') return { x, y, w: 2, h: 2 }; } return null; })();
  if (water) { await ev(`__wp.goto(${water.x + 1}, ${water.y + 1}, .6);`); await idle(); v = await dropAndRead('crude_tank_s', water); check('invalid terrain: a tank on water is red (reason ' + (v && v.reason) + ')', v && !v.ok && v.kind === 'TERRAIN'); c = await btn('bCancel'); await tap(c[0], c[1]); }
  { const n0 = await ev('return __lab.store.list().length;'); const a = await chipPt('gasoline_tank_s'); await path2([a].concat(lerp(a, [a[0] + 5, a[1] - 80], 4), lerp([a[0] + 5, a[1] - 80], [200, 400], 6), lerp([200, 400], [a[0], a[1] + 4], 6)), 24); await touch('touchEnd'); await sleep(300);
    check('releasing over the palette cancels (nothing pending, nothing built)', !(await pending()) && await ev('return __lab.store.list().length;') === n0 && await ev('return !__lab.state.drag;')); }

  await guard('pipes by touch', async () => {
  // pipes by touch: valid and invalid product connection
  await ev('__lab.reset(); __lab.store.cash = 5e9; __lab.state.rot = {};'); const pair = (() => { const A2 = new B.BuildingStore(ts, { cash: 1e12 }); for (let d = 0; d < 90; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) { const x = base[0] + dx, y = base[1] + dy; if (A2.validate('pump_station_s', x, y, 0, {}).ok && A2.validate('crude_tank_s', x + 8, y, 0, {}).ok && A2.validate('gasoline_tank_s', x + 8, y + 7, 0, {}).ok) return { x, y }; } return null; })();
  await ev(`__wp.goto(${pair.x + 5}, ${pair.y + 3}, .7);`); await idle();
  await ev(`{ const S = __lab.store; for (const [d, x, y] of [['pump_station_s', ${pair.x}, ${pair.y}], ['crude_tank_s', ${pair.x + 8}, ${pair.y}], ['gasoline_tank_s', ${pair.x + 8}, ${pair.y + 7}]]) S.place(d, x, y, 0, { instant: true }); __wp.markDirty(); }`); await idle();
  const portXY = (bi, pid) => ev(`const b = __lab.store.list()[${bi}], w = __lab.B.worldPoints(b).find(q => q.id === ${JSON.stringify(pid)}); return [__wp.sx(w.ax + .5, w.ay + .5), __wp.sy(w.ax + .5, w.ay + .5)];`);
  const pipeDrag = async (a, z) => { await touch('touchStart', a[0], a[1]); for (const q of lerp(a, z, 8)) { await sleep(30); await touch('touchMove', q[0], q[1]); } await touch('touchEnd'); await sleep(300); };
  await ev('document.getElementById("tPipe").click();'); const cA = await cam();
  await pipeDrag(await portXY(0, 'OUTPUT'), await portXY(1, 'INPUT_W')); check('VALID product connection: pump OUTPUT -> crude tank INPUT lays a CRUDE pipeline', await ev('return __lab.pipes.lines.size === 1 && [...__lab.pipes.lines.values()][0].product === "CRUDE";'));
  await shot('b-pipe-valid'); await pipeDrag(await portXY(1, 'OUTPUT_S'), await portXY(2, 'INPUT_N'));
  check('INVALID product connection: crude tank OUTPUT -> gasoline tank INPUT builds nothing', await ev('return __lab.pipes.lines.size;') === 1); check('the player sees "INVALID PRODUCT CONNECTION"', /INVALID PRODUCT CONNECTION/.test(await ev('return document.getElementById("toast").textContent;'))); await shot('b-pipe-invalid-product');
  const cB = await cam(); check('pipe drags by touch did not pan the map', Math.abs(cA[0] - cB[0]) + Math.abs(cA[1] - cB[1]) < 1e-6); await ev('document.getElementById("tPipe").click();');
  const tp = await ev('const t = __lab.store.list()[1]; return [__wp.sx(t.x + 1, t.y + 1), __wp.sy(t.x + 1, t.y + 1)];'); await tap(tp[0], tp[1]); await sleep(300); const panel = await ev('return document.getElementById("info").innerText;');
  check('tapping a tank opens its panel with Level / Capacity / Fill', /Crude Tank/.test(panel) && /Level/.test(panel) && /Capacity/.test(panel) && /Fill/.test(panel), panel.replace(/\s+/g, ' ').slice(0, 120)); await shot('b-tank-panel');

  });

  await guard('full chain + save/load', async () => {
  // the full chain + simulation + save / load
  const demo = await ev('return await __lab.buildDemo();'); check('OIL FIELD -> WELLS -> PUMP -> PIPE -> SEPARATOR -> CRUDE STORAGE -> REFINERY -> 4 product storages built on the device (' + (demo && demo.total) + ' buildings, ' + (demo && demo.pipelines) + ' pipelines)', demo && demo.ok && demo.total === 12, JSON.stringify(demo && demo.failed)); out.demo = demo;
  await ev('__lab.sim.run(3);'); const stat = await ev('const L = __lab; return Object.entries(' + JSON.stringify(demo.chain) + ').map(([k, id]) => k + ":" + L.sim.status(L.store.get(id)));'); check('every building of the chain is RUNNING on the device: ' + stat.join(' '), stat.every(s => /RUNNING/.test(s)));
  const prod = await ev(`const L = __lab, c = ${JSON.stringify(demo.chain)}; return [c.gasoline, c.diesel, c.jet, c.gas].map(id => Math.round(L.store.get(id).s.vol));`); check('gasoline / diesel / jet / gas storage received product: ' + prod.join(' / '), prod.every(x => x > 0));
  await ev(`{ const L = __lab, c = ${JSON.stringify(demo.chain)}; const b = L.store.get(c.refinery); __wp.goto(b.x + 3, b.y + 2, .5); L.showBuilding(c.refinery); }`); await idle(); await shot('b-chain-refinery');
  await ev(`{ const L = __lab, c = ${JSON.stringify(demo.chain)}; const b = L.store.get(c.well); __wp.goto(b.x + 8, b.y + 2, .7); L.showBuilding(c.pump); }`); await idle(); await shot('b-chain-field');
  await ev(`{ const L = __lab, c = ${JSON.stringify(demo.chain)}; const b = L.store.get(c.diesel); __wp.goto(b.x + 1, b.y + 1, .8); L.showBuilding(c.diesel); }`); await idle(); await shot('b-chain-products');
  const snap = await ev('__lab.company.speed = 0; __lab.save(); return JSON.stringify({ s: __lab.store.toJSON(), n: __lab.pipes.toJSON(), c: __lab.store.cash });'); await Page.reload(); await sleep(3000);
  let back = false; for (let i = 0; i < 90 && !back; i++) { back = await ev('return !!(window.__lab && __lab.restored);').catch(() => false); if (!back) await sleep(1000); }
  const snap2 = back && await ev('return JSON.stringify({ s: __lab.store.toJSON(), n: __lab.pipes.toJSON(), c: __lab.store.cash });'); const same = (() => { if (!back || !snap2) return false; const A = JSON.parse(snap), Bq = JSON.parse(snap2); const strip = o => o.s.b.map(r => r.slice(0, 10)); if (JSON.stringify(strip(A)) !== JSON.stringify(strip(Bq)) || JSON.stringify(A.n) !== JSON.stringify(Bq.n) || A.c !== Bq.c) return false; return A.s.b.every((r, i) => { const x = r[10] || {}, y = Bq.s.b[i][10] || {}; return Math.abs((x.vol || 0) - (y.vol || 0)) <= 60 + .03 * (x.vol || 0) && Math.abs((x.reserve || 0) - (y.reserve || 0)) <= 200; }); })();
  check('Save -> reload the app -> identical buildings, positions, rotations, pipelines, product types and cash; storage volumes equal (the game keeps simulating for ~3 s while the page reloads, so volumes are compared within 3%)', same);
  const st2 = back && await ev('__lab.sim.run(1); const L = __lab; return Object.values(' + JSON.stringify(demo.chain) + ').map(id => L.sim.status(L.store.get(id)));'); check('after the reload the chain keeps running', st2 && st2.every(s => s === 'RUNNING'), JSON.stringify(st2));

  });

  await guard('rapid touch', async () => {
  // rapid touch
  { await ev('__lab.reset(); __lab.store.cash = 5e9; __wp.goto(' + (base[0]) + ',' + (base[1]) + ', .6);'); await idle(); const e0 = errors.length, c0 = await cam(); const a = await chipPt('gasoline_tank_s');
    for (let i = 0; i < 15; i++) { await path2([a].concat(lerp(a, [a[0] + 3, a[1] - 60], 2), lerp([a[0] + 3, a[1] - 60], [120 + i * 12, 300 + i * 6], 3)), 8); await touch('touchEnd'); await sleep(20); if (i % 3 === 0) { await ev('__lab.cancelAll(true);'); } }
    await ev('__lab.cancelAll(true);'); check('15 rapid touch drags: no stuck drag, no error, nothing built without Build, camera unchanged', await ev('return !__lab.state.drag && __lab.store.list().length === 0;') && errors.length === e0 && Math.abs((await cam())[0] - c0[0]) < 1e-6); }

  });

  await guard('frame times', async () => {
  // frame times
  await ev('return await __lab.buildDemo();'); const sampler = `window.__ft = []; window.__ftOn = true; let last = performance.now(); (function f() { const t = performance.now(); window.__ft.push(t - last); last = t; if (window.__ftOn) requestAnimationFrame(f); })();`;
  const stats = a => { a = a.slice(1).sort((x, y) => x - y); return { n: a.length, fps: +(a.length / (a.reduce((p, q) => p + q, 0) / 1000)).toFixed(1), p95: Math.round(a[Math.floor(a.length * .95)]), max: Math.round(a[a.length - 1]), over50: a.filter(x => x > 50).length }; };
  await ev('document.getElementById("tFields").click();'); await idle(); await ev(sampler); { const a = await chipPt('crude_tank_m'); const P = []; for (let k = 0; k < 90; k++) P.push([100 + 200 * Math.abs(Math.sin(k / 14)), 260 + 160 * Math.abs(Math.cos(k / 11))]); await path2([a].concat(lerp(a, [a[0] + 3, a[1] - 80], 4), P), 16); await touch('touchEnd'); }
  await ev('window.__ftOn = false;'); await sleep(200); const dragStats = stats(await ev('return window.__ft;')); out.ghostDrag = dragStats; await ev('__lab.cancelAll(true);');
  check('frame times while dragging a ghost over the compound: ' + dragStats.fps + ' fps, p95 ' + dragStats.p95 + ' ms, max ' + dragStats.max + ' ms (emulator, software GL)', dragStats.n > 20);
  await ev('__wp.goto(' + (SR.x0 + 205) + ',' + (SR.y0 + 205) + ', .6);'); await idle(); await ev(sampler); await ev(`await new Promise(res => { const t0 = performance.now(); (function f() { const k = (performance.now() - t0) / 5000; __wp.goto(${SR.x0 + 205} + 60 * Math.sin(k * 6), ${SR.y0 + 205} + 30 * Math.cos(k * 6), .6); if (k < 1) requestAnimationFrame(f); else res(); })(); });`);
  await ev('window.__ftOn = false;'); await sleep(200); const panStats = stats(await ev('return window.__ft;')); out.pan = panStats; check('frame times while panning across the compound at CLOSE: ' + panStats.fps + ' fps, p95 ' + panStats.p95 + ' ms, max ' + panStats.max + ' ms (emulator)', panStats.n > 20);
  out.simMs = await ev('const t = performance.now(); for (let i = 0; i < 200; i++) __lab.sim.step(.01); return (performance.now() - t) / 200;'); check('one simulation step of the whole chain costs ' + out.simMs.toFixed(2) + ' ms on the device', out.simMs < 20);
  });
  out.baseline = await ev(`return await new Promise(res => { const c = document.createElement('canvas'); c.width = innerWidth * 2; c.height = innerHeight * 2; c.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:-1'; document.body.appendChild(c); const g = c.getContext('2d'); let n = 0; const t0 = performance.now(); (function f() { g.fillStyle = n % 2 ? '#123' : '#321'; g.fillRect(0, 0, c.width, c.height); n++; if (performance.now() - t0 < 2500) requestAnimationFrame(f); else { c.remove(); res({ fps: n / ((performance.now() - t0) / 1000) }); } })(); });`);
  console.log('BASELINE blank full-screen canvas, no map: ' + out.baseline.fps.toFixed(1) + ' fps (emulator ceiling)');
  out.heapMB = await ev('return performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;'); check('JS heap ' + out.heapMB + ' MB', out.heapMB == null || out.heapMB < 400);
  check('no JavaScript errors / crash', errors.length === 0, errors.slice(0, 3).join(' | '));
  fs.writeFileSync('results/building-perf.json', JSON.stringify(out, null, 1)); console.log('BUILDING SUMMARY ' + results.filter(r => r.ok).length + '/' + results.length + ' PASS'); await client.close();
})().catch(e => { console.log('FAIL crashed: ' + e.message); });
