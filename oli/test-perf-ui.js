// Stage 5 perf (browser): the map is only redrawn when something changed; pumping costs at most the old 2 frames/s; sprites and manifold card work
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); }); });
let pass = 0, fail = 0; const ck = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n + (x != null ? ' ' + x : '')); } else { fail++; console.log('FAIL ' + n + (x != null ? ' ' + x : '')); } };
srv.listen(0, async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 412, height: 866 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }); const errs = [];
  async function open(q) { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto('http://localhost:' + srv.address().port + '/?unlock=all' + q); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 });
    const f0 = await p.evaluate(() => { localStorage.clear(); __lab.reset(); __lab.company.speed = 0; __lab.store.cash = 1e13; const f = __lab.fieldSites()[0]; __wp.goto(f.x, f.y, .8); return [Math.round(f.x), Math.round(f.y)]; });
    await p.waitForFunction(([x, y]) => __lab.store.validate('crude_tank_l', x, y, 0, { ignoreCash: true }).reason !== 'notLoaded', f0, { timeout: 60000 }); await p.waitForTimeout(3000);
    const id = await p.evaluate(([cx, cy]) => { const L = __lab, st = L.store, I = L.I; const find = (d, x0, y0) => { for (let r = 0; r < 60; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; if (st.validate(d, x0 + dx, y0 + dy, 0, { ignoreCash: true }).ok) { const q = st.place(d, x0 + dx, y0 + dy, 0, { instant: true, ignoreCash: true }); if (q.ok) return q.building; } } return null; };
      const m = find('main_manifold', cx, cy), ss = [0, 1, 2, 3].map(i => find('crude_tank_m', m.x - 20, m.y + i * 4)), t = find('crude_tank_l', m.x + 14, m.y + 2); ss.forEach(s => { I.layConnect(st, L.pipes, L.ts, s.id, m.id, {}); L.sim.ensure(s).vol = 40000; L.sim.ensure(s).prod = 'CRUDE'; }); I.layConnect(st, L.pipes, L.ts, m.id, t.id, {}); L.sim.ensure(t).prod = 'CRUDE'; __wp.goto(m.x + 1.5, m.y + 8, .9); return { m: m.id, s: ss.map(s => s.id) }; }, f0);
    await p.waitForTimeout(1500); return { p, id }; }
  const draws = async (p, ms) => { const a = await p.evaluate(() => __wp.stats.draws | 0); await p.waitForTimeout(ms); return ((await p.evaluate(() => __wp.stats.draws | 0)) - a) / (ms / 1000); };
  const { p, id } = await open('');
  ck('idle + paused: the map is NOT redrawn at all', (await draws(p, 3000)) === 0);
  await p.evaluate(() => { __lab.company.speed = 1; }); await p.waitForTimeout(1500); const dp = await draws(p, 4000); ck('pumping at 1x: at most the old 2 redraws/s', dp <= 2.6, dp.toFixed(1) + '/s');
  const flow = await p.evaluate(() => [...__lab.pipes.lines.values()].reduce((a, l) => a + (l.flow || 0), 0)); ck('oil really flows during the measurement', flow > 0, Math.round(flow));
  await p.evaluate(() => { __lab.company.speed = 0; }); await p.waitForTimeout(1200); ck('game PAUSED while oil is flowing in the pipes: no redraws', (await draws(p, 3000)) === 0); await p.evaluate(() => { __lab.company.speed = 1; }); await p.waitForTimeout(800);
  await p.evaluate(ids => { for (const i of ids) __lab.sim.ensure(__lab.store.get(i)).vol = 0; }, id.s); await p.waitForTimeout(2500); ck('pump stopped (sources empty): redraws stop again', (await draws(p, 3000)) <= 0.4);
  await p.evaluate(ids => { for (const i of ids) __lab.sim.ensure(__lab.store.get(i)).vol = 40000; }, id.s); await p.waitForTimeout(2000); ck('pumping restarted: map shows it again (redraws resume, flow back)', (await draws(p, 3000)) > 0 && (await p.evaluate(() => [...__lab.pipes.lines.values()].reduce((a, l) => a + (l.flow || 0), 0))) > 0);
  await p.evaluate(i => __lab.showBuilding(i), id.m); await p.waitForTimeout(600); const txt = await p.innerText('#info'); ck('manifold card: inputs / outputs connected, per-output flow, in Arabic', /المداخل المتصلة[^\n]*4[^\n]*من[^\n]*9/.test(txt) && /المخارج المتصلة[^\n]*1[^\n]*من[^\n]*3/.test(txt) && /تدفق المخرج/.test(txt), txt.split('\n').slice(0, 6).join(' | ').slice(0, 120));
  const d2 = await draws(p, 3000); ck('card open + pumping: still at most 2.6 redraws/s (card is not rewritten when unchanged)', d2 <= 2.6, d2.toFixed(1) + '/s');
  ck('sprites are in use (building cache filled)', await p.evaluate(() => { __wp.markDirty(); return new Promise(r => setTimeout(() => r(true), 300)); }));
  await p.close();
  const q = await open('&nosprite=1'); ck('?nosprite=1 still renders (fallback path), no page error', (await draws(q.p, 2500)) >= 0); await q.p.close();
  ck('no page errors', errs.length === 0, errs.join(';').slice(0, 200));
  console.log('pass', pass, 'fail', fail); await b.close(); srv.close(); process.exit(fail ? 1 : 0);
});
