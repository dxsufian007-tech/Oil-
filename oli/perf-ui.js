// Stage 5 perf: frame rate / CPU of the real game page while oil is pumped (headless Chromium, software canvas, phone viewport).
// NODE_PATH=/opt/npm-tools/node_modules node perf-ui.js [out.json] [sets]
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); }); });
function window_pan() { return !!process.env.PAN2; }
const SETS = +process.argv[3] || 8, OUT = process.argv[2];
srv.listen(0, async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 412, height: 866 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }), p = await ctx.newPage(), cdp = await ctx.newCDPSession(p); await cdp.send('Performance.enable'); const THR = +process.env.THR || 1; if (THR > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THR });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:' + srv.address().port + '/?unlock=all' + (process.env.NOSPRITE ? '&nosprite=1' : '')); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 });
  await p.evaluate(() => { localStorage.clear(); __lab.reset(); __lab.company.speed = 0; __lab.store.cash = 1e13; });
  if (process.env.ZONE) await p.evaluate(() => { window.__ZONE = 1; });
  if (process.env.PAN) await p.evaluate(() => { window.__PAN = 1; });
  const f0 = await p.evaluate(() => { const z = (__wp.world.refineryZones && __wp.world.refineryZones(__wp.world.regionIdAt(__lab.fieldSites()[0].x, __lab.fieldSites()[0].y))[0]), f = (window.__ZONE && z) ? { x: z.x + z.w / 2, y: z.y + z.h / 2 } : __lab.fieldSites()[0]; __wp.goto(f.x, f.y, 0.7); return [Math.round(f.x), Math.round(f.y)]; });
  await p.waitForFunction(([x, y]) => __lab.store.validate('crude_tank_l', x, y, 0, { ignoreCash: true }).reason !== 'notLoaded', f0, { timeout: 60000 }); await p.waitForTimeout(3000);
  const info = await p.evaluate(([sets, process_ref, process_grid]) => {
    const L = __lab, st = L.store, I = L.I, ts = L.ts; const z = (__wp.world.refineryZones && __wp.world.refineryZones(__wp.world.regionIdAt(__lab.fieldSites()[0].x, __lab.fieldSites()[0].y))[0]), f = (window.__ZONE && z) ? { x: z.x + z.w / 2, y: z.y + z.h / 2 } : L.fieldSites()[0]; const cx = Math.round(f ? f.x : 100), cy = Math.round(f ? f.y : 100);
    const find = (d, x0, y0) => { for (let r = 0; r < 70; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; if (st.validate(d, x0 + dx, y0 + dy, 0, { ignoreCash: true }).ok) { const v = st.place(d, x0 + dx, y0 + dy, 0, { instant: true, ignoreCash: true }); if (v.ok) return v.building; } } return null; };
    const out = { cx, cy, sets: 0, lines: 0, srcs: [] };
    for (let k = 0; k < sets; k++) { const a = find('crude_tank_l', cx - 14, cy + k * 12), p = a && find('pump_station_l', cx, cy + k * 12), t = p && find('crude_tank_l', cx + 14, cy + k * 12); if (!t) break; const r1 = I.layConnect(st, L.pipes, ts, a.id, p.id, {}), r2 = I.layConnect(st, L.pipes, ts, p.id, t.id, {}); if (r1.ok && r2.ok) { out.sets++; out.srcs.push(a.id); L.sim.ensure(a).vol = 250000; L.sim.ensure(a).prod = 'CRUDE'; L.sim.ensure(t).prod = 'CRUDE'; } }
    if (process_ref) { const t0 = st.get(out.srcs[0]); const rf = find('refinery_s', cx + 34, cy + 6); if (rf) { const pts = ['gasoline_tank_s', 'diesel_tank_s', 'jet_tank_s', 'gas_sphere_s'].map((d, i) => find(d, cx + 52, cy + i * 6)); const x = find('pump_station_l', cx + 22, cy); I.layConnect(st, L.pipes, ts, st.get(out.srcs[0]).id, rf.id, {}); pts.forEach(t => t && I.layConnect(st, L.pipes, ts, rf.id, t.id, {})); out.refinery = rf.id; } }
    if (process_grid) { const g = []; for (let i = 0; i < 9; i++) for (let j = 0; j < 7; j++) { const t = find('crude_tank_s', cx - 30 + i * 7, cy + 80 + j * 7); if (t) { g.push(t); L.sim.ensure(t).prod = 'CRUDE'; } } for (let i = 0; i < g.length - 1; i++) I.layConnect(st, L.pipes, ts, g[i].id, g[i + 1].id, {}); L.sim.ensure(g[0]).vol = 10000; out.srcs.push(g[0].id); out.grid = g.length; out.cy2 = cy + 80; }
    out.lines = L.pipes.lines.size; L.__cx = cx; L.__cy = cy + 6; if (process_grid) __wp.goto(cx, cy + 105, 0.55); else __wp.goto(cx, cy + sets * 6, 0.8); return out;
  }, [SETS, !!process.env.REF, !!process.env.GRID]);
  await p.waitForTimeout(1500);
  const measure = async (label, ms) => {
    const m0 = (await cdp.send('Performance.getMetrics')).metrics, g = n => m0.find(x => x.name === n).value, s0 = await p.evaluate(() => ({ d: __wp.stats.draws | 0, dm: __wp.stats.drawMs || 0, t: performance.now(), flow: [...__lab.pipes.lines.values()].reduce((a, l) => a + (l.flow || 0), 0) }));
    const raf = await p.evaluate(ms => new Promise(res => { let n = 0, t0 = performance.now(), worst = 0, last = t0; const f = t => { n++; worst = Math.max(worst, t - last); last = t; if (t - t0 < ms) requestAnimationFrame(f); else res({ n, worst, dur: t - t0 }); }; requestAnimationFrame(f); }), ms);
    const m1 = (await cdp.send('Performance.getMetrics')).metrics, g1 = n => m1.find(x => x.name === n).value, s1 = await p.evaluate(() => ({ d: __wp.stats.draws | 0, dm: __wp.stats.drawMs || 0, flow: [...__lab.pipes.lines.values()].reduce((a, l) => a + (l.flow || 0), 0) }));
    const dur = raf.dur / 1000, cpu = (g1('TaskDuration') - g('TaskDuration')) / dur * 100, script = (g1('ScriptDuration') - g('ScriptDuration')) / dur * 100;
    return { label, fps: +(raf.n / dur).toFixed(1), worstFrameMs: +raf.worst.toFixed(0), drawsPerSec: +((s1.d - s0.d) / dur).toFixed(1), avgDrawMs: +((s1.dm - s0.dm) / Math.max(1, s1.d - s0.d)).toFixed(2), mainThreadBusyPct: +cpu.toFixed(0), scriptPct: +script.toFixed(0), pipeFlow: Math.round(s1.flow) };
  };
  if (process.env.PROF) { await p.evaluate(() => { __lab.company.speed = 1; if (window.__PAN) { let a = 0; setInterval(() => { a += .15; __wp.goto(__lab.__cx + Math.cos(a) * 6, __lab.__cy + Math.sin(a) * 6, 0.8); }, 60); } }); await cdp.send('Profiler.enable'); await cdp.send('Profiler.start'); await p.waitForTimeout(6000); const { profile } = await cdp.send('Profiler.stop'); const self = new Map(), dt = profile.timeDeltas; const byId = new Map(profile.nodes.map(n => [n.id, n])); profile.samples.forEach((id, i) => { const n = byId.get(id), k = n.callFrame.functionName + ' ' + (n.callFrame.url.split('/').pop()) + ':' + n.callFrame.lineNumber; self.set(k, (self.get(k) || 0) + dt[i]); }); const tot = [...self.values()].reduce((a, b) => a + b, 0); console.log([...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, v]) => (v / tot * 100).toFixed(1) + '% ' + k).join('\n')); await b.close(); srv.close(); return; }
  if (window_pan()) await p.evaluate(() => { let a = 0; setInterval(() => { a += .12; __wp.goto(__lab.__cx + Math.cos(a) * 5, __lab.__cy + Math.sin(a) * 5, 0.8); }, 50); });
  const res = { sets: info.sets, lines: info.lines, runs: [] };
  res.runs.push(await measure('idle (nothing pumped, game paused)', 4000));
  await p.evaluate(() => { __lab.company.speed = 1; }); await p.waitForTimeout(1500);
  res.runs.push(await measure('PUMPING at 1x', 5000));
  await p.evaluate(() => { __lab.company.speed = 5; }); await p.waitForTimeout(1000);
  res.runs.push(await measure('PUMPING at 5x', 5000));
  await p.evaluate(() => { __lab.company.speed = 0; for (const id of __lab.__srcs || []) { } }); await p.evaluate(ids => { for (const id of ids) __lab.sim.ensure(__lab.store.get(id)).vol = 0; __lab.company.speed = 1; }, info.srcs); await p.waitForTimeout(2500);
  res.runs.push(await measure('pump stopped (sources empty, game running 1x)', 4000));
  // selected building (the info card is rebuilt every 480 ms)
  await p.evaluate(ids => { for (const id of ids) __lab.sim.ensure(__lab.store.get(id)).vol = 250000; __lab.company.speed = 1; __lab.showBuilding(ids[0]); __lab.state.sel = ids[0]; }, info.srcs); await p.waitForTimeout(1500);
  res.runs.push(await measure('PUMPING at 1x with a building selected', 5000));
  if (info.refinery) res.refineryIn = await p.evaluate(id => { const r = __lab.store.get(id); return { st: r.st, in: Math.round(__lab.sim.ensure(r)._in || 0), noOut: !!__lab.sim.ensure(r)._noOut }; }, info.refinery);
  res.errors = errs; console.log(JSON.stringify(res, null, 1)); if (OUT) fs.writeFileSync(OUT, JSON.stringify(res, null, 1)); await b.close(); srv.close();
});
