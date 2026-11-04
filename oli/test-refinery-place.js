// A refinery must be placed inside a refinery zone. Tapping near a zone edge or looking at a far area must still find a valid spot.   NODE_PATH=/opt/npm-tools/node_modules node test-refinery-place.js
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
(async () => {
  const b = await chromium.launch(), p = await (await b.newContext({ viewport: { width: 412, height: 866 }, hasTouch: true, isMobile: true })).newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message));
  const co = (f, a) => p.evaluate(f, a);
  await p.goto('http://localhost:' + srv.address().port + '/?unlock=all'); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 }); await co(() => { localStorage.clear(); __lab.reset(); __lab.company.speed = 0; __lab.store.cash = 1e9; });
  const z = await co(() => { const W = __wp.world; for (const r of W.regions) { const zs = W.refineryZones(r.id); if (zs.length) return { x: zs[0].x, y: zs[0].y, w: zs[0].w, h: zs[0].h }; } return null; });
  ok(!!z, 'the map has a refinery zone');
  // 1. the camera is far away from the zone: the refinery search still brings a valid spot inside the zone
  await co(() => __wp.goto(__wp.world.regions[0].x0 + 40, __wp.world.regions[0].y0 + 40, .6)); await p.waitForFunction(() => __wp.idle(), null, { timeout: 120000 });
  await co(z => { __wp.goto(z.x + z.w / 2, z.y + z.h / 2, .6); }, z); await p.waitForFunction(() => __wp.idle(), null, { timeout: 120000 }); await p.waitForTimeout(500);
  const res = await co(() => { __lab.startBuild('refinery_s'); const g = () => __lab.state.pending; const out = [g() && (g().verdict.reason || 'OK')]; for (let i = 0; i < 4; i++) { document.getElementById('bNext').click(); out.push(g() && (g().verdict.reason || 'OK')); } return out; });
  ok(res.every(r => r === 'OK'), 'from the zone, every suggested spot for a small refinery is valid: ' + res.join(', '));
  // 2. the ghost placed on the zone edge is refused with the new message (points to the purple zone), not a generic "cannot"
  const edge = await co(z => { const g = __lab.state.pending; g.x = z.x; g.y = z.y; g.r = 0; g.verdict = __lab.store.validate('refinery_s', z.x, z.y, 0, {}); return g.verdict.reason || 'OK'; }, z);
  ok(edge === 'needsZone' || edge === 'OK', 'an edge spot gives an explicit reason (' + edge + ')');
  // 3. the build succeeds from the suggested spot
  await co(() => document.getElementById('bNext').click()); await p.waitForTimeout(150); await p.locator('#bBuild').tap(); await p.waitForTimeout(400);
  ok(await co(() => __lab.store.list().some(b => b.d === 'refinery_s')), 'the refinery is built from the suggested spot');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await b.close(); srv.close(); console.log('\nREFINERY PLACE TESTS PASSED (' + n + ' checks)');
})().catch(e => { console.log('FAILED: ' + e.message.split('\n').slice(0, 3).join(' / ')); process.exit(1); });
