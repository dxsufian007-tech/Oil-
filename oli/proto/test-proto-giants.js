'use strict';
/* Prototype test (round 3): the four giant-building footprints (12x9, 16x12, 24x16, 32x24) in four rotations, ports that turn with the building,
   pipe connection to every port, touch selection, overlap, borders, refusals; no road network; clean industrial land; terrain shares; generation off the main thread.
   node test-proto-giants.js   (needs Playwright; opens map-v2-prototype.html from this folder) */
const { chromium } = require('playwright'), path = require('path'), fs = require('fs'), assert = require('assert');
let n = 0; const ok = (c, m, x) => { if (!c) console.log('  FAIL ' + m + (x ? ' ' + JSON.stringify(x) : '')); assert(c, m); n++; console.log('  ok  ' + m); };
(async () => {
  const file = path.join(__dirname, 'map-v2-prototype.html'), src = fs.readFileSync(file, 'utf8'), tmp = path.join(require('os').tmpdir(), 'proto-giants.html');
  fs.writeFileSync(tmp, '<!doctype html><html lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + src + '</body></html>');
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 420, height: 820 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }), p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(String(e))); await p.goto('file://' + tmp); await p.waitForFunction(() => window.__proto && __proto.ready(), null, { timeout: 90000 });
  const E = f => p.evaluate(f);
  const SIZES = await E(() => __proto.GIANTS.map(g => ({ id: g.id, w: g.w, h: g.h })));
  ok(SIZES.length === 4 && SIZES[0].w === 12 && SIZES[3].w === 32 && SIZES[3].h === 24, 'four sizes: ' + SIZES.map(s => s.w + 'x' + s.h).join(', '));

  /* 1. a good industrial site accepts every size in all four rotations; ports on the border, facing out, turning with the building */
  for (const s of SIZES) for (const rot of [0, 1, 2, 3]) {
    const r = await p.evaluate(([id, rot]) => { const g = __proto.GIANTS.find(q => q.id === id), x = 900, y = 260, w = rot % 2 ? g.h : g.w, h = rot % 2 ? g.w : g.h; return { res: __proto.check(g, x, y, rot), ports: __proto.ports(g, x, y, rot), w, h, x, y }; }, [s.id, rot]);
    const side = q => q.x === r.x ? 'W' : q.x === r.x + r.w ? 'E' : q.y === r.y ? 'N' : q.y === r.y + r.h ? 'S' : null, out = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] };
    const facing = r.ports.every(q => { const sd = side(q); return sd && q.dx === out[sd][0] && q.dy === out[sd][1] && q.x >= r.x && q.x <= r.x + r.w && q.y >= r.y && q.y <= r.y + r.h; });
    const cells = r.ports.every(q => { const inside = q.cx >= r.x && q.cx < r.x + r.w && q.cy >= r.y && q.cy < r.y + r.h; return !inside && Math.abs(q.cx + .5 - (q.x + q.dx * .5)) <= .5 + 1e-9 && Math.abs(q.cy + .5 - (q.y + q.dy * .5)) <= .5 + 1e-9; });
    const inn = r.ports.find(q => q.t === 'in'), outp = r.ports.find(q => q.t === 'out'), pipes = r.ports.filter(q => q.t === 'pipe');
    ok(r.res.ok && r.res.tot === s.w * s.h, s.w + 'x' + s.h + ' rot ' + rot * 90 + ': accepted in the north refinery zone (' + r.res.tot + ' cells, all valid)');
    ok(r.ports.length === 6 && facing && cells, s.w + 'x' + s.h + ' rot ' + rot * 90 + ': 6 ports on the border, each faces outward, each has its outside attach cell');
    ok(inn.dx === -outp.dx && inn.dy === -outp.dy && pipes.length === 4 && pipes.every(q => q.dx === pipes[0].dx && q.dy === pipes[0].dy && q.dx * inn.dx + q.dy * inn.dy === 0), s.w + 'x' + s.h + ' rot ' + rot * 90 + ': entry and exit face opposite ways; the four pipe ports share the third side');
  }
  /* each rotation is the previous one turned 90 degrees clockwise: positions and directions of all six ports */
  for (const s of SIZES) for (const rot of [0, 1, 2, 3]) {
    const r = await p.evaluate(([id, rot]) => { const g = __proto.GIANTS.find(q => q.id === id), a = __proto.ports(g, 0, 0, rot), b = __proto.ports(g, 0, 0, (rot + 1) % 4), h = rot % 2 ? g.w : g.h; return { a, b, h }; }, [s.id, rot]);
    const same = r.a.every((q, i) => { const t = r.b[i]; return q.t === t.t && Math.abs(r.h - q.y - t.x) < 1e-9 && Math.abs(q.x - t.y) < 1e-9 && -q.dy === t.dx && q.dx === t.dy; });
    ok(same, s.w + 'x' + s.h + ': rotation ' + rot * 90 + '° → ' + ((rot + 1) % 4) * 90 + '° turns every port (position and direction) by exactly 90°');
  }
  /* 2. a pipe reaches every port: breadth-first route from the attach cell of each port to a far target, round the building only (never held back by the ground) */
  let routes = 0;
  for (const s of SIZES) for (const rot of [0, 1, 2, 3]) {
    const r = await p.evaluate(([id, rot]) => { const g = __proto.GIANTS.find(q => q.id === id), x = 900, y = 260, w = rot % 2 ? g.h : g.w, h = rot % 2 ? g.w : g.h, ports = __proto.ports(g, x, y, rot), av = [{ x, y, w, h }], out = [];
      for (const q of ports) { const tx = Math.round(q.cx + q.dx * 26 + (q.dy ? 14 : 0)), ty = Math.round(q.cy + q.dy * 26 + (q.dx ? 14 : 0)), path = __proto.route({ x: q.cx, y: q.cy }, { x: tx, y: ty }, av, 40);
        const inFp = path ? path.some(c => c.x >= x && c.x < x + w && c.y >= y && c.y < y + h) : null, step = path ? path.every((c, i) => !i || Math.abs(c.x - path[i - 1].x) + Math.abs(c.y - path[i - 1].y) === 1) : null;
        out.push({ t: q.t, found: !!path, start: path && path[0].x === q.cx && path[0].y === q.cy, end: path && path[path.length - 1].x === tx && path[path.length - 1].y === ty, inFp, step, len: path && path.length, man: Math.abs(tx - q.cx) + Math.abs(ty - q.cy) + 1 }) }
      return out; }, [s.id, rot]);
    routes += r.length;
    ok(r.every(q => q.found && q.start && q.end && !q.inFp && q.step), s.w + 'x' + s.h + ' rot ' + rot * 90 + ': a pipe route starts at the attach cell of all 6 ports and reaches its target without entering the building');
    ok(r.every(q => q.len <= q.man + 4), s.w + 'x' + s.h + ' rot ' + rot * 90 + ': routes are near-shortest (a port facing away does not need a long detour)', r.map(q => q.len + '/' + q.man));
  }
  ok(routes === 96, '96 port routes tested (4 sizes x 4 rotations x 6 ports)');
  let pair = 0;
  for (const ra of [0, 1, 2, 3]) for (const rb of [0, 1, 2, 3]) {
    const r = await p.evaluate(([ra, rb]) => { const A = __proto.GIANTS[3], B = __proto.GIANTS[1], ax = 820, ay = 240, bx = 960, by = 300, pa = __proto.ports(A, ax, ay, ra), pb = __proto.ports(B, bx, by, rb), wa = ra % 2 ? A.h : A.w, ha = ra % 2 ? A.w : A.h, wb = rb % 2 ? B.h : B.w, hb = rb % 2 ? B.w : B.h, av = [{ x: ax, y: ay, w: wa, h: ha }, { x: bx, y: by, w: wb, h: hb }];
      const o = pa.find(q => q.t === 'out'), i = pb.find(q => q.t === 'in'), path = __proto.route({ x: o.cx, y: o.cy }, { x: i.cx, y: i.cy }, av, 40); return { found: !!path, bad: path && path.some(c => av.some(a => c.x >= a.x && c.x < a.x + a.w && c.y >= a.y && c.y < a.y + a.h)) }; }, [ra, rb]);
    if (r.found && !r.bad) pair++;
  }
  ok(pair === 16, 'exit of a 32x24 reaches the entry of a 16x12 in all 16 rotation pairs (' + pair + ' of 16)');
  const across = await E(() => { const a = { x: 1565, y: 330 }, b = { x: 1635, y: 330 }, path = __proto.route(a, b, [], 10); const kinds = path.map(c => __proto.tile(c.x + .5, c.y + .5)); return { len: path.length, lake: kinds.filter(k => k === 7).length, ok: path.length === 71 }; });
  ok(across.ok && across.lake > 10, 'a pipe goes straight across a lake (' + across.lake + ' lake cells on a ' + across.len + '-cell route): the ground does not hold pipes back');
  const rockAcross = await E(() => { let hit = null; for (let y = 300; y < 1300 && !hit; y += 6) for (let x = 800; x < 2300 && !hit; x += 6) { if (__proto.tile(x, y) === 5) { const a = { x: x - 20, y }, b = { x: x + 20, y }, path = __proto.route(a, b, [], 6); if (path && path.length === 41) hit = { x, y, rock: path.filter(c => __proto.tile(c.x + .5, c.y + .5) === 5).length }; } } return hit; });
  ok(rockAcross && rockAcross.rock > 0, 'and across rock ground: a straight 41-cell route through ' + (rockAcross ? rockAcross.rock : 0) + ' rock cells');

  /* 3. refusals of an invalid site */
  const chk = (x, y, rot, id) => p.evaluate(([x, y, rot, id]) => { const g = __proto.GIANTS.find(q => q.id === (id || 'g3')); return __proto.check(g, x, y, rot || 0); }, [x, y, rot, id]);
  let r = await chk(700, 700); ok(!r.ok && /C3/.test(r.why) && r.bad === r.tot, '32x24 inside C3 is refused: ' + r.why);
  r = await chk(620, 700); ok(!r.ok && /C3/.test(r.why) && r.bad > 0 && r.bad < r.tot, 'straddling the C3 border is refused (' + r.bad + ' of ' + r.tot + ' cells in C3)');
  for (const s of SIZES) for (const rot of [1, 2, 3]) { r = await chk(700, 700, rot, s.id); ok(!r.ok, s.w + 'x' + s.h + ' rot ' + rot * 90 + ' inside C3 is refused'); }
  r = await chk(150, 700); ok(!r.ok && /البحر/.test(r.why), 'in the sea: ' + r.why);
  r = await chk(-10, 100); ok(!r.ok && /خارج/.test(r.why), 'off the west border: ' + r.why);
  r = await chk(2600, 100); ok(!r.ok && /خارج/.test(r.why), 'off the east border: ' + r.why); r = await chk(2540, 100); ok(!r.ok, 'half over the east border is refused (' + r.why + ')');
  r = await chk(100, 1700); ok(!r.ok && /خارج/.test(r.why), 'off the south border');
  const find = cls => p.evaluate(c => { for (let y = 300; y < 1300; y += 6) for (let x = 800; x < 2300; x += 6) if (__proto.tile(x, y) === c) return { x, y }; return null; }, cls);
  for (const [cls, nm] of [[5, 'a rock outcrop / mountain'], [7, 'a lake'], [6, 'a dry wadi']]) { const f = await find(cls), res = f && await p.evaluate(([x, y]) => __proto.check(__proto.GIANTS[3], x - 16, y - 12, 0, true), [f.x, f.y]); ok(res && !res.ok && res.badList.length > 0, 'on ' + nm + ': refused (' + (res && res.why) + '), ' + (res && res.badList.length) + ' bad cells listed for the red overlay'); }

  /* 4. placement through the real UI with touch, overlap, selection, four-step rotation */
  await E(() => __proto.setTab('giant')); await p.click('[data-g=g3]'); await p.click('#gplace'); await p.waitForTimeout(600);
  const rect = await E(() => { const r = document.getElementById('c').getBoundingClientRect(); return { l: r.left, t: r.top }; });
  const tapTile = async (x, y) => { const s = await p.evaluate(([x, y]) => __proto.toScreen(x, y), [x, y]); await p.touchscreen.tap(rect.l + s.x, rect.t + s.y); await p.waitForTimeout(150); };
  const view = async (x, y, z) => { await p.evaluate(([x, y, z]) => __proto.goto(x, y, z, 0), [x, y, z]); await p.waitForFunction(() => __proto.missing() === 0, null, { timeout: 90000 }); await p.waitForTimeout(250); };
  await view(916, 272, .45);
  await tapTile(916, 272);
  let g = await E(() => ({ okDisabled: document.getElementById('gok').disabled, info: document.getElementById('ginfo').textContent })); ok(!g.okDisabled && /يمكن البناء/.test(g.info), 'tap on the industrial zone: preview is valid, confirm enabled');
  const rots = []; for (let i = 0; i < 4; i++) { await p.click('#grot'); await p.waitForTimeout(120); rots.push(await E(() => __proto.rot())); g = await E(() => document.getElementById('ginfo').textContent); ok(/يمكن البناء/.test(g) && new RegExp('التدوير\\s*' + (rots[i] * 90) + '°').test(g), 'rotate button step ' + (i + 1) + ': rotation ' + rots[i] * 90 + '°, preview stays valid'); }
  ok(rots.join() === '1,2,3,0', 'four taps on rotate go 90°, 180°, 270°, back to 0°');
  await p.click('#grot'); await p.click('#grot'); await p.click('#gok'); await p.waitForTimeout(200);
  ok(await E(() => __proto.placed.length) === 1 && await E(() => __proto.placed[0].r) === 2, 'the 32x24 building is placed rotated 180° (1 on the map)');
  await E(() => __proto.giantMode('g2', 910, 268)); await p.waitForTimeout(200); g = await E(() => ({ d: document.getElementById('gok').disabled, t: document.getElementById('ginfo').textContent })); ok(g.d && /يتداخل/.test(g.t), 'a second building on top of it is refused: overlap');
  r = await chk(932, 260, 0, 'g1'); ok(r.ok, 'next to it, touching edge to edge, is accepted');
  await p.click('#gplace'); await p.waitForTimeout(100);
  await tapTile(916, 272); ok(await E(() => __proto.sel() !== null), 'touch inside the building selects it');
  await view(916, 272, .2); await tapTile(944, 290); ok(await E(() => __proto.sel() === null), 'touch away from the building clears the selection'); await view(916, 272, .45);
  await tapTile(916, 259.2); ok(await E(() => __proto.sel() !== null), 'touch one tile outside the edge still selects it (enlarged touch area)');
  await tapTile(916, 272); await view(916, 272, .2); await tapTile(916, 248); ok(await E(() => __proto.sel() === null), 'touch 12 tiles outside does not'); await view(916, 272, .45);
  await tapTile(916, 272); await p.click('#gdel'); ok(await E(() => __proto.placed.length) === 0, 'delete removes the selected building');
  await p.click('#gplace'); await view(800, 800, .3); await tapTile(800, 800);
  g = await E(() => ({ d: document.getElementById('gok').disabled, t: document.getElementById('ginfo').textContent })); ok(g.d && /C3/.test(g.t), 'tap inside C3: confirm stays disabled, reason names C3');
  const size = await E(() => document.getElementById('gok').getBoundingClientRect().height); ok(size >= 36, 'buttons are at least 36 px high for fingers (' + Math.round(size) + ')');

  /* 5. no road network anywhere; the only visible links are pipes */
  const nr = await E(() => { __proto.setTab('layers'); const labels = [...document.querySelectorAll('#body label.sw span:last-child')].map(s => s.textContent); return { keys: Object.keys(__proto.L), labels, roads: __proto.roadsLayer(), text: document.body.innerText }; });
  ok(!nr.keys.includes('roads') && nr.roads === null && !nr.labels.some(l => /طري/.test(l)), 'no roads layer: ' + nr.keys.join(','));
  ok(/لا توجد طرق/.test(nr.text) && !/طريق (رئيسي|فرعي|خدمة)/.test(nr.text), 'the layers panel says there are no roads and lists no road type');
  const pp = await E(() => { const Z = __proto.ZONES.filter(z => z.k !== 'FUTURE'); const res = __proto.PIPES.map(P => { let axis = true, inside = 0; for (let i = 1; i < P.p.length; i++) if (P.p[i][0] !== P.p[i - 1][0] && P.p[i][1] !== P.p[i - 1][1]) axis = false;
      for (let i = 1; i < P.p.length; i++) for (let t = .05; t < 1; t += .05) { const x = P.p[i - 1][0] + (P.p[i][0] - P.p[i - 1][0]) * t, y = P.p[i - 1][1] + (P.p[i][1] - P.p[i - 1][1]) * t; for (const z of Z) if (x > z.x + 10 && x < z.x + z.w - 10 && y > z.y + 10 && y < z.y + z.h - 10) inside++; }
      return { axis, inside, from: P.from, to: P.to }; }); return { n: res.length, axis: res.every(q => q.axis), inside: res.reduce((a, q) => a + q.inside, 0), hubs: __proto.HUBS.length }; });
  ok(pp.n === 12 && pp.axis && pp.inside === 0, 'illustrative pipes: 12 links, all straight orthogonal runs, none cross a compound (' + pp.n + ' links, ' + pp.hubs + ' collector points)');
  const sl = await E(() => { const S = __proto.SLOTS; let overlap = 0, outside = 0, c3c = 0; const zs = Object.fromEntries(__proto.ZONES.map(z => [z.id, z]));
      for (let i = 0; i < S.length; i++) { const a = S[i], z = zs[a.z]; if (a.x < z.x || a.y < z.y || a.x + a.w > z.x + z.w || a.y + a.h > z.y + z.h) outside++; for (let j = i + 1; j < S.length; j++) { const b = S[j]; if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) overlap++; } }
      const C = zs.C3, cx = C.x + C.w / 2, cy = C.y + C.h / 2; for (const a of S) if (a.z === 'C3' && a.x < cx + 110 && a.x + a.w > cx - 110 && a.y < cy + 95 && a.y + a.h > cy - 95) c3c++; return { n: S.length, overlap, outside, c3c, c3: S.filter(a => a.z === 'C3').length }; });
  ok(sl.overlap === 0 && sl.outside === 0 && sl.n > 100, 'layout slots: ' + sl.n + ' places for wells, tanks, refineries, pumps; none overlap, all inside their compound');
  ok(sl.c3 === 12 && sl.c3c === 0, 'C3: 12 plots along the fence and the central 220x190 open space stays free for tanks, pumps and expansion');

  /* 6. land: compounds are clean and flat; natural features stay out; shares */
  const cl = await E(() => { const Z = __proto.ZONES.filter(z => z.k !== 'FUTURE'); let bad = 0, tot = 0, maxSl = 0; for (const z of Z) for (let y = z.y + 3; y < z.y + z.h; y += 6) for (let x = z.x + 3; x < z.x + z.w; x += 6) { const k = __proto.tile(x, y); tot++; const sl = __proto.slope(x, y); if (sl > maxSl) maxSl = sl; if (!(k === 3 || k === 2)) bad++; } return { bad, tot, maxSl }; });
  ok(cl.bad === 0 && cl.maxSl < .02, 'industrial land and C3 are clean: ' + cl.tot + ' samples, all plain flat ground (steepest slope ' + cl.maxSl.toFixed(4) + ')');
  const nf = await E(() => { let w = 0, r = 0; for (let y = 200; y < 1400; y += 5) for (let x = 760; x < 2400; x += 5) { const k = __proto.tile(x, y); if (k === 6) w++; if (k === 5) r++; } return { w, r }; });
  ok(nf.w > 200 && nf.r > 200, 'natural features exist outside the compounds: ' + nf.w + ' dry-wadi and ' + nf.r + ' rock samples');
  const st = await E(() => { const S = __proto.stats, LA = S.land, T = S.total, t = S.rock + S.wadi + S.lake; return { flat: 100 * (S.flat + S.beach) / LA, hill: 100 * S.hill / LA, nat: 100 * t / LA, bld: 100 * (T - S.sea - S.future - t) / T }; });
  ok(Math.abs(st.flat - 80) < 1.5 && Math.abs(st.hill - 10) < 1.5 && Math.abs(st.nat - 10) < 1.5, 'land shares ' + st.flat.toFixed(1) + ' / ' + st.hill.toFixed(1) + ' / ' + st.nat.toFixed(1) + ' (target 80 / 10 / 10)');

  /* 6b. R4: buildable share, slots and collection points are an optional visual aid only */
  const bw = await E(() => { const S = __proto.stats, T = S.total; return 100 * (T - S.sea - S.future - S.rock - S.wadi - S.lake) / T });
  ok(bw >= 65, 'buildable industrial land is ' + bw.toFixed(1) + '% of the world (target 65%)');
  const aid = await E(() => { const P = __proto, G = P.GIANTS[0], pts = [[1090, 340], [1500, 700], [1600, 330]], snap = () => JSON.stringify([pts.map(p => P.check(G, p[0], p[1], 0, true).ok), (P.route({ x: 1000, y: 340 }, { x: 1200, y: 420 }, [], 10) || []).length]);
    const L0 = { ...P.L }, a = snap(); P.L.slots = false; P.L.pipes = false; const b = snap(); P.L.slots = true; P.L.pipes = true; const c = snap(); Object.assign(P.L, L0);
    const srcs = [P.route.toString(), P.check.toString(), P.stubs.toString(), P.ports.toString()].join(' ');
    const s = P.SLOTS.find(s => s.zone !== 'C3' && s.w), o = s ? P.check(G, s.x, s.y, 0, true) : null;
    return { same: a === b && b === c, refs: /SLOTS|HUBS|PIPES/.test(srcs), slotOk: o ? o.ok === true || (o.badList && o.badList.length >= 0) : null, nslots: P.SLOTS.length, nhubs: P.HUBS.length } });
  ok(aid.same, 'toggling the slots/pipes layers changes no placement or pipe-route result');
  ok(!aid.refs, 'placement checks, ports and pipe routing do not reference SLOTS, HUBS or the drawn PIPES');
  ok(aid.nslots === 265 && aid.nhubs === 24, 'organisation data: ' + aid.nslots + ' slots and ' + aid.nhubs + ' collection points');
  const hubRoute = await E(() => { const P = __proto, h = P.HUBS[0], g = P.GIANTS[0], p = P.ports(g, 1090, 340, 0)[2], q = P.ports(g, 1090, 400, 0)[2]; return { free: (P.route({ x: p.cx, y: p.cy }, { x: q.cx, y: q.cy }, [], 10) || []).length > 0 } });
  ok(hubRoute.free, 'a pipe between two ports is routed freely, with no collection point in between');
  const bn = await E(async () => { __proto.setTab('perf'); const r = await __proto.bench(null, { scale: .25 }); return { n: r.scenes.length, ui: !!document.getElementById('pgo'), dev: !!r.device.ua, cache: r.cache_blocks } });
  ok(bn.n === 5 && bn.ui && bn.dev, 'the in-page Android benchmark tab runs 5 scenes and reports device info');

  /* 7. generation off the main thread, and identical to the in-page generator */
  ok(await E(() => __proto.mode()) === 'worker', 'terrain and blocks are generated in a Web Worker');
  await view(1000, 400, .3);
  const cs = await E(() => { const k = [[7, 3], [8, 3], [8, 2], [6, 3]].find(([cx, cy]) => __proto.chunkSum(cx, cy) !== null) || [7, 3]; return { k, w: __proto.chunkSum(k[0], k[1]), s: __proto.syncChunkSum(k[0], k[1]) }; });
  ok(cs.w !== null && cs.w === cs.s, 'a block made by the Worker is pixel-identical to the same block made in the page (' + cs.k + ')');
  ok(errs.length === 0, 'no page errors', errs);
  await b.close(); console.log('\nGIANT BUILDING / MAP PROTOTYPE TESTS PASSED (' + n + ' checks)');
})().catch(e => { console.error(e); process.exit(1); });
