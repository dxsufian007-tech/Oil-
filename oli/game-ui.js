/* Oli - game-ui.js  (the simple Arabic shell: bottom bar of four big icons, building cards, step-by-step guide, unlock levels)
 * The simulation, the economy and the building lab are unchanged; this file only decides WHAT the player sees and WHEN.
 */
(function () {
  'use strict';
  const GC = OliGameConfig, AR = window.OliAR, $ = id => document.getElementById(id);
  const DEV = /[?&]lab=1/.test(location.search) || (function () { try { return localStorage.getItem('oli-labui') === '1'; } catch (_) { return false; } })(), UNLOCK = DEV || /[?&]unlock=all/.test(location.search);
  const money = n => '$' + Math.round(n).toLocaleString('en-US');
  const S = { level: UNLOCK ? 6 : 1, step: 0, hidden: false, cat: null, open: null, seenLv: 1 };
  let L = null, B = null, BC = null, lastMsg = '';
  const CSS = `
body:not(.dev) #bar,body:not(.dev) #pal,body:not(.dev) #tabs,body:not(.dev) #hud{display:none!important}
html[dir=rtl] body{direction:rtl}body{font-family:system-ui,'Noto Sans Arabic','Segoe UI',Tahoma,sans-serif}
#g-nav{position:absolute;left:0;right:0;bottom:0;height:64px;display:flex;gap:6px;padding:6px 8px;background:rgba(16,20,26,.96);border-top:1px solid #33404f;z-index:9}
#g-nav button{flex:1 1 0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;padding:2px 2px;line-height:1.15;font-size:13px;font-weight:700;min-height:52px;border-radius:12px;position:relative}
#g-nav button b{font-size:23px;line-height:1}#g-nav button.on{background:var(--acc);color:#222;border-color:var(--acc)}
#g-nav button.pulse{animation:gpulse 1.3s infinite}@keyframes gpulse{0%,100%{box-shadow:0 0 0 0 rgba(230,161,58,.0)}50%{box-shadow:0 0 0 6px rgba(230,161,58,.55)}}
#g-sheet{position:absolute;left:0;right:0;bottom:64px;max-height:64%;display:none;flex-direction:column;background:rgba(20,26,34,.98);border-top:2px solid var(--acc);border-radius:16px 16px 0 0;z-index:8;touch-action:pan-y}#g-sheet.open{display:flex}
#g-sheet .hd{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid #33404f}#g-sheet .hd b{flex:1;font-size:16px}#g-sheet .hd small{color:var(--mut)}
#g-list{overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:8px;-webkit-overflow-scrolling:touch;touch-action:pan-y}
.gcard{background:#212a36;border:1px solid #33404f;border-radius:14px;padding:10px;display:flex;flex-direction:column;gap:6px}.gcard.lock{opacity:.62}
.gcard .top{display:flex;gap:10px;align-items:center}.gcard .ico{flex:0 0 58px;height:58px;border-radius:12px;background:#10141a;display:flex;align-items:center;justify-content:center;font-size:34px;position:relative}.gcard .ico canvas{width:58px;height:50px}
.gcard .nm{font-size:16px;font-weight:800}.gcard .meta{color:var(--mut);font-size:12px}.gcard .pr{color:#8dffb0;font-weight:800;font-size:15px}.gcard.lock .pr{color:var(--mut)}
.gcard .row{display:flex;gap:8px;margin-top:0}.gcard .row button{flex:1;min-height:46px;font-weight:800;font-size:15px}.gcard .row button.go{background:#2f9e5a;border-color:#2f9e5a;color:#fff}.gcard .row button.go[disabled]{opacity:.4}
.gcard .more{display:none;background:#10141a;border-radius:10px;padding:8px 10px;font-size:13px;line-height:1.6}.gcard.ex .more{display:block}.gcard .more h6{margin:6px 0 0;color:var(--acc);font-size:12px}.gcard .more p{margin:0}
.chain{display:flex;align-items:center;justify-content:center;gap:2px;margin-top:8px;flex-wrap:wrap}.chain span.n{display:flex;flex-direction:column;align-items:center;font-size:11px;min-width:56px}.chain span.n i{font-style:normal;font-size:26px}.chain span.ar{color:var(--acc);font-size:18px}
#g-guide{position:absolute;left:8px;right:8px;top:50px;z-index:7;background:rgba(32,44,30,.96);border:1px solid #4d8a4d;border-radius:12px;padding:8px 12px;display:none;gap:8px;align-items:center}#g-guide.show{display:flex}
#g-guide .tx{flex:1;font-size:14px;line-height:1.5;font-weight:700}#g-guide .tx small{display:block;font-weight:400;color:#b6d4b6;font-size:12px}#g-guide button{min-height:34px;padding:2px 10px;font-size:12px}
#g-lvl{position:fixed;inset:0;z-index:45;background:rgba(5,8,12,.8);display:none;align-items:center;justify-content:center;padding:16px}#g-lvl.open{display:flex}
#g-lvl .box{background:var(--panel);border:2px solid var(--acc);border-radius:16px;padding:18px;max-width:380px;width:100%;text-align:center}#g-lvl h3{margin:0 0 6px;font-size:20px}#g-lvl p{margin:6px 0}#g-lvl button{margin-top:10px;width:100%;min-height:48px;font-weight:800;background:#2f9e5a;border-color:#2f9e5a;color:#fff}
#eco-hud{top:6px!important}body.dev #eco-hud{top:54px!important}#g-guide{top:52px}body.dev #g-guide{top:100px}
body:not(.dev) .panel{bottom:72px!important}body:not(.dev) #buildbar{bottom:72px!important}#toast{top:104px!important}body:not(.dev) #g-nav{display:flex}body.dev #g-nav,body.dev #g-sheet,body.dev #g-guide{display:none!important}
@media (max-height:620px){#g-sheet{max-height:70%}}`;

  function cost(id) { const d = B.DEFS[id]; return d.type === 'well' ? 'يبدأ من ' + money(d.cost) : money(d.cost); }
  function can(id) { return UNLOCK || (GC.INFO[id] ? GC.INFO[id].lv <= S.level : true); }
  function icon(id) {
    const cv = document.createElement('canvas'), d = B.DEFS[id]; if (!d || !window.OliBuildingArt) return null; const W = 58, H = 50; cv.width = W * 2; cv.height = H * 2; const g = cv.getContext('2d'), [fw, fh] = d.footprint, zz = Math.min(.42, 52 / ((fw + fh) * 32), 34 / ((fw + fh) * 16 + 60));
    g.scale(2, 2); try { OliBuildingArt.draw(g, d.visual, { ox: W / 2 + (fh - fw) * 16 * zz, oy: H - 5 - (fw + fh) * 16 * zz, z: zz, r: 0, w: fw, h: fh, t: .4, fill: .6, state: 'OPERATIONAL' }); } catch (_) { return null; } return cv;
  }
  function chainHtml(ch) { return '<div class="chain">' + ch.map((c, i) => (i ? '<span class="ar">◀</span>' : '') + '<span class="n"><i>' + c[0] + '</i>' + c[1] + '</span>').join('') + '</div>'; }
  function card(id) {
    const info = GC.INFO[id], open = can(id), el = document.createElement('div'); el.className = 'gcard' + (open ? '' : ' lock') + (S.open === id ? ' ex' : ''); el.dataset.id = id;
    const isPipe = id === 'pipe', d = isPipe ? null : B.DEFS[id], size = isPipe ? 'من مبنى إلى مبنى' : d.footprint.join('×');
    const unl = GC.LEVELS.find(l => l.lv === info.lv), why = open ? '' : '🔒 يُفتح في المستوى ' + info.lv + ' «' + unl.name + '» — ' + unl.when;
    el.innerHTML = '<div class="top"><div class="ico">' + info.icon + '</div><div style="flex:1;min-width:0"><div class="nm">' + info.name + (open ? '' : ' 🔒') + '</div><div class="pr">' + (isPipe ? 'من $' + (BC.PIPES[BC.PIPE_DEFAULT].cost).toLocaleString('en-US') + ' للمربع' : cost(id)) + '</div><div class="meta">المساحة: ' + size + (open ? '' : '') + '</div><div class="meta">' + (open ? info.short : why) + '</div></div></div>'
      + '<div class="more"><h6>ما وظيفته؟</h6><p>' + info.does + '</p><h6>متى أحتاجه؟</h6><p>' + info.when + '</p><h6>ما الذي يمكن توصيله به؟</h6><p>' + info.links + '</p>'
      + (isPipe ? '' : '<h6>التكلفة</h6><p>البناء: ' + cost(id) + ' · التشغيل: ' + money(d.operatingCost) + ' في اليوم · الصيانة: ' + money(d.maintenanceCost) + ' في اليوم</p>') + '<h6>السعة أو الإنتاج</h6><p>' + info.prod + '</p><h6>كيف يعمل؟</h6>' + chainHtml(info.chain) + '</div>'
      + '<div class="row">' + (open ? '<button class="go" data-act="build" data-id="' + id + '">' + (isPipe ? '🔧 ارسم أنبوبًا' : 'بناء') + '</button>' : '') + '<button data-act="more" data-id="' + id + '">؟ كيف يعمل</button></div>';
    const ic = isPipe ? null : icon(id); if (ic) { const w = el.querySelector('.ico'); w.textContent = ''; w.appendChild(ic); } return el;
  }
  function showCat(cid) {
    const c = GC.CATS.find(x => x.id === cid); if (!c) return; S.cat = cid; $('g-title').textContent = c.icon + ' ' + c.name; $('g-hint').textContent = c.hint; const ls = $('g-list'); ls.textContent = '';
    for (const id of c.ids) if (GC.INFO[id]) ls.appendChild(card(id)); $('g-sheet').classList.add('open'); ls.scrollTop = 0;
    for (const b of $('g-nav').children) b.classList.toggle('on', b.dataset.cat === cid); refreshGuide();
  }
  function closeSheet() { S.cat = null; $('g-sheet').classList.remove('open'); for (const b of $('g-nav').children) b.classList.remove('on'); }

  /* ---------------------------------------------------------------- progress */
  const lab = () => window.__lab;
  function counts() {
    const l = lab(); const list = l.store.list(), c = { well: 0, tank: 0, sep: 0, ref: 0, wellUC: 0, started: 0, crudeVol: 0, closedLines: 0 };
    for (const b of list) { const t = B.DEFS[b.d].type; if (t === 'well') { c.well++; if (b.st === 'UNDER_CONSTRUCTION') c.wellUC++; else if (!b.s || b.s.started !== false) c.started++; } else if (t === 'tank' && b.d.startsWith('crude')) { c.tank++; const s = l.sim.ensure(b); c.crudeVol += s.vol || 0; } else if (t === 'separator') c.sep++; else if (t === 'refinery') c.ref++; }
    for (const ln of l.pipes.lines.values()) if (ln.a && ln.b) c.closedLines++;
    c.revenue = l.company.led.life.revenue || 0; return c;
  }
  const PRED = { drill: c => c.well > 0, wait: c => c.well > 0 && c.wellUC === 0, start: c => c.started > 0, tank: c => c.tank > 0, pipe: c => c.closedLines > 0, flow: c => c.crudeVol > 50, sell: c => c.revenue > 0, grow: c => S.level >= 2 };
  function levelFor(c) {
    let lv = S.level; if (UNLOCK) return 6;
    if (lv < 2 && c.revenue > 0) lv = 2; if (lv < 3 && lv >= 2 && c.well >= 2 && c.revenue >= 1e6) lv = 3; if (lv < 4 && lv >= 3 && c.sep > 0) lv = 4; if (lv < 5 && lv >= 4 && c.ref > 0) lv = 5; if (lv < 6 && lv >= 5 && c.revenue >= 5e6) lv = 6; return lv;
  }
  function check() {
    const l = lab(); if (!l || !l.restored) return; const c = counts(), lv = levelFor(c);
    if (lv > S.level) { const was = S.level; S.level = lv; if (!UNLOCK) levelUp(lv, was); }
    let moved = false; while (S.step < GC.STEPS.length - 1 && PRED[GC.STEPS[S.step].id](c)) { S.step++; moved = true; }
    document.body.classList.toggle('lv-tabs', S.level >= 3); for (const t of ['contracts', 'loans']) { const b = document.querySelector('#es-tabs [data-tab=' + t + ']'); if (b) b.style.display = S.level >= 3 || UNLOCK ? '' : 'none'; }
    if (moved) { lastMsg = ''; if (lab().save) lab().save(); } refreshGuide(c);
  }
  function guideText(c) {
    if (S.level >= 2 || S.step >= GC.STEPS.length - 1) { const g = GC.NEXT_GOAL[S.level]; return { text: S.step < GC.STEPS.length - 1 ? GC.STEPS[S.step].text : g, hint: S.step < GC.STEPS.length - 1 ? GC.STEPS[S.step].hint : 'المستوى ' + S.level + ': ' + GC.LEVELS[S.level - 1].name }; }
    return GC.STEPS[S.step];
  }
  function refreshGuide(c) {
    const g = $('g-guide'); if (!g) return; const show = !S.hidden && lab() && lab().restored && !DEV && !UNLOCK; const gt = guideText(c || counts()); g.classList.toggle('show', !!show);
    if (show) { g.querySelector('.tx').innerHTML = '🧭 ' + gt.text + '<small>' + (gt.hint || '') + '</small>'; }
    const pc = { drill: 'oil', wait: null, start: null, tank: 'storage', pipe: 'pipes', flow: null, sell: null, grow: 'oil' }[GC.STEPS[S.step].id];
    for (const b of $('g-nav').children) b.classList.toggle('pulse', !!show && S.level === 1 && b.dataset.cat === pc && S.cat !== pc);
  }
  function levelUp(lv) {
    const l = GC.LEVELS[lv - 1]; if (!l) return; $('g-lvl').querySelector('.box').innerHTML = '<div style="font-size:44px">🎉</div><h3>المستوى ' + lv + ': ' + l.name + '</h3><p>' + l.goal + '</p><p style="color:#8dffb0">فُتح لك: ' + l.unlocks + '</p><button id="g-lvl-ok">رائع!</button>'; $('g-lvl').classList.add('open');
    $('g-lvl-ok').onclick = () => $('g-lvl').classList.remove('open'); if (S.cat) showCat(S.cat);
  }

  /* ---------------------------------------------------------------- mount */
  function mount() {
    L = lab(); B = OliBuildings; BC = OliBuildingConfig; if (DEV) document.body.classList.add('dev');
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const nav = document.createElement('div'); nav.id = 'g-nav'; nav.innerHTML = GC.CATS.map(c => '<button data-cat="' + c.id + '"><b>' + c.icon + '</b>' + c.name + '</button>').join(''); document.body.appendChild(nav);
    const sh = document.createElement('div'); sh.id = 'g-sheet'; sh.innerHTML = '<div class="hd"><b id="g-title"></b><small id="g-hint"></small><button id="g-close">✕</button></div><div id="g-list"></div>'; document.body.appendChild(sh);
    const gd = document.createElement('div'); gd.id = 'g-guide'; gd.innerHTML = '<div class="tx"></div><button id="g-hide">إخفاء</button>'; document.body.appendChild(gd);
    const lv = document.createElement('div'); lv.id = 'g-lvl'; lv.innerHTML = '<div class="box"></div>'; document.body.appendChild(lv);
    for (const id of ['g-nav', 'g-sheet', 'g-guide', 'g-lvl']) for (const ev of ['pointerdown', 'touchstart']) $(id).addEventListener(ev, e => e.stopPropagation(), { passive: true });
    nav.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (S.cat === b.dataset.cat) closeSheet(); else { L.cancelAll && L.cancelAll(true); showCat(b.dataset.cat); } });
    $('g-close').onclick = closeSheet; $('g-hide').onclick = () => { S.hidden = true; refreshGuide(); };
    $('g-list').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return; const id = b.dataset.id;
      if (b.dataset.act === 'more') { S.open = S.open === id ? null : id; const c = b.closest('.gcard'); c.classList.toggle('ex', S.open === id); for (const o of $('g-list').children) if (o !== c) o.classList.remove('ex'); }
      else if (b.dataset.act === 'build' && can(id)) { closeSheet(); if (id === 'pipe') L.pipeMode(true); else L.startBuild(id); }
    });
    setInterval(check, 700); check();
  }
  function toJSON() { return { level: S.level, step: S.step, hidden: S.hidden }; }
  function fromJSON(d) { if (d && typeof d === 'object') { S.level = Math.max(1, Math.min(6, d.level | 0 || 1)); S.step = Math.max(0, Math.min(GC.STEPS.length - 1, d.step | 0)); S.hidden = !!d.hidden; } else { S.level = 1; S.step = 0; S.hidden = false; } if (UNLOCK) S.level = 6; if ($('g-guide')) refreshGuide(); }
  function reset() { S.level = UNLOCK ? 6 : 1; S.step = 0; S.hidden = false; closeSheet(); }
  function setLevel(n) { S.level = n; if ($('g-sheet')) { check(); } }
  window.OliGameUI = { mount, toJSON, fromJSON, reset, setLevel, can, check, level: () => S.level, step: () => S.step, state: () => Object.assign({}, S), showCat, closeSheet, dev: DEV, refreshGuide: () => refreshGuide(), cost };
})();
