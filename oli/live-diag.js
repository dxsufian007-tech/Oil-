/* Oli - live-diag.js  (MEASUREMENT ONLY: what the game loop really does on this device - nothing in the game depends on it)
   Open: press and hold the speed button (×n) for about a second.  The panel shows, every second, and keeps one row per minute (last 60 minutes):
   - game hours really computed per second, against the hours per second the chosen speed asks for, and the real speed (×)
   - simulation: ms spent per second, ms per game hour, the longest single slice, slices per second, and why the loop waited
     (the map's share of the frame / waiting for a frame), hours finished early because of a tap (settle)
   - drawing: frames per second (requestAnimationFrame), map redraws per second, ms per redraw, the ground cache (used or not and why)
   - backlog: game time waiting (acc, capped at 4 h) and whether an hour is open
   - the world: buildings, pipelines, JS heap when the device reports it.
   "نسخ" copies everything (live values + the minute rows) as text, to paste into a message. */
(function () {
  const lab = () => window.__lab, WP = () => window.__wp; let el = null, iv = 0, prev = null, minute = null; const rows = [];
  function snap() { const L = lab(), W = WP(), D = window.__diag || {}, S = (W && W.stats) || {}, C = L && L.company; if (!C) return null;
    return { t: performance.now(), hours: C.hours, acc: C.acc, mid: !!C.midHour, speed: C.speed, real: C.realSpeed, realLast: C.realSpeedLast, pumps: D.pumps | 0, waitShare: D.waitShare | 0, waitFrame: D.waitFrame | 0, slices: D.slices | 0, runMs: D.runMs || 0, hrs: D.hours || 0, maxRun: D.maxRun || 0, settles: D.settles | 0,
      rafs: S.rafs | 0, draws: S.draws | 0, drawMs: S.drawMs || 0, gHits: S.groundHits | 0, gWorth: S.groundWorth !== false, n: L.store.items.size, lines: L.pipes ? L.pipes.lines.size : 0, heap: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null }; }
  function rate(a, b) { const s = (b.t - a.t) / 1000 || 1, h = b.hours - a.hours, ms = b.runMs - a.runMs, hd = b.hrs - a.hrs, dr = b.draws - a.draws;
    return { sec: s, hoursPerSec: h / s, wanted: hps() * b.speed, realX: h / s / hps(), simMsPerSec: ms / s, msPerHour: hd > 0 ? ms / hd : null, slicesPerSec: (b.slices - a.slices) / s, waitSharePerSec: (b.waitShare - a.waitShare) / s, waitFramePerSec: (b.waitFrame - a.waitFrame) / s,
      settlesPerSec: (b.settles - a.settles) / s, fps: (b.rafs - a.rafs) / s, redrawsPerSec: dr / s, msPerRedraw: dr ? (b.drawMs - a.drawMs) / dr : null, groundHitsPerSec: (b.gHits - a.gHits) / s }; }
  const hps = () => { const T = window.OliEconomyConfig && OliEconomyConfig.TIME; return T ? 24 / T.dayRealSeconds : 1; };      // game hours per real second at x1
  const f = (v, d = 1) => v == null || !isFinite(v) ? '—' : (+v).toFixed(d);
  function line(r, b) { return 'السرعة المختارة ×' + b.speed + ' · السرعة الفعلية ×' + f(r.realX, 2) + ' · ساعات/ث ' + f(r.hoursPerSec, 2) + ' من ' + f(r.wanted, 0) + ' · محاكاة ' + f(r.simMsPerSec, 0) + 'ms/ث · ' + f(r.msPerHour) + 'ms/ساعة · أطول شريحة ' + f(b.maxRun, 0) + 'ms · شرائح/ث ' + f(r.slicesPerSec)
    + ' · انتظار(حصة الرسم) ' + f(r.waitSharePerSec) + '/ث · انتظار(إطار) ' + f(r.waitFramePerSec) + '/ث · إكمال بلمسة ' + f(r.settlesPerSec, 2) + '/ث | FPS ' + f(r.fps) + ' · إعادة رسم ' + f(r.redrawsPerSec) + '/ث · ' + f(r.msPerRedraw) + 'ms/رسم · Cache الأرضية ' + (b.gWorth ? 'مفعّل' : 'معطّل (أغلى من الرسم)') + ' ' + f(r.groundHitsPerSec) + '/ث'
    + ' | ساعات متراكمة تنتظر الحساب ' + f(b.acc, 2) + ' (حد ' + ((window.OliEconomyConfig && OliEconomyConfig.TIME.liveBacklogHours) || '') + ')' + (b.mid ? ' · ساعة مفتوحة' : '') + ' | مبانٍ ' + b.n + ' · أنابيب ' + b.lines + (b.heap != null ? ' · ذاكرة ' + f(b.heap) + 'MB' : ''); }
  function render() { if (!el) return; const b = snap(); if (!b) return; if (prev) { const r = rate(prev, b); el.querySelector('.now').textContent = line(r, b); }
    if (!minute) minute = b; else if (b.t - minute.t >= 60000) { const r = rate(minute, b); rows.push(new Date().toLocaleTimeString('en-GB') + ' · ' + line(r, b)); if (rows.length > 60) rows.shift(); minute = b; if (window.__diag) window.__diag.maxRun = 0; }
    el.querySelector('.rows').textContent = rows.length ? rows.slice().reverse().join('\n\n') : 'سطر كل دقيقة يظهر هنا (أبقِ اللعبة تعمل)'; prev = b; }
  function open() { if (el) { el.style.display = ''; return; }
    el = document.createElement('div'); el.id = 'live-diag'; el.setAttribute('dir', 'rtl');
    el.style.cssText = 'position:fixed;left:6px;right:6px;bottom:6px;max-height:55vh;overflow:auto;z-index:99;background:rgba(8,14,24,.94);color:#e6f0ff;font:12px/1.5 system-ui,sans-serif;border:1px solid #4a6a9a;border-radius:10px;padding:8px;white-space:pre-wrap';
    el.innerHTML = '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px"><b style="flex:1">📊 تشخيص الأداء (قياس فقط)</b><button class="cp" style="min-height:36px">نسخ</button><button class="x" style="min-height:36px">إغلاق</button></div><div class="now"></div><hr style="border-color:#334"><div class="rows" style="opacity:.9"></div>';
    document.body.appendChild(el); el.querySelector('.x').onclick = () => { el.style.display = 'none'; };
    el.querySelector('.cp').onclick = () => { const t = 'OLI live diagnostics · ' + (window.OLI_VERSION || '') + '\n' + el.querySelector('.now').textContent + '\n\n' + rows.join('\n\n'); try { navigator.clipboard.writeText(t).then(() => { el.querySelector('.cp').textContent = 'تم النسخ'; }, () => fallback(t)); } catch (_) { fallback(t); } };
    render(); }
  function fallback(t) { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'width:100%;height:120px'; el.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (_) { } }
  // press and hold the speed button about a second (a short tap still changes the speed as before)
  let hold = 0; document.addEventListener('pointerdown', e => { const t = e.target && e.target.closest && e.target.closest('#eh-speed'); if (!t) return; clearTimeout(hold); hold = setTimeout(() => { held = true; open(); }, 900); }, true);
  let held = false; document.addEventListener('click', e => { if (held && e.target && e.target.closest && e.target.closest('#eh-speed')) { held = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);      // the hold that opened the panel does not also change the speed
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) document.addEventListener(ev, () => clearTimeout(hold), true);
  // the counters run from the start (cheap; one timer created when the script loads, never more), so the first minute is there when the panel is opened later
  iv = setInterval(() => { if (el && el.style.display !== 'none') { render(); return; } const b = snap(); if (!b) return; if (!minute) { minute = b; prev = b; return; }
    if (b.t - minute.t >= 60000) { const r = rate(minute, b); rows.push(new Date().toLocaleTimeString('en-GB') + ' · ' + line(r, b)); if (rows.length > 60) rows.shift(); minute = b; if (window.__diag) window.__diag.maxRun = 0; } prev = b; }, 1000);
  window.OliLiveDiag = { open, rows: () => rows.slice(), snap };
})();
