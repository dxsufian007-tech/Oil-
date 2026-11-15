/* OLI device benchmark — MEASUREMENT ONLY (experiment branch, never part of the game build).
   Loaded only by the benchmark APK builds (OLI_BENCH=1). It never changes game rules, economy or equations:
   it imports a save into the benchmark app's own storage, sets the game speed, and records frames / hours / backlog / simulation cost.
   Same code and same steps for the original build and the experimental build, so the two phones' results are comparable. */
(function () {
  'use strict';
  if (!window.OLI_BENCH) return;
  const KEY = 'oli-lab-v2', L = () => window.__lab, now = () => performance.now(), BUILD = window.OLI_BENCH_BUILD || 'bench';
  const q = (a, x) => { if (!a.length) return 0; const s = Array.from(a).sort((u, v) => u - v); return +(s[Math.min(s.length - 1, Math.floor(s.length * x))]).toFixed(1); };
  const st = { stop: false, active: false, res: {}, log: [] };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function chunk(speed, secs, say) {
    const co = L().company, D = window.__diag || {}, m = { f: [], acc: [], lt: [], heap: [] };
    const d0 = Object.assign({}, D), h0 = co.hours, t0 = now(); let last = t0, alive = true;
    let po = null; try { po = new PerformanceObserver(l => { for (const e of l.getEntries()) m.lt.push(e.duration); }); po.observe({ entryTypes: ['longtask'] }); } catch (_) { }
    const loop = t => { m.f.push(t - last); last = t; if (alive) requestAnimationFrame(loop); }; requestAnimationFrame(loop);
    co.setSpeed(speed);
    await new Promise(res => { const iv = setInterval(() => { const el = (now() - t0) / 1000; m.acc.push(co.acc || 0); if (performance.memory) m.heap.push(performance.memory.usedJSHeapSize);
      say('×' + speed + ' · ' + Math.round(el) + '/' + secs + ' ث · ساعات ' + (co.hours - h0) + ' · تراكم ' + (co.acc || 0).toFixed(1)); if (el >= secs || st.stop) { clearInterval(iv); res(); } }, 500); });
    const el = (now() - t0) / 1000; alive = false; co.setSpeed(0); if (po) po.disconnect(); await sleep(400);
    const d1 = Object.assign({}, D);
    return { el, req: el * 2 * speed, done: co.hours - h0, frames: m.f.slice(2), acc: m.acc, lt: m.lt, heapMax: m.heap.length ? Math.max.apply(null, m.heap) : 0, runMs: (d1.runMs || 0) - (d0.runMs || 0), slices: (d1.slices || 0) - (d0.slices || 0), maxRun: d1.maxRun || 0 };
  }

  function summarize() {
    const out = {};
    for (const sp of Object.keys(st.res)) {
      const cs = st.res[sp]; let el = 0, req = 0, done = 0, runMs = 0, bmax = 0, bend = 0, lt = 0, ltMax = 0, heap = 0; const fr = [];
      for (const c of cs) { el += c.el; req += c.req; done += c.done; runMs += c.runMs; bmax = Math.max(bmax, ...c.acc, 0); bend = c.acc.length ? c.acc[c.acc.length - 1] : bend; lt += c.lt.length; ltMax = Math.max(ltMax, ...c.lt, 0); heap = Math.max(heap, c.heapMax); for (const f of c.frames) fr.push(f); }
      const mean = fr.length ? fr.reduce((s, x) => s + x, 0) / fr.length : 0;
      out['x' + sp] = { chunks: cs.length, seconds: +el.toFixed(0), requestedHours: +req.toFixed(0), executedHours: +done.toFixed(0), executedPct: req ? +(done / req * 100).toFixed(1) : 0, backlogMax: +bmax.toFixed(1), backlogEnd: +bend.toFixed(1),
        fps: mean ? +(1000 / mean).toFixed(1) : 0, frameP50: q(fr, .5), frameP95: q(fr, .95), frameP99: q(fr, .99), frameMax: fr.length ? +Math.max.apply(null, fr).toFixed(0) : 0, longTasks: lt, longTaskMaxMs: +ltMax.toFixed(0), msPerGameHour: done ? +(runMs / done).toFixed(2) : 0, simSharePct: el ? +(runMs / (el * 1000) * 100).toFixed(1) : 0, heapMaxMB: +(heap / 1048576).toFixed(1) };
    }
    return out;
  }
  function report() {
    const l = L(), info = l ? { buildings: l.store.items.size, pipes: l.pipes.lines.size, hours: l.company.hours } : null, n = navigator;
    return { app: 'OLI device benchmark', build: BUILD, when: new Date().toISOString(), device: { userAgent: n.userAgent, cores: n.hardwareConcurrency, ramGB: n.deviceMemory || null, dpr: window.devicePixelRatio }, save: info, results: summarize() };
  }
  function text(r) {
    const o = ['OLI device benchmark — ' + r.when, 'build ' + r.build, 'device: ' + r.device.userAgent, 'cores ' + r.device.cores + ' · RAM ' + r.device.ramGB + 'GB', 'save: ' + JSON.stringify(r.save), '',
      'speed | sec | req h | done h | done% | backlog max/end | FPS | P95 | P99 | max ms | ms/game-hour | sim% | longtasks | heap MB'];
    for (const [k, v] of Object.entries(r.results)) o.push([k, v.seconds, v.requestedHours, v.executedHours, v.executedPct, v.backlogMax + '/' + v.backlogEnd, v.fps, v.frameP95, v.frameP99, v.frameMax, v.msPerGameHour, v.simSharePct, v.longTasks + '(max ' + v.longTaskMaxMs + ')', v.heapMaxMB].join(' | '));
    return o.join('\n');
  }
  async function exportFiles(say) {
    const rep = report(), stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19), jn = 'oli-bench-' + BUILD + '-' + stamp + '.json', tn = 'oli-bench-' + BUILD + '-' + stamp + '.txt', js = JSON.stringify(rep, null, 1), tx = text(rep);
    const C = window.Capacitor, plug = n => { try { return (C && C.Plugins && C.Plugins[n]) || (C && C.registerPlugin && C.registerPlugin(n)); } catch (_) { return null; } }; let how = '';
    try {
      const fs = C && plug('Filesystem'), sh = C && plug('Share');
      if (fs && sh && C.isNativePlatform && C.isNativePlatform()) { const uris = []; for (const [n, d] of [[jn, js], [tn, tx]]) { const w = await fs.writeFile({ path: n, data: d, directory: 'CACHE', encoding: 'utf8' }); uris.push(w.uri); } await sh.share({ title: 'OLI bench', text: 'نتائج القياس', files: uris, dialogTitle: 'إرسال النتائج' }); how = 'share'; }
    } catch (e) { say('تعذّرت المشاركة: ' + (e && e.message || e)); }
    if (!how) { try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([js], { type: 'application/json' })); a.download = jn; document.body.appendChild(a); a.click(); a.remove(); how = 'download'; } catch (_) { } }
    try { await navigator.clipboard.writeText(tx); how += ' + clipboard'; } catch (_) { }
    return { how, tx, jn };
  }

  async function runAll(opts, say, show) {
    if (st.active) return; st.active = true; st.stop = false; st.res = {};
    try {
      say('ينتظر انتهاء اللحاق بالساعات…');
      for (let i = 0; i < 400; i++) { const b = document.getElementById('cu-box'); if (!b || getComputedStyle(b).display === 'none') break; await sleep(300); }
      L().company.setSpeed(0); await sleep(500);
      for (const sp of opts.speeds) {
        st.res[sp] = [];
        for (let k = 1; k <= opts.chunks && !st.stop; k++) { say('×' + sp + ' · مقطع ' + k + '/' + opts.chunks); const r = await chunk(sp, opts.secs, say); st.res[sp].push(r); show(text(report())); await sleep(1500); }
        if (st.stop) break;
      }
      say(st.stop ? 'أُوقف.' : 'انتهى القياس — اضغط تصدير.'); show(text(report()));
    } catch (e) { say('خطأ: ' + (e && e.message || e)); } finally { try { L().company.setSpeed(0); } catch (_) { } st.active = false; }
  }

  function mount() {
    const css = document.createElement('style'); css.textContent = '#bn-btn{position:fixed;left:6px;top:6px;z-index:100000;background:#0b6b3a;color:#fff;border:1px solid #8fe0b0;border-radius:18px;padding:6px 10px;font:700 12px sans-serif}#bn{display:none;position:fixed;left:0;right:0;top:0;max-height:92vh;overflow:auto;z-index:100001;background:rgba(14,18,26,.97);color:#e8eef5;font:13px/1.45 sans-serif;direction:rtl;padding:10px}#bn button{margin:3px;padding:8px 10px;font:700 13px sans-serif}#bn pre{direction:ltr;text-align:left;white-space:pre-wrap;font-size:11px}';
    document.head.appendChild(css);
    const btn = document.createElement('button'); btn.id = 'bn-btn'; btn.textContent = 'BENCH ' + BUILD; document.body.appendChild(btn);
    const box = document.createElement('div'); box.id = 'bn';
    box.innerHTML = '<b>OLI قياس الجهاز — ' + BUILD + '</b><div id="bn-say" style="color:#9fd;margin:4px 0">جاهز</div>'
      + '<div>١) استيراد حفظ: <input type="file" id="bn-file" accept=".json,.txt,application/json,text/plain"> <button id="bn-imp">استيراد وإعادة التحميل</button></div>'
      + '<div>٢) مدة المقطع (ث) <input id="bn-secs" value="100" size="4" inputmode="numeric"> عدد المقاطع لكل سرعة <input id="bn-ch" value="3" size="2" inputmode="numeric"> السرعات <input id="bn-sp" value="1,2,5,10" size="10"></div>'
      + '<div><button id="bn-go" style="background:#1d8f4e;color:#fff">▶ ابدأ القياس</button><button id="bn-stop">■ إيقاف</button><button id="bn-exp" style="background:#2a6ab0;color:#fff">⬆ تصدير النتائج</button><button id="bn-close">إغلاق</button></div><pre id="bn-txt"></pre>';
    document.body.appendChild(box); const $ = id => document.getElementById(id), say = t => { $('bn-say').textContent = t; }, show = t => { $('bn-txt').textContent = t; };
    btn.onclick = () => { box.style.display = box.style.display === 'block' ? 'none' : 'block'; }; $('bn-close').onclick = () => { box.style.display = 'none'; };
    $('bn-imp').onclick = async () => { const f = $('bn-file').files[0]; if (!f) { say('اختر ملف الحفظ أولاً'); return; } try { const s = JSON.parse(await f.text()); if (!s || !s.store) throw new Error('الملف ليس حفظاً صالحاً'); if (s.eco) s.eco.savedAt = Date.now() - 1000; localStorage.setItem(KEY, JSON.stringify(s)); say('تم. إعادة التحميل…'); setTimeout(() => location.reload(), 400); } catch (e) { say('فشل الاستيراد: ' + (e && e.message || e)); } };
    $('bn-go').onclick = () => { const sp = $('bn-sp').value.split(',').map(x => +x.trim()).filter(x => x > 0), secs = Math.min(110, Math.max(10, +$('bn-secs').value || 100)), chunks = Math.max(1, +$('bn-ch').value || 3); box.style.display = 'none'; runAll({ speeds: sp, secs, chunks }, say, show); setTimeout(() => { box.style.display = 'block'; }, 300); };
    $('bn-stop').onclick = () => { st.stop = true; }; $('bn-exp').onclick = async () => { const r = await exportFiles(say); show(r.tx); say('تم التصدير (' + r.how + ')'); };
    const l = L(); if (l) say('الحفظ المحمّل: ' + l.store.items.size + ' مبنى · ' + l.pipes.lines.size + ' أنبوب');
  }
  const boot = setInterval(() => { if (document.body && window.__lab && window.__wp && window.__lab.restored) { clearInterval(boot); mount(); } }, 300);
  window.__bench = { runAll, report, text, chunk, st };
})();
