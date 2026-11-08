'use strict';
/* Prototype test: the four giant-building footprints (12x9, 16x12, 24x16, 32x24), rotation, ports, touch selection, overlap, borders and refusals.
   node test-proto-giants.js   (needs Playwright; opens map-v2-prototype.html from this folder) */
const { chromium } = require('playwright'), path = require('path'), fs = require('fs'), assert = require('assert');
let n = 0; const ok = (c, m, x) => { if (!c) console.log('  FAIL ' + m + (x ? ' ' + JSON.stringify(x) : '')); assert(c, m); n++; console.log('  ok  ' + m); };
(async () => {
  const file = path.join(__dirname, 'map-v2-prototype.html'), src = fs.readFileSync(file, 'utf8'), tmp = path.join(require('os').tmpdir(), 'proto-giants.html');
  fs.writeFileSync(tmp, '<!doctype html><html lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + src + '</body></html>');
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 420, height: 820 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }), p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(String(e))); await p.goto('file://' + tmp); await p.waitForTimeout(1500);
  const E = f => p.evaluate(f);
  const SIZES = await E(() => __proto.GIANTS.map(g => ({ id: g.id, w: g.w, h: g.h })));
  ok(SIZES.length === 4 && SIZES[0].w === 12 && SIZES[3].w === 32 && SIZES[3].h === 24, 'four sizes: ' + SIZES.map(s => s.w + 'x' + s.h).join(', '));
  /* 1. a good industrial site accepts every size in both rotations; footprint, ports on the border */
  for (const s of SIZES) for (const rot of [0, 1]) {
    const r = await p.evaluate(([id, rot]) => { const g = __proto.GIANTS.find(q => q.id === id), x = 900, y = 260, w = rot ? g.h : g.w, h = rot ? g.w : g.h, res = __proto.check(g, x, y, rot), ports = __proto.ports(g, x, y, rot); return { res, ports, w, h, x, y }; }, [s.id, rot]);
    const onEdge = r.ports.every(q => q.x >= r.x - 1e-9 && q.x <= r.x + r.w + 1e-9 && q.y >= r.y - 1e-9 && q.y <= r.y + r.h + 1e-9 && (q.x === r.x || q.x === r.x + r.w || q.y === r.y || q.y === r.y + r.h));
    const inn = r.ports.find(q => q.t === 'in'), out = r.ports.find(q => q.t === 'out'), pipes = r.ports.filter(q => q.t === 'pipe');
    const opposite = rot ? (inn.y === r.y && out.y === r.y + r.h && pipes.every(q => q.x === r.x)) : (inn.x === r.x && out.x === r.x + r.w && pipes.every(q => q.y === r.y + r.h));
    ok(r.res.ok && r.res.tot === s.w * s.h, s.w + 'x' + s.h + ' rot ' + rot + ': accepted in the north refinery zone (' + r.res.tot + ' cells, all valid)');
    ok(r.ports.length === 6 && onEdge && opposite, s.w + 'x' + s.h + ' rot ' + rot + ': 6 ports on the border, entry and exit opposite, pipe ports on the third side');
  }
  /* 2. refusals */
  const chk = (x, y, rot, id) => p.evaluate(([x, y, rot, id]) => { const g = __proto.GIANTS.find(q => q.id === (id || 'g3')); return __proto.check(g, x, y, rot || 0); }, [x, y, rot, id]);
  let r = await chk(700, 700); ok(!r.ok && /C3/.test(r.why) && r.bad === r.tot, '32x24 inside C3 is refused: ' + r.why);
  r = await chk(620, 700); ok(!r.ok && /C3/.test(r.why) && r.bad > 0 && r.bad < r.tot, 'straddling the C3 border is refused (' + r.bad + ' of ' + r.tot + ' cells in C3)');
  for (const s of SIZES) { r = await chk(700, 700, 1, s.id); ok(!r.ok, s.w + 'x' + s.h + ' rotated inside C3 is refused'); }
  r = await chk(150, 700); ok(!r.ok && /البحر/.test(r.why), 'in the sea: ' + r.why);
  r = await chk(-10, 100); ok(!r.ok && /خارج/.test(r.why), 'off the west border: ' + r.why);
  r = await chk(2600, 100); ok(!r.ok && /خارج/.test(r.why), 'off the east border: ' + r.why); r = await chk(2540, 100); ok(!r.ok, 'half over the east border is refused (' + r.why + ')');
  r = await chk(100, 1700); ok(!r.ok && /خارج/.test(r.why), 'off the south border');
  const find = cls => p.evaluate(c => { for (let y = 60; y < 1540; y += 10) for (let x = 700; x < 2480; x += 10) if (__proto.tile(x, y) === c) return { x, y }; return null; }, cls);
  const rk = await find(5), rock = rk && await p.evaluate(([x, y]) => { const c = __proto.check(__proto.GIANTS[3], x - 16, y - 12, 0); return { ok: c.ok, why: c.why, x, y }; }, [rk.x, rk.y]);
  ok(rock && !rock.ok, 'on a mountain / rock: refused (' + (rock ? rock.x + ',' + rock.y + ': ' + rock.why : '') + ')');
  const lk = await find(7), lake = lk && await p.evaluate(([x, y]) => __proto.check(__proto.GIANTS[3], x - 16, y - 12, 0), [lk.x, lk.y]);
  ok(lake && !lake.ok, 'on a lake: refused (' + (lake && lake.why) + ')');
  const wd = await find(6), wadi = wd && await p.evaluate(([x, y]) => __proto.check(__proto.GIANTS[3], x - 16, y - 12, 0), [wd.x, wd.y]);
  ok(wadi && !wadi.ok, 'on a dry wadi: refused (' + (wadi && wadi.why) + ')');
  const steep = null;
  
  /* 3. placement through the real UI with touch, overlap, selection */
  await E(() => __proto.setTab('giant')); await p.click('[data-g=g3]'); await p.click('#gplace'); await p.waitForTimeout(600);
  const rect = await E(() => { const r = document.getElementById('c').getBoundingClientRect(); return { l: r.left, t: r.top }; });
  const tapTile = async (x, y) => { const s = await p.evaluate(([x, y]) => __proto.toScreen(x, y), [x, y]); await p.touchscreen.tap(rect.l + s.x, rect.t + s.y); await p.waitForTimeout(150); };
  await E(() => __proto.goto(916, 272, .45, 0)); await p.waitForTimeout(1200);
  await tapTile(916, 272);
  let g = await E(() => ({ okDisabled: document.getElementById('gok').disabled, info: document.getElementById('ginfo').textContent })); ok(!g.okDisabled && /يمكن البناء/.test(g.info), 'tap on the industrial zone: preview is valid, confirm enabled');
  await p.click('#grot'); await p.waitForTimeout(200); g = await E(() => document.getElementById('ginfo').textContent); ok(/24.32|32.24/.test(g) && /يمكن البناء/.test(g), 'rotate keeps a valid preview');
  await p.click('#grot'); await p.click('#gok'); await p.waitForTimeout(200);
  ok(await E(() => __proto.placed.length) === 1, 'the 32x24 building is placed (1 on the map)');
  await E(() => __proto.giantMode('g2', 910, 268)); await p.waitForTimeout(200); g = await E(() => ({ d: document.getElementById('gok').disabled, t: document.getElementById('ginfo').textContent })); ok(g.d && /يتداخل/.test(g.t), 'a second building on top of it is refused: overlap');
  r = await chk(932, 260, 0, 'g1'); ok(r.ok, 'next to it, touching edge to edge, is accepted');
  await p.click('#gplace'); await p.waitForTimeout(100); /* leave preview mode */
  await tapTile(916, 272); ok(await E(() => __proto.sel() !== null), 'touch inside the building selects it');
  await E(() => __proto.goto(916, 272, .2, 0)); await p.waitForTimeout(500); await tapTile(940, 300); ok(await E(() => __proto.sel() === null), 'touch away from the building clears the selection'); await E(() => __proto.goto(916, 272, .45, 0)); await p.waitForTimeout(500);
  await tapTile(933, 278); ok(await E(() => __proto.sel() !== null), 'touch one tile outside the edge still selects it (enlarged touch area)');
  await tapTile(916, 272); await E(() => __proto.goto(916, 272, .2, 0)); await p.waitForTimeout(500); await tapTile(941, 278); ok(await E(() => __proto.sel() === null), 'touch 8 tiles outside does not'); await E(() => __proto.goto(916, 272, .45, 0)); await p.waitForTimeout(500);
  await tapTile(916, 272); await p.click('#gdel'); ok(await E(() => __proto.placed.length) === 0, 'delete removes the selected building');
  /* 4. the same flow refused in C3 through the UI */
  await p.click('#gplace'); await E(() => __proto.goto(800, 800, .3, 0)); await p.waitForTimeout(1000); await tapTile(800, 800);
  g = await E(() => ({ d: document.getElementById('gok').disabled, t: document.getElementById('ginfo').textContent })); ok(g.d && /C3/.test(g.t), 'tap inside C3: confirm stays disabled, reason names C3');
  const size = await E(() => document.getElementById('gok').getBoundingClientRect().height); ok(size >= 36, 'buttons are at least 36 px high for fingers (' + Math.round(size) + ')');
  ok(errs.length === 0, 'no page errors', errs);
  await b.close(); console.log('\nGIANT BUILDING PROTOTYPE TESTS PASSED (' + n + ' checks)');
})().catch(e => { console.error(e); process.exit(1); });
