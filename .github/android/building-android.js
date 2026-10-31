// Phase 2 building lab on a real Android system (emulator, Android 14, the actual APK and its WebView). REAL TOUCH events (DevTools Input.dispatchTouchEvent) drive the page:
// palette drag -> ghost -> snap -> Build / Cancel / Rotate -> panel -> demolish -> pipes -> save/load, plus frame times while dragging. Emulator = software GL: NOT a real device.
const CDP = require('chrome-remote-interface'); const fs = require('fs'); const path = require('path');
const W = require(path.join(__dirname, '../../oli/worldmap.js')), B = require(path.join(__dirname, '../../oli/buildings.js'));
const results = []; let fails = 0, out = {};
const check = (n, ok, info) => { results.push({ n, ok: !!ok }); if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (info ? '  — ' + info : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let t = null; for (let i = 0; i < 20 && !t; i++) { try { t = (await CDP.List({ port: 9222 })).find(x => x.type === 'page'); } catch (e) { } if (!t) await sleep(1500); }
  if (!t) { console.log('FAIL no WebView page'); return; }
  const client = await CDP({ port: 9222, target: t, local: true }), { Runtime, Page, Input } = client; await Runtime.enable(); await Page.enable();
  const errors = []; Runtime.exceptionThrown(e => errors.push('exception: ' + (e.exceptionDetails.exception && e.exceptionDetails.exception.description || e.exceptionDetails.text))); Runtime.consoleAPICalled(e => { if (e.type === 'error') errors.push(e.args.map(a => a.value || a.description).join(' ')); });
  const ev = async expr => { const r = await Runtime.evaluate({ expression: '(async () => { ' + expr + ' })()', awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value; };
  const shot = async name => { try { const r = await Page.captureScreenshot({ format: 'png' }); fs.writeFileSync('results/' + name + '.png', Buffer.from(r.data, 'base64')); } catch (e) { console.log('shot failed ' + name); } };
  const waitFor = async (expr, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 60000)) { if (await ev('return !!(' + expr + ');').catch(() => false)) return true; await sleep(250); } return false; };
  const idle = async () => { await sleep(500); return waitFor('window.__wp.idle()', 90000); };
  const touch = (type, x, y) => Input.dispatchTouchEvent({ type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 12, radiusY: 12, force: 1 }] });
  const tap = async (x, y) => { await touch('touchStart', x, y); await sleep(60); await touch('touchEnd'); await sleep(120); };
  const path2 = async (pts, dt) => { await touch('touchStart', pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) { await sleep(dt || 22); await touch('touchMove', pts[i][0], pts[i][1]); } };
  const lerp = (a, b, n) => Array.from({ length: n }, (_, i) => [a[0] + (b[0] - a[0]) * (i + 1) / n, a[1] + (b[1] - a[1]) * (i + 1) / n]);
  const chipPt = async def => ev(`const p = document.getElementById('pal'), c = p.querySelector('.chip[data-def="${def}"]'); p.scrollLeft = Math.max(0, c.offsetLeft - 8); await new Promise(r => setTimeout(r, 150)); const r = c.getBoundingClientRect(); return [r.x + r.width / 2, r.y + 22];`);
  const spotPt = spot => ev(`const c = { x: ${spot.x} + ${spot.w} / 2, y: ${spot.y} + ${spot.h} / 2 }; return [__wp.sx(c.x, c.y), __wp.sy(c.x, c.y)];`);
  const pending = () => ev('const g = __lab.state.pending; return g && { ok: g.verdict.ok, reason: g.verdict.reason, kind: g.verdict.kind, x: g.x, y: g.y, r: g.r, def: g.def, aligned: !!g.aligned };');
  const cam = () => ev('return [__wp.cam.x, __wp.cam.y, __wp.cam.z];');
  const count = def => ev(`return __lab.store.list().filter(b => b.d === ${JSON.stringify(def)}).length;`);
  const btn = id => ev(`const r = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2];`);
  const dropAndRead = async (def, spot) => { const a = await chipPt(def), b = await spotPt(spot); b[1] += 58; await path2([a].concat(lerp(a, [a[0] + 5, a[1] - 60], 4), lerp([a[0] + 5, a[1] - 60], b, 10)), 24); await sleep(250); await touch('touchEnd'); await sleep(300); return pending(); };

  let ready = false; for (let i = 0; i < 90 && !ready; i++) { ready = await ev('return !!(window.__lab && __lab.restored);').catch(() => false); if (!ready) await sleep(1000); } check('the building lab is running in the WebView', ready);
  if (!ready) return;
  out.env = await ev('return { ua: navigator.userAgent, dpr: devicePixelRatio, w: innerWidth, h: innerHeight };'); console.log('ENV ' + JSON.stringify(out.env));
  await ev('localStorage.clear(); __lab.reset(); __lab.store.cash = 1e8; __lab.state.rot = {}; __lab.updateCash();');

  // ---- spots on the real terrain, computed here with the same seed (Node), claimed one after another so they never coincide
  const world = W.createWorld(), ts = B.fromWorld(world), ACC = new B.BuildingStore(ts, { cash: 1e12 }), SR = world.regions.find(r => r.starter), spots = {};
  const claim = (def, from, span) => { const [x0, y0] = from; for (let d = 0; d < (span || 120); d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue; const x = x0 + dx, y = y0 + dy; if (ACC.validate(def, x, y, 0, { ignoreCash: true }).ok) { ACC.place(def, x, y, 0, { instant: true }); const dd = B.DEFS[def]; return { x, y, w: dd.footprint[0], h: dd.footprint[1] }; } } return null; };
  const base = [SR.x0 + 205, SR.y0 + 235]; for (const def of ['pump_station', 'junction', 'valve_station', 'oil_tank', 'large_tank', 'separator', 'processing_plant', 'control_center', 'maintenance', 'power', 'warehouse']) spots[def] = claim(def, base, 140);
  const rz = world.refineryZones(SR.id)[0]; spots.refinery = claim('refinery', [rz.x + 10, rz.y + 6], 40);
  check('the spots for 12 buildings were found on the real terrain', Object.values(spots).every(Boolean), JSON.stringify(Object.fromEntries(Object.entries(spots).map(([k, v]) => [k, v && v.x + ',' + v.y]))));

  // ---- 1 + 2: well and pump jack on the field, by touch
  const lbl = {}; const placeByTouch = async (def, spot, rot) => { await ev(`__wp.goto(${spot.x + spot.w / 2}, ${spot.y + spot.h / 2}, .55);`); await idle(); const c0 = await cam(); const v = await dropAndRead(def, spot); lbl[def] = v; const c1 = await cam();
    const ok1 = v && v.ok; if (ok1) { const [bx, by] = await btn('bBuild'); await tap(bx, by); await sleep(250); } const placed = ok1 && await count(def) >= 1; return { ok: !!placed, v, camMoved: Math.abs(c0[0] - c1[0]) + Math.abs(c0[1] - c1[1]) + Math.abs(c0[2] - c1[2]) }; };
  await ev('document.getElementById("tFields").click();'); await idle(); await sleep(600);
  const wspot = await ev(`const S = __lab.store, c = __wp.cam; for (let d = 0; d < 20; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue; const x = Math.round(c.x) + dx, y = Math.round(c.y) + dy; if (S.validate('oil_well', x, y, 0, { ignoreCash: true }).ok) return { x, y, w: 1, h: 1 }; } return null;`);
  check('a legal well spot exists on the drillable field', !!wspot, JSON.stringify(wspot)); let camMovedMax = 0, nPlaced = 0;
  if (wspot) { const r = await placeByTouch('oil_well', wspot); camMovedMax = Math.max(camMovedMax, r.camMoved); await shot('b-ghost-then-built-well'); check('1. Oil Well: touch drag -> valid ghost -> Build', r.ok, JSON.stringify(r.v)); nPlaced += r.ok ? 1 : 0; }
  const wb = await ev('return __lab.store.list().find(b => b.d === "oil_well") || null;');
  if (wb) { const js = await ev(`const S = __lab.store, w = ${JSON.stringify(wb)}; for (let r = 0; r < 4; r++) for (const [dx, dy] of [[1, 0], [-2, 0], [0, 1], [0, -1], [-1, 0], [2, 0], [0, 2], [0, -2]]) { const v = S.validate('pump_jack', w.x + dx, w.y + dy, r, { ignoreCash: true }); if (v.ok) return { x: w.x + dx, y: w.y + dy, w: v.w, h: v.h, r }; } return null;`);
    if (js) { await ev(`__lab.state.rot.pump_jack = ${js.r};`); const r = await placeByTouch('pump_jack', js); check('2. Pump Jack: touch drag beside the well -> linked', r.ok && await ev('return !!__lab.store.list().find(b => b.d === "pump_jack").link;'), JSON.stringify(r.v)); nPlaced += r.ok ? 1 : 0; camMovedMax = Math.max(camMovedMax, r.camMoved); } }
  let idx = 3;
  for (const def of ['pump_station', 'junction', 'valve_station', 'oil_tank', 'large_tank', 'separator', 'processing_plant', 'control_center', 'maintenance', 'power', 'warehouse', 'refinery']) { try { const r = await placeByTouch(def, spots[def]); check((idx++) + '. ' + def + ': touch drag -> valid ghost -> Build', r.ok, r.ok ? '' : JSON.stringify(r.v)); nPlaced += r.ok ? 1 : 0; camMovedMax = Math.max(camMovedMax, r.camMoved); } catch (e) { check((idx++) + '. ' + def, false, e.message); } }
  check('all 14 buildings stand after touch placement', await ev('return __lab.store.list().length;') === 14, 'placed by touch: ' + nPlaced);
  check('camera isolation: the camera never moved during any building drag (max change ' + camMovedMax.toFixed(4) + ')', camMovedMax < 1e-6);
  await ev(`__wp.goto(${spots.refinery.x + 4}, ${spots.refinery.y + 3}, .5);`); await idle(); await shot('b-refinery-compound');

  // ---- rules by touch
  const refin = await ev('return __lab.store.list().find(b => b.d === "refinery");');
  let v = await dropAndRead('oil_tank', { x: refin.x + 1, y: refin.y + 1, w: 2, h: 2 }); check('overlap: a tank dropped on the refinery is red (' + (v && v.kind) + ')', v && !v.ok && (v.kind === 'OVERLAP' || v.kind === 'CLEARANCE'));
  check('the Build button is disabled while the ghost is red', await ev('return document.getElementById("bBuild").disabled;')); await shot('b-ghost-invalid'); let c = await btn('bCancel'); await tap(c[0], c[1]); check('Cancel button removes the ghost', !(await pending()));
  const water = (() => { for (let y = SR.y0; y < SR.y0 + 320; y++) for (let x = SR.x0; x < SR.x0 + 320; x++) { const t = world.tile(x, y), t2 = world.tile(x + 1, y + 1); if (t.terrain === 'WATER_WADI' && t2.terrain === 'WATER_WADI') return { x, y, w: 2, h: 2 }; } return null; })();
  if (water) { await ev(`__wp.goto(${water.x + 1}, ${water.y + 1}, .6);`); await idle(); v = await dropAndRead('oil_tank', water); check('invalid terrain: a tank on water is red (reason ' + (v && v.reason) + ')', v && !v.ok && v.reason === 'water'); await shot('b-ghost-water'); c = await btn('bCancel'); await tap(c[0], c[1]); }
  // cancel by dropping on the palette
  { const n0 = await ev('return __lab.store.list().length;'); const a = await chipPt('warehouse'); await path2([a].concat(lerp(a, [a[0] + 5, a[1] - 80], 4), lerp([a[0] + 5, a[1] - 80], [200, 400], 6), lerp([200, 400], [a[0], a[1] + 4], 6)), 24); await touch('touchEnd'); await sleep(300);
    check('releasing over the palette cancels (nothing pending, nothing built)', !(await pending()) && await ev('return __lab.store.list().length;') === n0 && await ev('return !__lab.state.drag;')); }
  // rotation + snap + pipe + panel + demolish
  await ev('__lab.reset(); __lab.store.cash = 1e8; __lab.state.rot = {};'); const pair = (() => { const ACC2 = new B.BuildingStore(ts, { cash: 1e12 }); for (let d = 0; d < 80; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue; const x = base[0] - 30 + dx, y = base[1] - 30 + dy; if (ACC2.validate('pump_station', x, y, 0, { ignoreCash: true }).ok && ACC2.validate('oil_tank', x + 3, y, 0, { ignoreCash: true }).ok && ACC2.validate('oil_tank', x + 5, y, 0, { ignoreCash: true }).ok) return { x, y }; } return null; })();
  await ev(`__wp.goto(${pair.x + 4}, ${pair.y + 1}, .7);`); await idle();
  let r = await placeByTouch('pump_station', { x: pair.x, y: pair.y, w: 2, h: 2 }); check('pump station placed for the snap / pipe test', r.ok);
  v = await dropAndRead('oil_tank', { x: pair.x + 5, y: pair.y, w: 2, h: 2 }); check('smart snap: a tank dropped 2 tiles off line is pulled to line up with the pump outlet', v && v.ok && v.aligned && v.x !== pair.x + 5, JSON.stringify(v)); await shot('b-snap-aligned');
  const rot0 = v && v.r; c = await btn('bRot'); await tap(c[0], c[1]); await sleep(200); const v2 = await pending(); check('Rotate button turns the ghost 90 degrees', v2 && v2.r === ((rot0 + 1) & 3), JSON.stringify(v2)); c = await btn('bRot'); for (let i = 0; i < 3; i++) { await tap(c[0], c[1]); await sleep(150); }
  const v3 = await pending(); if (v3 && !v3.ok) { await tap(...(await btn('bCancel'))); v = await dropAndRead('oil_tank', { x: pair.x + 5, y: pair.y, w: 2, h: 2 }); } else v = v3; c = await btn('bBuild'); await tap(c[0], c[1]); await sleep(250); check('the snapped tank is built', await count('oil_tank') === 1);
  const ports = await ev('const S = __lab.store, B = __lab.B, ps = S.list().find(b => b.d === "pump_station"), tk = S.list().find(b => b.d === "oil_tank"); const o = B.worldPoints(ps).find(q => q.id === "PIPE_OUT"), i = B.worldPoints(tk).filter(q => q.role === "in").sort((a, b) => Math.hypot(a.ax - o.ax, a.ay - o.ay) - Math.hypot(b.ax - o.ax, b.ay - o.ay))[0]; return { o, i };');
  await ev('document.getElementById("tPipe").click();'); const A = await ev(`return [__wp.sx(${ports.o.ax + .5}, ${ports.o.ay + .5}), __wp.sy(${ports.o.ax + .5}, ${ports.o.ay + .5})];`), Z = await ev(`return [__wp.sx(${ports.i.ax + .5}, ${ports.i.ay + .5}), __wp.sy(${ports.i.ax + .5}, ${ports.i.ay + .5})];`);
  const cA = await cam(); await path2([A].concat(lerp(A, Z, 6)), 30); await touch('touchEnd'); await sleep(300); const cB = await cam(); check('pipe drag by touch did not pan the map', Math.abs(cA[0] - cB[0]) + Math.abs(cA[1] - cB[1]) < 1e-6);
  const lk = await ev('return __lab.store.links(__lab.pipes);'); check('pipe connection: a real link exists between the pump station and the tank', lk.length >= 1, JSON.stringify(lk[0])); await ev('document.getElementById("tPipe").click();');
  const tp = await ev('const t = __lab.store.list().find(b => b.d === "oil_tank"); return [__wp.sx(t.x + 1, t.y + 1), __wp.sy(t.x + 1, t.y + 1)];'); await tap(tp[0], tp[1]); await sleep(300); const panel = await ev('return document.getElementById("info").innerText;');
  check('tapping a building opens its panel', /Oil Tank/.test(panel) && /Status/.test(panel) && /Capacity/.test(panel) && /Condition/.test(panel) && /Maintenance/.test(panel) && /Connected pipes/.test(panel), panel.replace(/\s+/g, ' ').slice(0, 120)); await shot('b-building-panel');
  c = await btn('bDemo'); await tap(c[0], c[1]); await sleep(200); check('Demolish… only asks (nothing removed)', await ev('return __lab.store.list().length;') === 2); c = await btn('bDemoYes'); await tap(c[0], c[1]); await sleep(200);
  check('connected pipe: a SECOND confirmation is required, the tank still stands', /connected/.test(await ev('return document.getElementById("info").innerText;')) && await ev('return __lab.store.list().length;') === 2); await shot('b-demolish-confirm');
  const pn = await ev('return __lab.pipes.size;'); c = await btn('bDemoYes'); await tap(c[0], c[1]); await sleep(300); check('confirmed twice: the tank is gone and the pipe stays', await ev('return __lab.store.list().length;') === 1 && await ev('return __lab.pipes.size;') === pn);

  // ---- save / load across a page reload
  const snap = await ev('return JSON.stringify({ s: __lab.store.toJSON(), p: [...__lab.pipes].sort((a, b) => a - b), c: __lab.store.cash });'); await ev('__lab.save();'); await Page.reload(); await sleep(3000);
  let back = false; for (let i = 0; i < 90 && !back; i++) { back = await ev('return !!(window.__lab && __lab.restored);').catch(() => false); if (!back) await sleep(1000); }
  const snap2 = back && await ev('return JSON.stringify({ s: __lab.store.toJSON(), p: [...__lab.pipes].sort((a, b) => a - b), c: __lab.store.cash });'); check('save / load: after reloading the app everything is identical (buildings, rotations, states, pipes, cash)', snap === snap2);

  // ---- rapid touch
  { await ev('__lab.reset(); __lab.store.cash = 1e8; __wp.goto(' + (base[0]) + ',' + (base[1]) + ', .6);'); await idle(); const e0 = errors.length, c0 = await cam(); const a = await chipPt('warehouse');
    for (let i = 0; i < 15; i++) { await path2([a].concat(lerp(a, [a[0] + 3, a[1] - 60], 2), lerp([a[0] + 3, a[1] - 60], [120 + i * 12, 300 + i * 6], 3)), 8); await touch('touchEnd'); await sleep(20); if (i % 3 === 0) { await ev('__lab.cancelAll(true);'); } }
    await ev('__lab.cancelAll(true);'); check('15 rapid touch drags: no stuck drag, no error, nothing built without Build, camera unchanged', await ev('return !__lab.state.drag && __lab.store.list().length === 0;') && errors.length === e0 && Math.abs((await cam())[0] - c0[0]) < 1e-6); }

  // ---- frame times while dragging a ghost, and while panning the demo compound
  const demo = await ev('return await __lab.buildDemo();'); check('demo compound built on the device', demo && demo.ok && demo.total >= 15, JSON.stringify(demo)); out.demo = demo; await ev('document.getElementById("tFields").click();'); await idle();
  await shot('b-compound-close'); await ev('{ const c = __wp.cam; __wp.goto(c.x + 6, c.y + 6, .4); }'); await idle(); await shot('b-compound-medium'); await ev('document.getElementById("tRef").click();'); await idle(); await shot('b-compound-refinery'); await ev('__wp.goto(960, 640, 0.0045);'); await idle(); await shot('b-compound-far');
  const sampler = `window.__ft = []; window.__ftOn = true; let last = performance.now(); (function f() { const t = performance.now(); window.__ft.push(t - last); last = t; if (window.__ftOn) requestAnimationFrame(f); })();`;
  const stats = a => { a = a.slice(1).sort((x, y) => x - y); return { n: a.length, fps: +(a.length / (a.reduce((p, q) => p + q, 0) / 1000)).toFixed(1), p95: Math.round(a[Math.floor(a.length * .95)]), max: Math.round(a[a.length - 1]), over50: a.filter(x => x > 50).length }; };
  await ev('document.getElementById("tFields").click();'); await idle(); await ev(sampler); { const a = await chipPt('oil_tank'); const pts = [a].concat(lerp(a, [a[0] + 3, a[1] - 80], 4)); const P = []; for (let k = 0; k < 90; k++) P.push([100 + 200 * (0.5 + 0.5 * Math.sin(k / 9)), 300 + 160 * (0.5 + 0.5 * Math.cos(k / 7))]); await path2(pts.concat(P), 30); await touch('touchEnd'); await sleep(300); }
  await ev('window.__ftOn = false;'); await sleep(200); const dragStats = stats(await ev('return window.__ft;')); out.ghostDrag = dragStats; await ev('__lab.cancelAll(true);');
  check('frame times while dragging a ghost over the compound: ' + dragStats.fps + ' fps, p95 ' + dragStats.p95 + ' ms, max ' + dragStats.max + ' ms (emulator, software GL)', dragStats.n > 20);
  await ev('__wp.goto(' + (SR.x0 + 205) + ',' + (SR.y0 + 205) + ', .6);'); await idle(); await ev(sampler); await ev(`await new Promise(res => { const t0 = performance.now(); (function f() { const k = (performance.now() - t0) / 5000; __wp.goto(${SR.x0 + 190} + k * 40, ${SR.y0 + 190} + k * 40, .6); if (k < 1) requestAnimationFrame(f); else res(); })(); });`); await ev('window.__ftOn = false;'); const panStats = stats(await ev('return window.__ft;')); out.panCompound = panStats;
  check('frame times while panning across the compound at CLOSE: ' + panStats.fps + ' fps, p95 ' + panStats.p95 + ' ms, max ' + panStats.max + ' ms (emulator)', panStats.n > 20);
  out.baseline = await ev(`return await new Promise(res => { const c = document.createElement('canvas'); c.width = innerWidth * 2; c.height = innerHeight * 2; c.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:-1'; document.body.appendChild(c); const g = c.getContext('2d'), d = []; let last = performance.now(), t0 = last, n = 0; (function f() { const t = performance.now(); d.push(t - last); last = t; g.fillStyle = 'hsl(' + (n++ * 7 % 360) + ',40%,30%)'; g.fillRect(0, 0, c.width, c.height); if (t - t0 < 2500) requestAnimationFrame(f); else { c.remove(); d.shift(); d.sort((a, b) => a - b); res({ fps: d.length / 2.5, p95: d[Math.floor(d.length * .95)] }); } })(); });`);
  console.log('BASELINE blank full-screen canvas, no map: ' + out.baseline.fps.toFixed(1) + ' fps (emulator ceiling)');
  out.heapMB = await ev('return performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;'); check('JS heap ' + out.heapMB + ' MB', out.heapMB == null || out.heapMB < 400);
  check('no JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  fs.writeFileSync('results/building-perf.json', JSON.stringify(out, null, 1)); console.log('BUILDING SUMMARY ' + results.filter(r => r.ok).length + '/' + results.length + ' PASS'); await client.close();
})().catch(e => { console.log('FAIL crashed: ' + e.message); });
