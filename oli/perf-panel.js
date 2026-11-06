/* OLI performance test panel — MEASUREMENT ONLY.
   Loaded only by the performance-test build (OLI_PERF=1) or by tests; the normal game never contains or loads this file.
   It reads timings, never changes game rules, economy, market or oil-flow equations.
   It builds its own test scene (in memory only: saving is switched off while it runs, so the real save is never touched). */
(function () {
  'use strict';
  if (!(window.OLI_PERF || /[?&]perf=1/.test(location.search))) return;
  const L = () => window.__lab, WP = () => window.__wp, now = () => performance.now();
  const PT = window.__perfT = { sim: 0, simN: 0, ui: 0, uiN: 0, tick: 0, tickN: 0, save: 0, saveN: 0, hud: 0, hudN: 0 };
  const BUILD = window.OLI_PERF_BUILD || 'dev';

  /* ---------------------------------------------------------------- collectors (always on, tiny) */
  const frames = { dt: [], t: [] };                 // current phase frames
  let rec = null;                                   // the phase being recorded
  const longTasks = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) longTasks.push([e.startTime, e.duration]); }).observe({ entryTypes: ['longtask'] }); } catch (_) { }
  let mutN = 0; try { new MutationObserver(m => { mutN += m.length; }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true }); } catch (_) { }
  const memOK = !!(performance && performance.memory);
  const heap = () => memOK ? performance.memory.usedJSHeapSize : 0;
  const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; };
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const r1 = x => Math.round(x * 10) / 10, r2 = x => Math.round(x * 100) / 100;

  /* wrap the economy tick (read-only timing) */
  let wrapped = false;
  function wrap() { if (wrapped || !L() || !L().company) return; wrapped = true; const C = L().company, run = C.run; C.run = function (h) { const t = now(); try { return run.call(this, h); } finally { PT.sim += now() - t; PT.simN++; } };
    const EU = L().EU; if (EU && EU.hud) { const h = EU.hud; EU.hud = function () { const t = now(); try { return h.apply(this, arguments); } finally { PT.hud += now() - t; PT.hudN++; } }; } }

  const snapT = () => { const st = WP().stats, T = st.t || {}; return { draws: st.draws | 0, drawMs: st.drawMs || 0, terrain: T.terrain || 0, decorate: T.decorate || 0, overlays: T.overlays || 0, afterOv: T.afterOv || 0, top: T.top || 0, pipes: T.pipes || 0, buildings: T.buildings || 0, dpr: WP().dpr(), dprChanges: st.dprChanges | 0, sim: PT.sim, simN: PT.simN, ui: PT.ui, uiN: PT.uiN, tick: PT.tick, tickN: PT.tickN, save: PT.save, saveN: PT.saveN, hud: PT.hud, hudN: PT.hudN, mut: mutN }; };
  const dom = () => document.getElementsByTagName('*').length;
  const counts = () => { const l = L(); let ls = 0; try { for (const k of Object.keys(localStorage)) ls += localStorage[k].length; } catch (_) { } return { dom: dom(), buildings: l.store.items.size, lines: l.pipes.lines.size, sprites: window.__perfSpr ? window.__perfSpr() : -1, tiles: WP().stats.imgs | 0, lsBytes: ls }; };

  function newPhase(id, title, speed, note) {
    return { id, title, speed, note: note || '', t0: now(), wall0: Date.now(), s0: snapT(), c0: counts(), h0: heap(), dt: [], drawMs: [], frameInfo: [], sec: [], heapS: [], lt0: longTasks.length, cause: { draw: 0, sim: 0, ui: 0, gc: 0, other: 0 }, slow: 0, slow50: 0, slow100: 0, gcN: 0, alloc: 0, hmin: Infinity, hmax: 0, lastSnap: snapT(), lastDrawN: WP().stats.draws | 0, lastHeap: heap(), lastFrameT: 0, secT: now(), secFrames: 0, secDt: [], markers: [] };
  }

  /* one rAF listener: frame time + attribution of slow frames */
  let lastRaf = 0;
  function onFrame(t) {
    requestAnimationFrame(onFrame); if (!L() || !WP()) { lastRaf = t; return; } wrap();
    const dt = lastRaf ? t - lastRaf : 0; lastRaf = t; live.push(t, dt); const p = rec; if (!p || !dt) return;
    const st = WP().stats, dn = st.draws | 0, drewMs = dn !== p.lastDrawN ? (st.lastDraw || 0) : 0; p.lastDrawN = dn;
    const simMs = PT.sim - p.lastSnap.sim, uiMs = (PT.ui - p.lastSnap.ui) + (PT.hud - p.lastSnap.hud) + (PT.save - p.lastSnap.save); p.lastSnap.sim = PT.sim; p.lastSnap.ui = PT.ui; p.lastSnap.hud = PT.hud; p.lastSnap.save = PT.save;
    const h = heap(), gc = memOK && h < p.lastHeap - 512 * 1024; if (memOK) { if (h > p.lastHeap) p.alloc += h - p.lastHeap; if (gc) p.gcN++; p.lastHeap = h; if (h < p.hmin) p.hmin = h; if (h > p.hmax) p.hmax = h; }
    p.dt.push(dt); if (drewMs) p.drawMs.push(drewMs); p.secDt.push(dt);
    if (dt > 33.4) { p.slow++; if (dt > 50) p.slow50++; if (dt > 100) p.slow100++;
      const big = Math.max(drewMs, simMs, uiMs); const share = (drewMs + simMs + uiMs) / dt;
      if (gc && big < dt * .3) p.cause.gc++; else if (share < .5) p.cause.other++; else if (big === drewMs) p.cause.draw++; else if (big === simMs) p.cause.sim++; else p.cause.ui++; }
    if (t - p.secT >= 1000) { const s = p.secDt; p.sec.push({ t: Math.round((now() - p.t0) / 1000), fps: s.length, p95: r1(pct(s, 95)), max: r1(Math.max(...s)), heapMB: r2(h / 1048576), gc: p.gcN, slow: s.filter(x => x > 33.4).length }); p.secDt = []; p.secT = t; }
  }
  const live = { a: [], push(t, dt) { this.a.push(t, dt); while (this.a.length > 600 && this.a[0] < t - 5000) { this.a.shift(); this.a.shift(); } } };
  requestAnimationFrame(onFrame);

  function finish(p) {
    const s1 = snapT(), s0 = p.s0, dur = (now() - p.t0) / 1000, n = Math.max(1, p.dt.length), dd = Math.max(1, s1.draws - s0.draws), per = k => r2((s1[k] - s0[k]) / dd);
    const lts = longTasks.slice(p.lt0), c1 = counts();
    const out = {
      id: p.id, title: p.title, speed: p.speed, note: p.note, seconds: r1(dur), frames: p.dt.length,
      fps: r1(p.dt.length / dur), frameMs: { avg: r2(avg(p.dt)), p50: r2(pct(p.dt, 50)), p95: r2(pct(p.dt, 95)), p99: r2(pct(p.dt, 99)), max: r2(Math.max(0, ...p.dt)) },
      slowFrames: { over33: p.slow, over50: p.slow50, over100: p.slow100, pctOver33: r1(p.slow / n * 100) },
      slowCause: p.cause,
      draw: { count: s1.draws - s0.draws, perSec: r1((s1.draws - s0.draws) / dur), avgMs: per('drawMs'), p95Ms: r2(pct(p.drawMs, 95)), maxMs: r2(Math.max(0, ...p.drawMs)), parts: { terrain: per('terrain'), decorate: per('decorate'), overlays: per('overlays'), afterOverlays: per('afterOv'), top: per('top'), pipes: per('pipes'), buildings: per('buildings') } },
      dpr: { start: s0.dpr, end: s1.dpr, changes: s1.dprChanges - s0.dprChanges },
      sim: { calls: s1.simN - s0.simN, avgMs: r2((s1.sim - s0.sim) / Math.max(1, s1.simN - s0.simN)), totalMsPerSec: r2((s1.sim - s0.sim) / dur) },
      ui: { tickMsPerSec: r2((s1.tick - s0.tick) / dur), cardAndSigMsPerSec: r2((s1.ui - s0.ui) / dur), hudMsPerSec: r2((s1.hud - s0.hud) / dur), saveMsPerSec: r2((s1.save - s0.save) / dur), saves: s1.saveN - s0.saveN, domMutationsPerSec: r1((s1.mut - s0.mut) / dur) },
      longTasks: { count: lts.length, totalMs: Math.round(lts.reduce((a, x) => a + x[1], 0)), maxMs: Math.round(Math.max(0, ...lts.map(x => x[1]))) },
      memory: memOK ? { startMB: r2(p.h0 / 1048576), endMB: r2(heap() / 1048576), minMB: r2(p.hmin / 1048576), maxMB: r2(p.hmax / 1048576), gcEvents: p.gcN, gcPerMin: r1(p.gcN / dur * 60), allocMBperSec: r2(p.alloc / dur / 1048576) } : { unavailable: true },
      counts: { start: p.c0, end: c1 },
      firstBadSecond: (p.sec.find(x => x.p95 > 33.4) || {}).t == null ? null : (p.sec.find(x => x.p95 > 33.4)).t,
      timeline: p.sec, markers: p.markers
    };
    const g = []; if (out.frameMs.p95 > 33.3) g.push('P95>33ms'); if (out.frameMs.p99 > 50) g.push('P99>50ms'); if (out.fps < 30) g.push('FPS<30'); out.verdict = g.length ? 'ضعيف: ' + g.join(' ، ') : (out.frameMs.p95 <= 16.7 * 1.2 ? 'ممتاز (قرب 60)' : 'مقبول (≥30 مستقر)');
    return out;
  }

  /* ---------------------------------------------------------------- the test scene (in memory only) */
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const SC = { chains: [], central: null, tanks: [], wells: 0, built: false };
  async function buildScene(log, opts) {
    opts = opts || {}; const PAIRS = opts.pairs || 70, CHAINS = opts.chains || 4;
    const lab = L(), wp = WP(); window.__noSave = true;                                  // nothing of this test is ever written to the save
    lab.reset(); lab.company.setSpeed(0); lab.store.cash = 1e14; lab.updateCash && lab.updateCash();
    const f = lab.fieldSites()[0]; wp.goto(f.x, f.y, .6); log('جارٍ تجهيز الخريطة…');
    for (let i = 0; i < 120; i++) { await sleep(500); if (lab.store.validate('crude_tank_l', Math.round(f.x), Math.round(f.y), 0, { ignoreCash: true }).reason !== 'notLoaded' && wp.idle()) break; }
    const st = lab.store, I = lab.I, cx = Math.round(f.x), cy = Math.round(f.y);
    const ok = (d, x, y) => st.validate(d, x, y, 0, { ignoreCash: true }).ok, put = (d, x, y) => { if (!ok(d, x, y)) return null; const q = st.place(d, x, y, 0, { instant: true, ignoreCash: true }); return q.ok ? q.building : null; };
    // scan a square spiral of origins around the field; a "pattern" is a list of [def, dx, dy] that must all be valid together
    const origins = []; for (let r = 0; r <= (opts.radius || 120); r += 2) for (let a = 0; a < Math.max(1, r * 2); a++) { const an = a / Math.max(1, r * 2) * Math.PI * 2; origins.push([cx + Math.round(Math.cos(an) * r), cy + Math.round(Math.sin(an) * r * .7)]); }
    const placePattern = (pat) => { for (const [ox, oy] of origins) { if (pat.every(([d, dx, dy]) => ok(d, ox + dx, oy + dy))) { const out = []; for (const [d, dx, dy] of pat) { const b = put(d, ox + dx, oy + dy); if (!b) { out.forEach(q => st.remove && st.remove(q.id)); return null; } out.push(b); } return out; } } return null; };
    // 1) wells (best effort, around the field), each with a small collecting tank
    let wells = 0; for (let k = 0; k < 60 && wells < 20; k++) { const w = put('oil_well', Math.round(f.x + (k % 8) - 4), Math.round(f.y + Math.floor(k / 8) - 3)); if (w) { wells++; const tk = placePattern([['crude_tank_s', 0, 0]]); } } SC.wells = wells; log('آبار: ' + wells);
    // 2) one central pump 200,000: central store -> central pump -> 3 big tanks
    const cp = placePattern([['crude_tank_c', 0, 0], ['pump_station_c', 12, 2], ['crude_tank_l', 22, -6], ['crude_tank_l', 22, 0], ['crude_tank_l', 22, 6]]);
    if (cp) { I.layConnect(st, lab.pipes, lab.ts, cp[0].id, cp[1].id, {}); for (const d of cp.slice(2)) I.layConnect(st, lab.pipes, lab.ts, cp[1].id, d.id, {}); SC.central = { src: cp[0], pump: cp[1], dst: cp.slice(2) }; }
    // 2) many small tanks in connected pairs (the big passive network)
    let pairs = 0, lines = 0; for (let k = 0; k < PAIRS; k++) { const pr = placePattern([['crude_tank_s', 0, 0], ['crude_tank_s', 4, 0]]); if (!pr) break; const r = I.layConnect(st, lab.pipes, lab.ts, pr[0].id, pr[1].id, {}); if (r.ok) lines += r.lines.length; SC.tanks.push(pr[0], pr[1]); pairs++; if (k % 10 === 9) await sleep(0); } log('أزواج خزانات: ' + pairs);
    // 3) regular pump chains: big tank -> pump -> big tank
    for (let k = 0; k < CHAINS; k++) { const pr = placePattern([['crude_tank_l', 0, 0], ['pump_station_l', 14, 2], ['crude_tank_l', 28, 0]]); if (!pr) break; I.layConnect(st, lab.pipes, lab.ts, pr[0].id, pr[1].id, {}); I.layConnect(st, lab.pipes, lab.ts, pr[1].id, pr[2].id, {}); SC.chains.push({ src: pr[0], pump: pr[1], dst: pr[2] }); }
    for (const b of st.list()) { const s = lab.sim.ensure(b); if (/tank/.test(b.d)) s.prod = 'CRUDE'; }
    { const ps = SC.chains.map(c => c.pump).concat(SC.central ? [SC.central.pump] : []); SC.cam = ps.length ? { x: avg(ps.map(b => b.x)), y: avg(ps.map(b => b.y)) } : { x: cx, y: cy }; }
    SC.built = true; SC.info = { buildings: st.list().length, lines: lab.pipes.lines.size, tanks: st.list().filter(b => /tank/.test(b.d)).length, pumps: SC.chains.length + (SC.central ? 1 : 0), centralPump: !!SC.central, wells };
    wp.markDirty(); log('جاهز: ' + JSON.stringify(SC.info)); return SC.info;
  }
  const capOf = b => { const d = L().B.DEFS[b.d], c = d && d.capacity; return (c && (c.value || c)) || 250000; };
  function feed(which) {                                               // keep sources full and destinations empty so a pump never stops because of the test itself
    const lab = L(), sim = lab.sim, fill = (b, v) => { const s = sim.ensure(b); s.prod = 'CRUDE'; s.vol = v; }, drain = b => { const s = sim.ensure(b); if (s.vol > capOf(b) * .6) s.vol = 0; };
    SC.chains.forEach((c, i) => { drain(c.dst); if (which === 'none') fill(c.src, 0); else if (which === 'one') fill(c.src, i === 0 ? capOf(c.src) * .9 : 0); else fill(c.src, capOf(c.src) * .9); });
    if (SC.central) { SC.central.dst.forEach(drain); fill(SC.central.src, which === 'multi' ? 3.9e6 : 0); }
  }

  /* ---------------------------------------------------------------- scenario */
  const FULL = [
    { id: 'A', title: 'بدون ضخ ×1', speed: 1, feed: 'none', sec: 90 },
    { id: 'B', title: 'مضخة واحدة ×1', speed: 1, feed: 'one', sec: 90 },
    { id: 'C', title: 'عدة مضخات + مركزية 200k ×1', speed: 1, feed: 'multi', sec: 120 },
    { id: 'D', title: 'عدة مضخات ×5', speed: 5, feed: 'multi', sec: 120 },
    { id: 'E', title: 'عدة مضخات ×10', speed: 10, feed: 'multi', sec: 120 },
    { id: 'F', title: 'تحريك+تقريب أثناء الضخ ×1', speed: 1, feed: 'multi', sec: 120, cam: true },
    { id: 'G', title: 'تحريك+تقريب أثناء الضخ ×10', speed: 10, feed: 'multi', sec: 120, cam: true },
    { id: 'H', title: 'تشغيل طويل ×5 (كشف تسرب الذاكرة)', speed: 5, feed: 'multi', sec: 600, soak: true },
    { id: 'I', title: 'إعادة C في النهاية (أثر الحرارة)', speed: 1, feed: 'multi', sec: 90 }
  ];
  const run = { active: false, stop: false, results: [], phase: null, endAt: 0, name: '', note: '', temp0: '', temp1: '' };
  const camState = { on: false, t0: 0, cx: 0, cy: 0 };
  function camStep(t) { if (!camState.on) return; requestAnimationFrame(camStep); const k = (t - camState.t0) / 1000, z = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(k / 20 * Math.PI * 2)); WP().goto(camState.cx + Math.cos(k / 9) * 28, camState.cy + Math.sin(k / 13) * 18, z); }
  async function runScenario(mode, ui) {
    if (run.active) return; run.active = true; run.stop = false; run.results = []; const scale = mode === 'quick' ? 0.08 : 1; let wake = null; try { wake = await navigator.wakeLock.request('screen'); } catch (_) { }
    try {
      ui.say('تجهيز مشهد الاختبار…'); await buildScene(ui.say); if (!SC.built || !SC.chains.length) { ui.say('⚠ تعذّر تجهيز مضخات (الأرض)'); }
      camState.cx = SC.cam ? SC.cam.x : L().fieldSites()[0].x; camState.cy = SC.cam ? SC.cam.y : L().fieldSites()[0].y;
      L().company.setSpeed(1); feed('multi'); ui.say('إحماء 20 ثانية…'); await sleep(Math.max(3000, 20000 * scale));
      const list = FULL.filter(p => mode !== 'quick' || true);
      for (const ph of list) {
        if (run.stop) break; const secs = Math.max(6, Math.round(ph.sec * scale)); L().company.setSpeed(ph.speed); feed(ph.feed); WP().goto(camState.cx, camState.cy, .6); await sleep(1500);
        const p = rec = newPhase(ph.id, ph.title, ph.speed); run.phase = ph; run.endAt = now() + secs * 1000; if (ph.cam) { camState.on = true; camState.t0 = now(); requestAnimationFrame(camStep); }
        let lastFeed = now(); while (now() < run.endAt && !run.stop) { await sleep(250); if (now() - lastFeed > 15000) { feed(ph.feed); lastFeed = now(); } }
        camState.on = false; rec = null; const res = finish(p); run.results.push(res); saveLocal(); ui.say('انتهت ' + ph.id + ': ' + res.fps + ' fps · P95 ' + res.frameMs.p95 + 'ms'); await sleep(800);
      }
    } catch (e) { ui.say('⚠ خطأ: ' + (e && e.message || e)); run.error = String(e && e.stack || e); }
    camState.on = false; rec = null; run.active = false; run.phase = null; try { wake && wake.release(); } catch (_) { } L().company.setSpeed(0); ui.say(run.stop ? 'أُوقف السيناريو' : '✔ انتهى السيناريو — اضغط «تصدير»'); ui.done && ui.done();
  }

  /* ---------------------------------------------------------------- memory trend (leak check) over a phase's timeline */
  function leak(res) {
    const t = res.timeline.filter(x => x.heapMB > 0); if (t.length < 60) return { verdict: 'قصير جداً للحكم (أقل من دقيقة)', slopeMBperMin: null };
    // heap is a saw-tooth (GC): follow the LOW points of each 20-second window, a leak raises them steadily
    const W = 20, lows = []; for (let i = 0; i + W <= t.length; i += W) lows.push([t[i].t, Math.min(...t.slice(i, i + W).map(x => x.heapMB))]);
    if (lows.length < 4) return { verdict: 'قصير جداً للحكم (أقل من 80 ثانية)', slopeMBperMin: null };
    const n = lows.length, mx = avg(lows.map(x => x[0])), my = avg(lows.map(x => x[1])); let sxy = 0, sxx = 0, syy = 0; for (const [x, y] of lows) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
    const slope = sxx ? sxy / sxx * 60 : 0, r2v = sxx && syy ? (sxy * sxy) / (sxx * syy) : 0, span = lows[n - 1][0] - lows[0][0];
    const verdict = span < 240 ? 'مدة قصيرة (<4 دقائق) — مؤشر فقط' : (slope > 0.5 && r2v > .6 ? '⚠ ارتفاع مستمر مشتبه به (تسرب محتمل)' : 'لا يوجد ارتفاع مستمر (مستقر)');
    return { slopeMBperMin: r2(slope), fitR2: r2(r2v), lowPointsMB: lows.map(x => r2(x[1])), spanSeconds: span, verdict };
  }

  /* ---------------------------------------------------------------- report + export */
  function report() {
    const dev = { userAgent: navigator.userAgent, cores: navigator.hardwareConcurrency, deviceMemoryGB: navigator.deviceMemory, screen: screen.width + 'x' + screen.height, dpr: devicePixelRatio, viewport: innerWidth + 'x' + innerHeight, heapLimitMB: memOK ? r1(performance.memory.jsHeapSizeLimit / 1048576) : null, memoryApi: memOK };
    const results = run.results.map(r => Object.assign({}, r, { leakCheck: r.id === 'H' || r.seconds > 200 ? leak(r) : undefined }));
    const rows = results.map(r => [r.id, r.title, 'x' + r.speed, r.fps, r.frameMs.p95, r.frameMs.p99, r.frameMs.max, r.slowFrames.pctOver33 + '%', r.draw.perSec, r.draw.avgMs, r.sim.totalMsPerSec, r.memory.endMB, r.memory.gcPerMin, r.verdict]);
    const sceneInfo = SC.info || null;
    return { app: 'OLI performance test', build: BUILD, when: new Date().toISOString(), device: dev, scene: sceneInfo, player: run.name, notes: run.note, temperature: { startC: run.temp0, endC: run.temp1 }, results, markers: marks, error: run.error || null, summaryTable: rows };
  }
  function textSummary(rep) {
    const o = ['OLI performance test — ' + rep.when, 'build ' + rep.build, 'device: ' + rep.device.userAgent, 'cores ' + rep.device.cores + ' · RAM ' + rep.device.deviceMemoryGB + 'GB · screen ' + rep.device.screen + ' dpr ' + rep.device.dpr + ' · heap limit ' + rep.device.heapLimitMB + 'MB', 'scene ' + JSON.stringify(rep.scene), 'temp start/end: ' + rep.temperature.startC + ' / ' + rep.temperature.endC, ''];
    o.push('id | scenario | speed | FPS | P95 ms | P99 ms | max ms | >33ms | draws/s | draw ms | sim ms/s | heap MB | GC/min | verdict');
    for (const r of rep.summaryTable) o.push(r.join(' | '));
    o.push(''); for (const r of rep.results) { o.push('[' + r.id + '] ' + r.title + ': slow-cause draw ' + r.slowCause.draw + ' · sim ' + r.slowCause.sim + ' · ui ' + r.slowCause.ui + ' · gc ' + r.slowCause.gc + ' · other(GPU/compositor/OS) ' + r.slowCause.other + ' · first bad second ' + r.firstBadSecond + ' · dpr ' + r.dpr.start + '→' + r.dpr.end + ' · longtasks ' + r.longTasks.count + ' (max ' + r.longTasks.maxMs + 'ms) · draw parts ' + JSON.stringify(r.draw.parts) + (r.leakCheck ? ' · LEAK: ' + r.leakCheck.verdict + ' slope ' + r.leakCheck.slopeMBperMin + ' MB/min' : '')); }
    if (rep.markers.length) { o.push('', 'markers:'); rep.markers.forEach(m => o.push(JSON.stringify(m))); }
    return o.join('\n');
  }
  function saveLocal() { try { localStorage.setItem('oli-perf-last', JSON.stringify(report())); } catch (_) { } }
  async function exportFiles(ui) {
    const rep = report(), stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19), jn = 'oli-perf-' + stamp + '.json', tn = 'oli-perf-' + stamp + '.txt', js = JSON.stringify(rep, null, 1), tx = textSummary(rep);
    window.__perfLast = { json: js, text: tx, name: jn };
    const C = window.Capacitor, plug = n => { try { return (C && C.Plugins && C.Plugins[n]) || (C && C.registerPlugin && C.registerPlugin(n)); } catch (_) { return null; } }, cap = C ? { Filesystem: plug('Filesystem'), Share: plug('Share') } : null; let how = '';
    try {
      if (cap && cap.Filesystem && cap.Share && C.isNativePlatform && C.isNativePlatform()) {
        const fs = cap.Filesystem, uris = []; for (const [n, d] of [[jn, js], [tn, tx]]) { const w = await fs.writeFile({ path: n, data: d, directory: 'CACHE', encoding: 'utf8' }); uris.push(w.uri); }
        await cap.Share.share({ title: 'OLI performance results', text: 'نتائج قياس الأداء', files: uris, dialogTitle: 'إرسال النتائج' }); how = 'share';
      } else if (navigator.canShare && navigator.share) {
        const files = [new File([js], jn, { type: 'application/json' }), new File([tx], tn, { type: 'text/plain' })]; if (navigator.canShare({ files })) { await navigator.share({ files, title: 'OLI performance results' }); how = 'share'; }
      }
    } catch (e) { how = ''; ui.say('تعذّرت المشاركة: ' + (e && e.message || e)); }
    if (!how) { try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([js], { type: 'application/json' })); a.download = jn; document.body.appendChild(a); a.click(); a.remove(); how = 'download'; } catch (_) { } }
    try { await navigator.clipboard.writeText(tx); how += ' + clipboard'; } catch (_) { }
    ui.text(tx); ui.say('تم التصدير (' + how + '). الملف: ' + jn); return how;
  }

  /* ---------------------------------------------------------------- the panel (hidden button; nothing for normal players) */
  const marks = [];
  function mount() {
    const css = document.createElement('style'); css.textContent = '#pf-btn{position:fixed;left:6px;bottom:84px;z-index:100000;background:#6a2a8a;color:#fff;border:1px solid #c9a0e0;border-radius:18px;padding:6px 10px;font:700 12px sans-serif;opacity:.85}#pf{position:fixed;left:0;right:0;bottom:0;max-height:78vh;overflow:auto;z-index:100001;background:rgba(14,18,26,.97);color:#e8eef5;font:13px/1.45 sans-serif;direction:rtl;padding:10px 12px;border-top:2px solid #6a2a8a;display:none}#pf button{min-height:40px;margin:3px;padding:0 10px;border-radius:8px;border:1px solid #556;background:#223;color:#fff;font:700 13px sans-serif}#pf .g{background:#1f6a3a}#pf .r{background:#7a2a2a}#pf input{width:70px;min-height:34px;border-radius:6px;border:1px solid #556;background:#111;color:#fff;padding:0 6px}#pf pre{white-space:pre-wrap;direction:ltr;text-align:left;font-size:10.5px;background:#0a0d12;padding:6px;border-radius:6px;max-height:30vh;overflow:auto;user-select:text}';
    document.head.appendChild(css);
    const btn = document.createElement('button'); btn.id = 'pf-btn'; btn.textContent = 'PERF'; document.body.appendChild(btn);
    const box = document.createElement('div'); box.id = 'pf'; box.innerHTML = '<div id="pf-live" style="font-weight:700;direction:ltr;text-align:left"></div><div id="pf-say" style="margin:4px 0;color:#9fd">جاهز</div><div id="pf-ph" style="color:#fc6"></div>'
      + '<div><button class="g" id="pf-full">▶ السيناريو الكامل (~24 دقيقة)</button><button id="pf-quick">⚡ اختبار سريع (~3 دقائق)</button><button class="r" id="pf-stop">■ إيقاف</button></div>'
      + '<div><button id="pf-mark">📍 علّم تقطيعاً الآن</button><button id="pf-man">⏺ تسجيل يدوي</button><button class="g" id="pf-exp">⬆ تصدير النتائج</button><button id="pf-close">إغلاق</button></div>'
      + '<div>حرارة الهاتف °C — بداية <input id="pf-t0" inputmode="decimal"> نهاية <input id="pf-t1" inputmode="decimal"> ملاحظة <input id="pf-nt" style="width:120px"></div><pre id="pf-txt"></pre>';
    document.body.appendChild(box); const $ = id => document.getElementById(id);
    const ui = { say: t => { $('pf-say').textContent = t; }, text: t => { $('pf-txt').textContent = t; }, done: () => { upd(); } };
    btn.onclick = () => { box.style.display = box.style.display === 'block' ? 'none' : 'block'; upd(); };
    $('pf-close').onclick = () => { box.style.display = 'none'; };
    $('pf-full').onclick = () => { run.temp0 = $('pf-t0').value; runScenario('full', ui); };
    $('pf-quick').onclick = () => { run.temp0 = $('pf-t0').value; runScenario('quick', ui); };
    $('pf-stop').onclick = () => { run.stop = true; };
    $('pf-mark').onclick = () => { const m = { atSec: rec ? Math.round((now() - rec.t0) / 1000) : null, phase: run.phase ? run.phase.id : 'free', when: new Date().toISOString(), fps: curFps(), heapMB: r1(heap() / 1048576), x: L() ? WP().cam.x : 0, z: L() ? r2(WP().cam.z) : 0 }; marks.push(m); if (rec) rec.markers.push(m); ui.say('📍 سُجّلت علامة #' + marks.length); };
    let man = null; $('pf-man').onclick = () => { if (run.active) return; if (!man) { man = rec = newPhase('M' + (run.results.length + 1), 'تسجيل يدوي', L().company.speed, ''); $('pf-man').textContent = '⏹ إنهاء التسجيل اليدوي'; ui.say('يسجّل… العب كما تريد'); } else { const r = finish(man); r.speed = L().company.speed; run.results.push(r); rec = null; man = null; $('pf-man').textContent = '⏺ تسجيل يدوي'; ui.say('حُفظ تسجيل يدوي ' + r.fps + ' fps'); } };
    $('pf-exp').onclick = () => { run.temp1 = $('pf-t1').value; run.note = $('pf-nt').value; exportFiles(ui); };
    const curFps = () => { const a = live.a; if (a.length < 4) return 0; const n = a.length / 2; return r1(n / ((a[a.length - 2] - a[0]) / 1000 || 1)); };
    const liveDt = () => { const d = []; for (let i = 1; i < live.a.length; i += 2) d.push(live.a[i]); return d; };
    function upd() { if (box.style.display !== 'block') return; const d = liveDt(); $('pf-live').textContent = 'FPS ' + curFps() + ' · P95 ' + r1(pct(d, 95)) + 'ms · P99 ' + r1(pct(d, 99)) + 'ms · heap ' + (memOK ? r1(heap() / 1048576) + 'MB' : 'n/a') + ' · dpr ' + r2(WP().dpr()) + ' · ×' + (L().company.speed || 0);
      $('pf-ph').textContent = run.active && run.phase ? 'المرحلة ' + run.phase.id + ': ' + run.phase.title + ' — متبقٍ ' + Math.max(0, Math.round((run.endAt - now()) / 1000)) + ' ث' : ''; }
    setInterval(upd, 1000);
  }
  const boot = setInterval(() => { if (document.body && window.__lab && window.__wp && window.__lab.restored) { clearInterval(boot); mount(); } }, 300);
  window.__perf = { runScenario, report, textSummary, exportFiles, leak, buildScene, SC, run, FULL, finish, newPhase, setRec: p => { rec = p; }, feed };
})();
