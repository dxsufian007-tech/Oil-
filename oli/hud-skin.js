/* OLI EMPIRE - HUD skin (stage 1 of the map redesign). Pure presentation: it restyles the existing HUD elements (same ids, same handlers) with the supplied icons and gold / navy frames,
   scales everything with the phone width (--u = 1 CSS px on the 543 px wide reference), and adds the left tool column (locate / select / zoom in / zoom out / refresh). No game rule is touched. */
(function () {
  'use strict';
  const A = 'map-assets/', ic = n => 'url(' + A + 'i-' + n + '.webp)';
  const CSS = `
:root{--u:min(calc(min(100vw,560px)/543),calc(100vh/724));--gold:#f2b632;--goldhi:#ffe08a;--goldlo:#b87a08;--navy1:#0d1d40;--navy2:#050c20;--ink:#fff3d6}
body:not(.dev){--fr:linear-gradient(180deg,var(--navy1),var(--navy2)) padding-box,linear-gradient(180deg,var(--goldhi),var(--goldlo) 52%,var(--gold)) border-box}
body:not(.dev) :is(#eco-hud>*,#hs-trans,#eh-speed,#eh-clock,#lyFab,#hs-tools,#g-nav button,#info.panel,#g-guide){background:var(--fr)!important;border:calc(2.5*var(--u)) solid transparent!important;box-shadow:0 0 calc(9*var(--u)) rgba(255,170,30,.32),inset 0 calc(1*var(--u)) 0 rgba(255,255,255,.14)!important;color:var(--ink)}
body:not(.dev) #eco-hud{left:calc(8*var(--u));right:calc(8*var(--u));top:calc(4*var(--u) + env(safe-area-inset-top,0px));height:calc(48*var(--u));gap:calc(7*var(--u))}
body:not(.dev) #eco-hud>*{border-radius:calc(16*var(--u))!important}
body:not(.dev) #eco-hud .cell{padding:0 calc(40*var(--u)) 0 calc(9*var(--u));background-repeat:no-repeat!important;background-position:calc(100% - 6px) center,left calc(6*var(--u)) center;position:relative;text-align:right}
body:not(.dev) #eco-hud .cell::after,body:not(.dev) #eco-hud #eh-menu::after{content:'';position:absolute;left:calc(7*var(--u));top:50%;width:calc(30*var(--u));height:calc(30*var(--u));margin-top:calc(-15*var(--u));background:center/contain no-repeat}
body:not(.dev) #eh-cash{flex-grow:117!important}body:not(.dev) #eh-prod{flex-grow:119!important}body:not(.dev) #eh-stor{flex-grow:98!important}body:not(.dev) #eh-net{flex-grow:117!important}
body:not(.dev) #eco-hud #eh-cash::after{background-image:${ic('cash')}}body:not(.dev) #eco-hud #eh-prod::after{background-image:${ic('prod')}}body:not(.dev) #eco-hud #eh-stor::after{background-image:${ic('storage')}}body:not(.dev) #eco-hud #eh-net::after{background-image:${ic('profit')}}
body:not(.dev) #eco-hud .cell{padding:0 calc(10*var(--u)) 0 calc(42*var(--u))}
body:not(.dev) #eco-hud .cell small{font-size:max(10px,calc(9.5*var(--u)));color:#ffe9b0;letter-spacing:0;text-align:right}
body:not(.dev) #eco-hud .cell b{font-size:max(13px,calc(15*var(--u)));color:#fff;text-align:right;direction:ltr;justify-self:end}
body:not(.dev) #eh-net b.pos,body:not(.dev) #eh-net .pos{color:#5df08b}
body:not(.dev) #eco-hud #eh-menu{flex:0 0 calc(45*var(--u))!important;min-width:0!important;font-size:0!important;position:relative}
body:not(.dev) #eco-hud #eh-menu::after{left:50%;margin-left:calc(-15*var(--u));background-image:${ic('menu')}}
body:not(.dev) #eh-badge{font-size:10px}
body:not(.dev) #eco-time{left:calc(8*var(--u));right:calc(8*var(--u));top:calc(66*var(--u) + env(safe-area-inset-top,0px));height:calc(43*var(--u));gap:calc(28*var(--u))}
body:not(.dev) #hs-trans{order:1;flex:0 0 calc(257*var(--u));display:flex;align-items:center;gap:calc(14*var(--u));padding:0 calc(10*var(--u));border-radius:calc(18*var(--u));pointer-events:auto}
body:not(.dev) #hs-trans button{background:none!important;border:0!important;box-shadow:none!important;font-size:0!important;min-width:0!important;min-height:0!important;height:100%;flex:1 1 0;padding:0;position:relative}
body:not(.dev) #hs-trans button::after{content:'';position:absolute;inset:14% 6%;background:center/contain no-repeat}
body:not(.dev) #hs-trans #tm-slow::after{background-image:${ic('rew')}}body:not(.dev) #hs-trans #eh-pause::after{background-image:${ic('pause')}}body:not(.dev) #hs-trans #tm-fast::after{background-image:${ic('ff')}}
body:not(.dev) #eco-time.paused #hs-trans #eh-pause::after{background:none;inset:22% 34%;border-style:solid;border-width:calc(10*var(--u)) 0 calc(10*var(--u)) calc(17*var(--u));border-color:transparent transparent transparent var(--gold);filter:drop-shadow(0 0 3px rgba(255,170,30,.7))}
body:not(.dev) #hs-trans #eh-speed{flex:0 0 calc(72*var(--u))!important;height:calc(100% - 6*var(--u));border-radius:calc(14*var(--u))!important;font-size:max(13px,calc(18*var(--u)))!important;font-weight:800;color:#ffe9b0;background:linear-gradient(180deg,#14284f,#07102a)!important;border:calc(1.5*var(--u)) solid rgba(255,200,90,.45)!important}
body:not(.dev) #eco-time #eh-clock{order:2;flex:1 1 0;border-radius:calc(18*var(--u))!important;padding:0 calc(10*var(--u)) 0 calc(48*var(--u))!important;position:relative}
body:not(.dev) #eco-time #eh-clock::before{content:'';position:absolute;left:calc(12*var(--u));top:50%;width:calc(30*var(--u));height:calc(30*var(--u));margin-top:calc(-15*var(--u));background:${ic('cal')} center/contain no-repeat}
body:not(.dev) #eco-time #eh-clock small{font-size:max(10px,calc(10*var(--u)));color:#ffe9b0}body:not(.dev) #eco-time #eh-clock b{font-size:max(13px,calc(15*var(--u)));color:#fff}
body:not(.dev) #lyFab{right:calc(9*var(--u))!important;top:calc(126*var(--u) + env(safe-area-inset-top,0px))!important;width:calc(174*var(--u));height:calc(37*var(--u));min-height:0!important;padding:0 calc(46*var(--u)) 0 calc(8*var(--u))!important;border-radius:calc(16*var(--u))!important;font-size:max(12px,calc(14.5*var(--u)));font-weight:800;text-align:left;background:var(--fr)!important;position:absolute}
body:not(.dev) #lyFab::after{content:'';position:absolute;right:calc(10*var(--u));top:50%;width:calc(26*var(--u));height:calc(26*var(--u));margin-top:calc(-13*var(--u));background:${ic('layers')} center/contain no-repeat}
body:not(.dev) #lyFab.on{filter:brightness(1.25)}
body:not(.dev) #lyPanel{top:calc(170*var(--u))!important;right:calc(9*var(--u))!important;background:linear-gradient(180deg,#0d1d40,#050c20)!important;border:calc(2*var(--u)) solid #c98a0b!important;border-radius:calc(14*var(--u))!important;color:var(--ink)}
body:not(.dev) #hs-tools{position:absolute;left:calc(12*var(--u));top:calc(131*var(--u) + env(safe-area-inset-top,0px));width:calc(42*var(--u));display:flex;flex-direction:column;gap:calc(1*var(--u));padding:calc(3*var(--u)) 0;border-radius:calc(22*var(--u));z-index:7}
body:not(.dev) #hs-tools button{background:none!important;border:0!important;box-shadow:none!important;width:100%;height:calc(37*var(--u));min-height:0;padding:0;position:relative}
body:not(.dev) #hs-tools button::after{content:'';position:absolute;inset:16%;background:center/contain no-repeat}
body:not(.dev) #hs-tools button:active::after{filter:brightness(1.4)}body:not(.dev) #hs-tools button.on::after{filter:drop-shadow(0 0 6px #ffcf5a) brightness(1.3)}
body:not(.dev) #hs-tools [data-t=locate]::after{background-image:${ic('locate')}}body:not(.dev) #hs-tools [data-t=select]::after{background-image:${ic('select')}}body:not(.dev) #hs-tools [data-t=in]::after{background-image:${ic('plus')}}body:not(.dev) #hs-tools [data-t=out]::after{background-image:${ic('minus')}}body:not(.dev) #hs-tools [data-t=reset]::after{background-image:${ic('refresh')}}
body:not(.dev) #info.panel{left:calc(20*var(--u))!important;right:calc(20*var(--u))!important;bottom:calc(124*var(--u) + env(safe-area-inset-bottom,0px))!important;min-height:calc(39*var(--u));border-radius:calc(20*var(--u))!important;padding:calc(8*var(--u)) calc(44*var(--u)) calc(8*var(--u)) calc(14*var(--u))!important;font-size:max(12px,calc(14*var(--u)));background:${ic('info')} calc(100% - 12*var(--u)) calc(9*var(--u))/calc(24*var(--u)) no-repeat,var(--fr)!important;display:block!important;max-height:min(58vh,calc(100vh - 300*var(--u)))!important;overflow-y:auto!important;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y}
body:not(.dev) #info.panel:empty,body:not(.dev).pipemode #info.panel{display:none!important}body:not(.dev) #info.panel .k{color:#d9c391}
body:not(.dev) #buildbar{bottom:calc(124*var(--u) + env(safe-area-inset-bottom,0px))!important}
body:not(.dev) #g-nav{left:calc(8*var(--u));right:calc(8*var(--u));bottom:calc(26*var(--u) + env(safe-area-inset-bottom,0px));height:calc(80*var(--u));gap:calc(7*var(--u));padding:0;background:none!important;border:0!important;box-shadow:none!important}
body:not(.dev) #g-nav button{border-radius:calc(22*var(--u))!important;font-size:max(13px,calc(17*var(--u)));font-weight:800;min-height:0;gap:calc(2*var(--u));color:#fff1cf;justify-content:flex-end;padding:0 0 calc(7*var(--u))}
body:not(.dev) #g-nav button b{height:calc(40*var(--u));width:100%;display:flex;align-items:center;justify-content:center;font-size:0}
body:not(.dev) #g-nav button b img{height:100%;width:auto;max-width:80%;object-fit:contain;filter:drop-shadow(0 2px 3px rgba(0,0,0,.6))}
body:not(.dev) #g-nav button.on{background:linear-gradient(180deg,#3a2a08,#1a1204) padding-box,linear-gradient(180deg,#fff0b0,#e0a020) border-box!important;color:#fff;box-shadow:0 0 calc(14*var(--u)) rgba(255,190,50,.7)!important}
body:not(.dev) #g-sheet{bottom:calc(112*var(--u) + env(safe-area-inset-bottom,0px))!important;background:linear-gradient(180deg,#0d1d40,#050c20)!important;border-top:calc(2.5*var(--u)) solid #e0a020!important}
body:not(.dev) #g-guide{top:calc(170*var(--u))!important;left:calc(62*var(--u))!important;right:calc(9*var(--u))!important;border-radius:calc(16*var(--u))!important;padding:calc(6*var(--u)) calc(12*var(--u))!important}
body:not(.dev) #toast{top:calc(170*var(--u))!important}`;
  const st = document.createElement('style'); st.id = 'hudSkinCss'; st.textContent = CSS; document.head.appendChild(st);
  const $ = id => document.getElementById(id), strip = s => s.replace(/^[^؀-ۿA-Za-z]+/, '');
  const NAV = { oil: 'prod', pipes: 'pipe', storage: 'crane', process: 'refinery' };
  function target() {                                                                         // where "locate" goes: the company HQ, else the first oil well, else the middle of the map
    const L = window.__lab; try { const l = L && L.store.list(); const b = l && (l.find(x => /hq/i.test(x.d)) || l.find(x => /well/.test(x.d)) || l[0]); if (b) { const f = (window.OliBuildings && 0) || null; return { x: b.x + 1, y: b.y + 1 }; } } catch (_) { }
    const w = window.__wp; return w ? { x: w.cam.x, y: w.cam.y } : null;
  }
  function apply() {
    const hud = $('eco-hud'), tm = $('eco-time'), nav = $('g-nav'), fab = $('lyFab'), wp = window.__wp;
    if (!hud || !tm || !nav || !fab || !wp || $('hs-tools')) return false;
    for (const s of hud.querySelectorAll('.cell small')) s.textContent = strip(s.textContent);
    fab.textContent = strip(fab.textContent);
    const tr = document.createElement('div'); tr.id = 'hs-trans'; for (const id of ['tm-slow', 'eh-pause', 'tm-fast', 'eh-speed']) { const e = $(id); if (e) tr.appendChild(e); } tm.insertBefore(tr, tm.firstChild);
    for (const ev of ['pointerdown', 'touchstart']) tr.addEventListener(ev, e => e.stopPropagation(), { passive: true });
    for (const b of nav.children) { const m = NAV[b.dataset.cat]; const i = b.querySelector('b'); if (m && i) i.innerHTML = '<img alt="" src="' + A + 'i-' + m + '.webp">'; }
    const tl = document.createElement('div'); tl.id = 'hs-tools'; tl.innerHTML = ['locate:تحديد الموقع', 'select:وضع التحديد', 'in:تكبير', 'out:تصغير', 'reset:إعادة ضبط العرض'].map(s => { const [k, t] = s.split(':'); return '<button data-t="' + k + '" title="' + t + '" aria-label="' + t + '"></button>'; }).join('');
    document.body.appendChild(tl); for (const ev of ['pointerdown', 'touchstart']) tl.addEventListener(ev, e => e.stopPropagation(), { passive: true });
    const zoom = f => { wp.goto(wp.cam.x, wp.cam.y, wp.cam.z * f); };
    tl.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return; const k = b.dataset.t;
      if (k === 'in') zoom(1.3); else if (k === 'out') zoom(1 / 1.3);
      else if (k === 'locate' || k === 'reset') { const t = target(); if (t) wp.goto(t.x, t.y, k === 'reset' ? 1.2 : 0); wp.markDirty(); }
      else if (k === 'select') { b.classList.toggle('on'); const L = window.__lab; if (L && L.toast) L.toast(b.classList.contains('on') ? 'وضع التحديد: اضغط على حقل أو مبنى لعرض تفاصيله' : 'تم إيقاف وضع التحديد'); }
    });
    return true;
  }
  let n = 0; (function wait() { if (!apply() && n++ < 200) setTimeout(wait, 100); })();
  window.__hudSkin = { apply };
})();
