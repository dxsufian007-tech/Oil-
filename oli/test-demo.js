// The DEMO build: $100M, everything unlocked, every region open and every oil field drillable.   NODE_PATH=/opt/npm-tools/node_modules node test-demo.js
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
(async () => {
  const b = await chromium.launch(), p = await (await b.newContext({ viewport: { width: 412, height: 866 }, hasTouch: true, isMobile: true })).newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); });
  const co = (f, a) => p.evaluate(f, a);
  await p.goto('http://localhost:' + srv.address().port + '/?demo=1'); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 }); await co(() => { localStorage.clear(); __lab.reset(); __lab.company.speed = 0; });
  ok((await p.innerText('#eh-cash')).replace(/[⁦⁩]/g, '').includes('$100M'), 'the demo starts with $100M');
  await p.locator('#g-nav [data-cat=process]').tap(); await p.waitForTimeout(300);
  ok((await co(() => [...document.querySelectorAll('#g-list .gcard')].every(c => !c.classList.contains('lock') && c.querySelector('[data-act=build]')))), 'every refinery / separator card is unlocked');
  await p.locator('#g-nav [data-cat=storage]').tap(); await p.waitForTimeout(300); ok((await co(() => document.querySelectorAll('#g-list .gcard:not(.lock)').length)) === 15, 'all 15 storage buildings are unlocked');
  await p.locator('#g-nav [data-cat=pipes]').tap(); await p.waitForTimeout(300); ok((await co(() => document.querySelectorAll('#g-list .gcard:not(.lock)').length)) === 3, 'pipe, junction and valve are unlocked');
  await p.waitForFunction(() => __wp.world.regions.every(r => __wp.world.hasRegion(r.id)), null, { timeout: 120000 });
  const w = await co(() => { const W = __wp.world; let fields = 0, open = 0, un = 0; for (const r of W.regions) { if (r.unlocked) un++; for (const s of W.regionSites(r.id)) if (s.kind === 'FIELD') { fields++; const st = W.stateOf(s.id); if (st === 'DRILLABLE' || st === 'PRODUCING') open++; } } return { regions: W.regions.length, un, fields, open }; });
  ok(w.un === w.regions && w.fields > 20 && w.open === w.fields, 'all ' + w.regions + ' regions are unlocked and all ' + w.fields + ' oil fields are drillable');
  await co(() => { const W = __wp.world, far = W.regions.filter(r => !r.starter).pop(); window.__ff = W.regionSites(far.id).find(s => s.kind === 'FIELD'); __wp.goto(window.__ff.x, window.__ff.y, .6); }); await p.waitForFunction(() => __wp.idle(), null, { timeout: 120000 }); await p.waitForTimeout(800);
  ok(await co(() => { const f = window.__ff, sn = __lab.store.snap('oil_well', Math.round(f.x), Math.round(f.y), 0, { radius: 8, ignoreCash: true }); const r = sn && __lab.store.place('oil_well', sn.x, sn.y, sn.r, { instant: true }); return !!(r && r.ok); }), 'after travelling to the farthest region a well can be drilled there');
  ok(errs.length === 0, 'no console / page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close(); srv.close(); console.log('\nDEMO TESTS PASSED (' + n + ' checks)');
})().catch(e => { console.log('FAILED: ' + e.message.split('\n').slice(0, 3).join(' / ')); process.exit(1); });
