/* In-app bench (separate test app, never the game): engine only, the real save is chosen by the user with a file picker and kept in THIS app's storage only.
   Every job runs in a FRESH page load (clean JS heap): perf jobs (S6 on / S6 off / original, interleaved) then paced jobs (X1/X2/X5 at the game's 250 ms tick). Nothing of the game or its save is touched. */
(function () {
  const LS = localStorage, out = document.getElementById('out'), ctl = document.getElementById('ctl'), log = s => { out.textContent += s + '\n'; try { console.log('OLIBENCH ' + s); } catch (e) {} };
  const CFG = { on: { hopShare: 1, pcSparse: 1, trDefault: 0, rcvSkip: 1, hopFreezeSkip: 1, fts: 1 }, off: { hopShare: 1, pcSparse: 1, trDefault: 0, rcvSkip: 1, hopFreezeSkip: 1, fts: 0 }, orig: { hopShare: 0, pcSparse: 0, trDefault: 0, rcvSkip: 0, hopFreezeSkip: 0, fts: 0 } };
  const NAME = { on: 'S6 fullTankSkip=1', off: 'S6 fullTankSkip=0', orig: 'original engine' };
  const HRS = 40, REPS = 3, PACE_MS = 15000, TICK = 250, SPEEDS = [1, 2, 5];
  const heap = () => performance.memory ? performance.memory.usedJSHeapSize / 1048576 : NaN, sleep = ms => new Promise(r => setTimeout(r, ms));
  const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }, mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const jget = (k, d) => { try { return JSON.parse(LS.getItem(k)) || d; } catch (e) { return d; } };
  function plan() { const j = []; for (let r = 1; r <= REPS; r++) for (const c of ['on', 'off', 'orig']) j.push({ t: 'perf', c, r }); for (const c of ['on', 'off', 'orig']) for (const x of SPEEDS) j.push({ t: 'pace', c, x }); return j; }
  function boot(cfg, saveTxt) {
    const B = OliBuildings, I = OliIndustry, E = OliEconomy, C = OliCentral, world = OliWorld.createWorld({ seed: 20260101 }), CN = C.CentralNet; for (const k in cfg) if (k !== 'fts') CN[k] = cfg[k]; I.Sim.fullTankSkip = cfg.fts;
    const d = JSON.parse(saveTxt), ts = B.fromWorld(world); if (d.wd) { world.restoreProgress(d.wd.p); world.restoreReserve(d.wd.r); world.restoreZones(d.wd.z); }
    const store = B.BuildingStore.fromJSON(ts, d.store, { cash: d.cash }).store; store.cash = 1e15; const net = I.PipeNet.fromJSON(ts.W, d.net), sim = new I.Sim(store, net), co = new E.Company(store, net, sim, { now: () => 1e12 }); co.fromJSON(d.eco); co.sync(); co.speed = 0;
    return { store, co };
  }
  const devInfo = () => ({ ua: navigator.userAgent, cores: navigator.hardwareConcurrency, devMem: navigator.deviceMemory, heapApi: !!performance.memory, heapLimitMB: performance.memory ? Math.round(performance.memory.jsHeapSizeLimit / 1048576) : null });
  async function job(J) {
    let saveTxt = LS.getItem('oliBenchSave'); const heapLoad = heap(); await sleep(600); const g = boot(CFG[J.c], saveTxt); saveTxt = null; const n = g.store.list().length;
    for (let h = 0; h < 6; h++) g.co.advanceHours(1); await sleep(200); const heapBoot = heap(), res = { j: J, n, heapLoad, heapBoot };
    if (J.t === 'perf') {
      const ts = [], hs = []; let drops = 0, freed = 0, prev = heapBoot;
      for (let h = 0; h < HRS; h++) { const a = performance.now(); g.co.advanceHours(1); ts.push(performance.now() - a); const hp = heap(); hs.push(hp); if (hp < prev - 0.5) { drops++; freed += prev - hp; } prev = hp; }
      res.ts = ts; res.heapEnd = heap(); res.heapMax = Math.max(...hs); res.drops = drops; res.freed = freed;
    } else {
      const tick = [], late = []; let acc = 0, hours = 0, last = performance.now(); const t0 = last, hs = [];
      await new Promise(done => { const iv = setInterval(() => { const now = performance.now(); late.push(Math.max(0, now - last - TICK)); last = now; acc += J.x * TICK / 1000; let c = 0; const a = performance.now(); while (acc >= 1) { g.co.advanceHours(1); acc -= 1; c++; hours++; } const d = performance.now() - a; if (c) tick.push(d); hs.push(heap()); if (now - t0 >= PACE_MS) { clearInterval(iv); done(); } }, TICK); });
      res.hours = hours; res.expected = J.x * PACE_MS / 1000; res.tick = tick; res.late = late; res.heapEnd = heap(); res.heapMax = Math.max(...hs); let dr = 0; for (let i = 1; i < hs.length; i++) if (hs[i] < hs[i - 1] - 0.5) dr++; res.drops = dr;
    }
    return res;
  }
  function summary(S) {
    const f1 = v => v.toFixed(1), lines = []; lines.push('buildings: ' + S.res[0].n + '   device: ' + JSON.stringify(S.dev)); lines.push('');
    lines.push('== PERF: ms per game hour (' + HRS + ' h x ' + REPS + ' reps, 6 warm-up dropped, fresh page per run, interleaved)');
    const P = {}; for (const c of ['on', 'off', 'orig']) { const R = S.res.filter(r => r.j.t === 'perf' && r.j.c === c); if (!R.length) continue; const all = [].concat(...R.map(r => r.ts)), med = R.map(r => q(r.ts, .5)); P[c] = q(med, .5);
      lines.push(NAME[c] + ': median ' + f1(P[c]) + ' | mean ' + f1(mean(all)) + ' | p95 ' + f1(q(all, .95)) + ' | BEST ' + f1(Math.min(...all)) + ' | WORST ' + f1(Math.max(...all)) + ' | per-rep medians ' + med.map(f1).join(' '));
      lines.push('   engine heap MB: page-load ' + f1(q(R.map(r => r.heapLoad), .5)) + ' -> after boot ' + f1(q(R.map(r => r.heapBoot), .5)) + ' (engine ~' + f1(q(R.map(r => r.heapBoot - r.heapLoad), .5)) + ') -> end ' + f1(q(R.map(r => r.heapEnd), .5)) + ' | peak ' + f1(Math.max(...R.map(r => r.heapMax))) + ' | GC-like heap drops/run ' + f1(mean(R.map(r => r.drops))) + ', freed MB/run ' + f1(mean(R.map(r => r.freed)))); }
    if (P.on && P.off && P.orig) lines.push('S6 on vs off ' + f1(100 * (P.on / P.off - 1)) + '%   S6 on vs original ' + f1(100 * (P.on / P.orig - 1)) + '%');
    lines.push(''); lines.push('== PACED at the game tick (' + TICK + ' ms), ' + PACE_MS / 1000 + ' s per speed: tick cost = time to simulate the hours due (only ticks that had an hour due are counted; busy % is over the whole run); late = timer lateness (jank proxy)');
    for (const x of SPEEDS) for (const c of ['on', 'off', 'orig']) { const r = S.res.find(r => r.j.t === 'pace' && r.j.c === c && r.j.x === x); if (!r) continue; lines.push('X' + x + ' ' + NAME[c] + ': hours ' + r.hours + '/' + r.expected + ' | tick mean ' + f1(mean(r.tick)) + ' max ' + f1(Math.max(...r.tick)) + ' ms | CPU busy ' + f1(100 * r.tick.reduce((a, b) => a + b, 0) / PACE_MS) + '% of the time | timer late mean ' + f1(mean(r.late)) + ' max ' + f1(Math.max(...r.late)) + ' | heap end ' + f1(r.heapEnd) + ' peak ' + f1(r.heapMax) + ' drops ' + r.drops); }
    lines.push(''); lines.push('GC TIME is not exposed to a page: only heap drops (GC-like) are counted. Same engine code and WebView as the game; no rendering/UI load is included.');
    return lines.join('\n');
  }
  async function main() {
    out.textContent = ''; const S = jget('oliBenchState', null);
    if (!LS.getItem('oliBenchSave') || !S) {
      ctl.innerHTML = '<div>1) choose realsave.json (kept only in this test app, never written back)</div><input type="file" id="f" accept=".json,application/json,*/*"><div id="st"></div>';
      document.getElementById('f').onchange = async e => { const f = e.target.files[0]; if (!f) return; const t = await f.text(); try { const d = JSON.parse(t); if (!d.store || !d.net) throw new Error('not an OLI save'); LS.setItem('oliBenchSave', t); document.getElementById('st').textContent = 'save loaded: ' + Math.round(t.length / 1024) + ' KB'; ctl.innerHTML += '<button id="go">2) START (about 8 min, keep the screen on, charger plugged)</button>'; document.getElementById('go').onclick = () => { LS.setItem('oliBenchState', JSON.stringify({ jobs: plan(), i: 0, res: [], dev: devInfo() })); location.reload(); }; } catch (err) { document.getElementById('st').textContent = 'ERROR: ' + err.message; } };
      if (LS.getItem('oliBenchSave') && !S) { document.getElementById('st').textContent = 'a save is already stored'; ctl.innerHTML += '<button id="go">START</button>'; document.getElementById('go').onclick = () => { LS.setItem('oliBenchState', JSON.stringify({ jobs: plan(), i: 0, res: [], dev: devInfo() })); location.reload(); }; }
      out.textContent = 'ready'; return;
    }
    if (S.i >= S.jobs.length) { const txt = summary(S); out.textContent = txt; ctl.innerHTML = '<button id="again">run again</button><button id="clr">forget saved save + results</button>'; document.getElementById('again').onclick = () => { LS.removeItem('oliBenchState'); location.reload(); }; document.getElementById('clr').onclick = () => { LS.removeItem('oliBenchState'); LS.removeItem('oliBenchSave'); location.reload(); }; return; }
    const J = S.jobs[S.i]; out.textContent = 'job ' + (S.i + 1) + '/' + S.jobs.length + ': ' + JSON.stringify(J) + '  — keep the screen on, do not switch apps';
    const r = await job(J); S.res.push(r); S.i++; LS.setItem('oliBenchState', JSON.stringify(S)); setTimeout(() => location.reload(), 300);
  }
  main().catch(e => { out.textContent += '\nERROR ' + e + '\n' + (e.stack || ''); });
})();
