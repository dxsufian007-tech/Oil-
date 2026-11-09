/* OLI main menu (the front door of the game).
   It is a screen laid OVER the existing game: it does not change the engine, the economy, the saving, the buildings or the pipes.
   - "Continue" opens the last save of the one playable mode (or starts the current game when there is no save).
   - "Game modes" / "New maps": visual pages only - everything on them is marked "Soon" and cannot be opened or played.
   - "Reset": asks first, then uses the game's own new-game function.
   Only the app build (OLI_HOME) shows it; the development page and every test run without it. */
(function () {
  'use strict';
  if (!window.OLI_HOME) return;
  const LS = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) { } }, del(k) { try { localStorage.removeItem(k); } catch (_) { } } };
  window.OLI_NOMOTION = LS.get('oli-nomotion') === '1';
  const en = LS.get('oli-lang') === 'en';
  const TX = {
    ar: { tag: 'Build Your Oil Empire', contS: 'إكمال تقدمك', startS: 'ابدأ رحلتك النفطية', resetS: 'بدء لعبة جديدة من الصفر', cont: 'متابعة اللعبة', start: 'ابدأ اللعبة', loading: 'جارٍ تحميل اللعبة…', maps: 'خرائط جديدة', modes: 'أنماط اللعب', reset: 'إعادة تعيين اللعبة', settings: 'الإعدادات', about: 'حول اللعبة', back: 'رجوع', soon: 'قريباً', current: 'الحالي',
      modesT: 'أنماط اللعب', modesS: 'أنماط جديدة قادمة. النمط المفتوح هو الوحيد المتاح الآن.', mapsT: 'خرائط جديدة', mapsS: 'خرائط جديدة قادمة. الخريطة الحالية هي المتاحة الآن.',
      m0: 'الوضع المفتوح', m0d: 'كل المباني والأنظمة مفتوحة. العب بحرية وابنِ إمبراطوريتك النفطية.', m1: 'المسيرة المهنية', m1d: 'ابدأ بشركة صغيرة وتدرّج عبر مراحل ومهام.', m2: 'التحديات', m2d: 'أهداف محددة بمدة ومكافآت.', m3: 'التنافس', m3d: 'قارن أداء شركتك بشركات أخرى.', m4: 'السوق المتقلب', m4d: 'أزمات وصدمات أسعار أشدّ.',
      p0: 'العالم الحالي', p0d: 'الحقول والمناطق والمصافي المتاحة في اللعبة الآن.', p1: 'الخليج العربي', p1d: 'حقول عملاقة وصحراء ممتدة.', p2: 'بحر الشمال', p2d: 'منصات بحرية وطقس قاسٍ.', p3: 'سيبيريا', p3d: 'أراضٍ متجمدة وخطوط طويلة.', p4: 'الأمازون', p4d: 'غابات كثيفة وتضاريس صعبة.', p5: 'ألاسكا', p5d: 'ثلوج وأنابيب عبر الجبال.',
      lang: 'اللغة', langD: 'تتغير اللغة بعد إعادة تحميل الواجهة (لن يُمسّ الحفظ).', motion: 'دقة أقل أثناء تحريك الخريطة', motionD: 'يجعل التحريك والتقريب أسلس على الهواتف، وتعود الصورة الحادة عند التوقف.', on: 'مفعّل', off: 'متوقف',
      aboutT: 'حول اللعبة', aboutD: 'OLI EMPIRE لعبة إدارة شركة نفط: ابحث عن الحقول واحفر الآبار، وصِل الأنابيب والمضخات والخزانات، وكرّر الخام وتاجر بالمنتجات وأدر مالية شركتك.', ver: 'النسخة', saveNote: 'يُحفظ تقدمك تلقائياً على هذا الجهاز.',
      rT: 'إعادة تعيين اللعبة؟', rD: 'سيُحذف الحفظ الحالي بالكامل (المباني والأنابيب والأموال) وتبدأ لعبة جديدة. لا يمكن التراجع عن ذلك.', rNo: 'إلغاء', rYes: 'احذف وابدأ من جديد', rDone: 'تمت إعادة التعيين. اضغط «ابدأ اللعبة».', menu: '🏠 القائمة الرئيسية' },
    en: { tag: 'Build Your Oil Empire', contS: 'Resume your progress', startS: 'Begin your oil journey', resetS: 'Start a new game from scratch', cont: 'Continue', start: 'Start game', loading: 'Loading the game…', maps: 'New maps', modes: 'Game modes', reset: 'Reset game', settings: 'Settings', about: 'About', back: 'Back', soon: 'Soon', current: 'Current',
      modesT: 'Game modes', modesS: 'New modes are coming. The open mode is the only one available now.', mapsT: 'New maps', mapsS: 'New maps are coming. The current map is the one available now.',
      m0: 'Open mode', m0d: 'Every building and system is open. Play freely and build your oil empire.', m1: 'Career', m1d: 'Start small and grow through stages and tasks.', m2: 'Challenges', m2d: 'Timed goals with rewards.', m3: 'Competition', m3d: 'Compare your company with others.', m4: 'Volatile market', m4d: 'Harsher crises and price shocks.',
      p0: 'Current world', p0d: 'The fields, regions and refineries available in the game now.', p1: 'Arabian Gulf', p1d: 'Giant fields and endless desert.', p2: 'North Sea', p2d: 'Offshore platforms and harsh weather.', p3: 'Siberia', p3d: 'Frozen land and long pipelines.', p4: 'Amazon', p4d: 'Dense forest and rough terrain.', p5: 'Alaska', p5d: 'Snow and pipes across mountains.',
      lang: 'Language', langD: 'The language changes after the screen reloads (your save is not touched).', motion: 'Lower resolution while moving the map', motionD: 'Makes panning and zooming smoother on phones; the sharp picture returns when you stop.', on: 'On', off: 'Off',
      aboutT: 'About', aboutD: 'OLI EMPIRE is an oil company management game: find fields and drill wells, connect pipes, pumps and tanks, refine crude, trade products and run your company\'s finances.', ver: 'Version', saveNote: 'Your progress is saved automatically on this device.',
      rT: 'Reset the game?', rD: 'The current save (buildings, pipes and money) will be deleted completely and a new game starts. This cannot be undone.', rNo: 'Cancel', rYes: 'Delete and start over', rDone: 'Reset done. Press "Start game".', menu: '🏠 Main menu' }
  }, T = TX[en ? 'en' : 'ar'];

  const I = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
    map: '<svg viewBox="0 0 24 24"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 4v14M15 6v14" stroke="currentColor" stroke-width="1.5"/><circle cx="17.5" cy="8.5" r="2" fill="#f2a63a"/></svg>',
    pad: '<svg viewBox="0 0 24 24"><path d="M7 8h10a4 4 0 014 4v2.2a2.3 2.3 0 01-4 1.5L15 14H9l-2 1.7a2.3 2.3 0 01-4-1.5V12a4 4 0 014-4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8 10.2v2.6M6.7 11.5h2.6" stroke="currentColor" stroke-width="1.5"/><circle cx="15.6" cy="10.8" r=".9" fill="currentColor"/><circle cx="17.6" cy="12.3" r=".9" fill="currentColor"/></svg>',
    reset: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 11-2.6-5.9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><path d="M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zm8.2 4.3v-1.6l-2-.7a6.6 6.6 0 00-.6-1.4l.9-1.9-1.1-1.1-1.9.9a6.6 6.6 0 00-1.4-.6l-.7-2h-1.6l-.7 2a6.6 6.6 0 00-1.4.6l-1.9-.9-1.1 1.1.9 1.9c-.3.4-.5.9-.6 1.4l-2 .7v1.6l2 .7c.1.5.3 1 .6 1.4l-.9 1.9 1.1 1.1 1.9-.9c.4.3.9.5 1.4.6l.7 2h1.6l.7-2c.5-.1 1-.3 1.4-.6l1.9.9 1.1-1.1-.9-1.9c.3-.4.5-.9.6-1.4z" fill="currentColor"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="currentColor"/><path d="M12 11v6M12 7.2v1.3" stroke="#0e1522" stroke-width="2.2" stroke-linecap="round"/></svg>',
    lock: '<svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2.2" fill="currentColor"/><path d="M8 10.5V8a4 4 0 018 0v2.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  const CSS = `
#oli-home{position:fixed;inset:0;z-index:90000;direction:${en ? 'ltr' : 'rtl'};font-family:system-ui,"Segoe UI",Roboto,"Noto Sans Arabic",sans-serif;color:#fff;background:#18223a;overflow:hidden;-webkit-tap-highlight-color:transparent;user-select:none;touch-action:manipulation;transition:opacity .35s}
#oli-home.hide{opacity:0;pointer-events:none}
#oli-home .scene{position:absolute;inset:0;background:linear-gradient(#0b1431,#15224c 30%,#1b1c34)}
#oli-home .scene::before{content:"";position:absolute;left:0;right:0;bottom:0;height:80%;background:url(home-assets/bg.webp) 50% 100%/cover no-repeat;-webkit-mask-image:linear-gradient(transparent,#000 24%);mask-image:linear-gradient(transparent,#000 24%)}
#oli-home .scene::after{content:"";position:absolute;inset:0;background:linear-gradient(rgba(5,10,24,0) 52%,rgba(5,10,24,.38) 62%,rgba(5,10,24,.3) 86%,rgba(5,10,24,0))}
#oli-home .view{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;padding:max(14px,env(safe-area-inset-top)) 16px max(18px,env(safe-area-inset-bottom));overflow-y:auto}
#oli-home .view.on{display:flex}
#oli-home .htop{width:100%;max-width:560px;display:flex;justify-content:space-between;gap:10px}
#oli-home .pill{display:inline-flex;align-items:center;gap:9px;min-height:46px;padding:0 18px;border-radius:24px;background:rgba(18,26,42,.72);border:1.5px solid rgba(255,255,255,.28);color:#fff;font-weight:700;font-size:17px;font-family:inherit;backdrop-filter:blur(3px)}
#oli-home .pill svg{width:26px;height:26px}
#oli-home .pill:active,#oli-home .hb:active{transform:scale(.97)}
#oli-home .hbrand{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;max-width:100%}
#oli-home .hmenu{flex:0 0 auto;width:100%;max-width:520px;display:flex;flex-direction:column}
#oli-home .logo{flex:0 0 auto;width:min(77vw,29.5vh*1.5,366px);height:auto;margin-top:clamp(-22px,-2.4vh,-8px);filter:drop-shadow(0 6px 10px rgba(0,0,0,.55))}
#oli-home .spacer{flex:1 1 20px;min-height:12px}
#oli-home .list{width:100%;max-width:520px;display:flex;flex-direction:column;gap:clamp(8px,1.6vh,16px);padding-bottom:clamp(0px,calc(6vh - 14px),64px)}
#oli-home .hb{position:relative;display:flex;align-items:center;gap:12px;width:100%;min-height:clamp(54px,8.6vh,82px);padding:0 clamp(18px,5vw,30px);border:0;border-radius:999px;background:url(home-assets/btn-navy.webp) 50% 50%/100% 100% no-repeat;color:#fff;font-family:inherit;filter:drop-shadow(0 6px 8px rgba(0,0,0,.55));text-align:center}
#oli-home .hb .ic{flex:0 0 clamp(38px,6vh,56px);height:clamp(38px,6vh,56px);display:flex;align-items:center;justify-content:center;color:#f4cf72;filter:drop-shadow(0 2px 2px rgba(0,0,0,.6))}
#oli-home .hb .ic svg{width:100%;height:100%}
#oli-home .hb .htx{flex:1;display:flex;flex-direction:column;align-items:center;min-width:0}
#oli-home .hb .htx b{font-weight:800;font-size:clamp(19px,3vh,27px);line-height:1.2;text-shadow:0 2px 3px rgba(0,0,0,.6)}
#oli-home .hb .htx small{font-weight:600;font-size:clamp(12px,1.7vh,15px);opacity:.9;line-height:1.25;text-shadow:0 1px 2px rgba(0,0,0,.5)}
#oli-home .hb .soonp{flex:0 0 auto;padding:3px 12px;border-radius:14px;background:linear-gradient(#3a2a0a,#1e1405);border:1.5px solid #e2b94c;color:#ffd978;font-weight:800;font-size:clamp(12px,1.8vh,15px)}
#oli-home .hb.soon{cursor:default}
#oli-home .hb.gold{background-image:url(home-assets/btn-gold.webp);color:#2e1a03}
#oli-home .hb.gold .htx b{text-shadow:0 1px 0 rgba(255,235,170,.7)}
#oli-home .hb.gold .htx small{text-shadow:none;opacity:.85}
#oli-home .hb.gold .ic{color:#2e1a03;filter:none}
#oli-home .hb.red{background-image:url(home-assets/btn-red.webp)}
#oli-home .hb.red .ic{color:#ffe3b0}
#oli-home .hb[disabled]{filter:saturate(.6) brightness(.9) drop-shadow(0 6px 8px rgba(0,0,0,.55))}
#oli-home .hb.load .htx b{animation:ohp 1.2s ease-in-out infinite}
#oli-home .hsubt{margin-top:-2px;padding:clamp(5px,.9vh,9px) clamp(20px,6vw,34px);border-radius:26px;background:linear-gradient(#10141c,#05070b);border:2px solid #d4a640;color:#ffe9b0;font-weight:700;font-style:italic;font-family:Georgia,"Times New Roman",serif;direction:ltr;font-size:clamp(16px,2.6vh,22px);box-shadow:0 4px 10px rgba(0,0,0,.5)}
#oli-home .hb.navy .htx b{color:#fff4d6}
#oli-home .hb .soonp{flex:0 0 auto;padding:3px 12px;border-radius:14px;background:linear-gradient(#3a2a0a,#1e1405);border:1.5px solid #e2b94c;color:#ffd978;font-weight:800;font-size:clamp(12px,1.8vh,15px);position:relative;z-index:1}
#oli-home .hb.gold .htx b{text-shadow:0 1px 0 rgba(255,235,170,.7)}
@keyframes ohp{50%{opacity:.45}}
#oli-home .h1{width:100%;max-width:560px;font-weight:800;font-size:26px;font-family:inherit;margin:14px 0 4px;text-shadow:0 2px 6px rgba(0,0,0,.6)}
#oli-home .hpanel{width:100%;max-width:560px;display:flex;flex-direction:column;gap:12px;padding-bottom:20px}
#oli-home .shake{animation:osh .3s}
@keyframes osh{25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
#oli-home .hrow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px;border-radius:18px;background:rgba(16,24,40,.84);border:1.5px solid rgba(255,255,255,.2)}
#oli-home .hrow .l{flex:1}#oli-home .hrow .t{font-weight:800;font-size:18px;font-family:inherit}#oli-home .hrow .d{font-size:13px;opacity:.78;margin-top:3px;line-height:1.4}
#oli-home .seg{display:flex;border-radius:12px;overflow:hidden;border:1.5px solid rgba(255,255,255,.35)}
#oli-home .seg button{min-height:42px;min-width:84px;border:0;background:#1b2538;color:#fff;font-weight:700;font-size:15px;font-family:inherit}
#oli-home .seg button.on{background:#d9a23c;color:#2e1c02}
#oli-home .about{padding:16px;line-height:1.7;font-size:15.5px;border-radius:18px;background:rgba(16,24,40,.84);border:1.5px solid rgba(255,255,255,.2)}
#oli-home .modal{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(5,8,14,.72);padding:20px;z-index:3}
#oli-home .modal.on{display:flex}
#oli-home .hbox{width:100%;max-width:420px;border-radius:22px;padding:20px;background:#1a2438;border:2px solid #e69a8c;box-shadow:0 12px 30px rgba(0,0,0,.6)}
#oli-home .hbox h3{margin:0 0 8px;font-weight:800;font-size:22px;font-family:inherit}
#oli-home .hbox p{margin:0 0 16px;line-height:1.6;font-size:15.5px;opacity:.9}
#oli-home .hbox .bt{display:flex;gap:10px}
#oli-home .hbox button{flex:1;min-height:50px;border-radius:14px;border:1.5px solid rgba(255,255,255,.35);background:#27344e;color:#fff;font-weight:800;font-size:16px;font-family:inherit}
#oli-home .hbox button.d{background:#9a2f27;border-color:#e69a8c}
#oli-home .hmsg{min-height:20px;font-size:14px;color:#ffd978;text-align:center;margin-bottom:6px}
@media (orientation:landscape) and (max-height:600px){#oli-home .scene::before{height:100%;background-position:50% 24%}#v-main.on{flex-direction:row;flex-wrap:wrap;align-content:flex-start;justify-content:center;column-gap:4vw}#v-main .htop{flex:0 0 100%}#v-main .spacer{display:none}#v-main .hbrand{flex:0 0 40%;margin-top:2vh}#v-main .logo{width:min(38vw,64vh,300px)}#v-main .hmenu{flex:0 0 46%;margin-top:1vh}#oli-home .hb{min-height:46px}#oli-home .hb .htx small{display:none}#oli-home .list{gap:9px}}
`;
  const SCENE = '<div class="scene"></div>';
  const LOGO = '<img class="logo" src="home-assets/logo.webp" alt="OLI EMPIRE" draggable="false">';

  const root = document.createElement('div'); root.id = 'oli-home';
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const btn = (id, cls, ic, tx, sub, soon) => '<button class="hb ' + cls + (soon ? ' soon' : '') + '" id="' + id + '"' + (soon ? ' aria-disabled="true"' : '') + '><span class="ic">' + ic + '</span><span class="htx"><b>' + tx + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</span>' + (soon ? '<span class="soonp">' + T.soon + '</span>' : '') + '</button>';
  const lockI = I.lock;
  root.innerHTML = SCENE
    + '<div class="view on" id="v-main"><div class="htop"><button class="pill" id="h-set">' + I.gear + '<span>' + T.settings + '</span></button><button class="pill" id="h-abt">' + I.info + '<span>' + T.about + '</span></button></div>'
    + '<div class="hbrand">' + LOGO + '<div class="hsubt">' + T.tag + '</div></div><div class="spacer"></div>'
    + '<div class="hmenu"><div class="hmsg" id="h-msg"></div><div class="list">' + btn('h-cont', 'gold load', I.play, T.loading, T.contS) + btn('h-maps', 'navy', I.map, T.maps, '', 1) + btn('h-modes', 'navy', I.pad, T.modes, '', 1) + btn('h-reset', 'red', I.reset, T.reset, T.resetS) + '</div></div></div>'
    + '<div class="view" id="v-set"><div class="htop"><button class="pill back">' + T.back + '</button></div><div class="h1">' + T.settings + '</div><div class="hpanel" style="margin-top:8px">'
    + '<div class="hrow"><div class="l"><div class="t">' + T.lang + '</div><div class="d">' + T.langD + '</div></div><div class="seg" id="s-lang"><button data-l="ar">العربية</button><button data-l="en">English</button></div></div>'
    + '<div class="hrow"><div class="l"><div class="t">' + T.motion + '</div><div class="d">' + T.motionD + '</div></div><div class="seg" id="s-mot"><button data-m="1">' + T.on + '</button><button data-m="0">' + T.off + '</button></div></div></div></div>'
    + '<div class="view" id="v-abt"><div class="htop"><button class="pill back">' + T.back + '</button></div><div class="h1">' + T.aboutT + '</div><div class="hpanel" style="margin-top:8px"><div class="about">' + T.aboutD + '<br><br><b>' + T.ver + ':</b> <span dir="ltr">' + (window.OLI_VERSION || '1.0.0') + '</span><br>' + T.saveNote + '</div></div></div>'
    + '<div class="modal" id="h-modal"><div class="hbox"><h3>' + T.rT + '</h3><p>' + T.rD + '</p><div class="bt"><button id="r-no">' + T.rNo + '</button><button class="d" id="r-yes">' + T.rYes + '</button></div></div></div>';
  document.body.appendChild(root); window.__homeOpen = true;
  const $ = id => document.getElementById(id), views = ['main', 'set', 'abt'];
  const show = v => { for (const n of views) $('v-' + n).classList.toggle('on', n === v); const sc = $('v-' + v); if (sc) sc.scrollTop = 0; };
  root.querySelectorAll('.back').forEach(b => b.onclick = () => show('main'));
  $('h-set').onclick = () => show('set'); $('h-abt').onclick = () => show('abt');
  root.querySelectorAll('.hb.soon').forEach(c => c.onclick = () => { c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); });      // "Soon" buttons are not active: they only shake
  // settings (real options only)
  const seg = (id, on) => root.querySelectorAll('#' + id + ' button').forEach(b => b.classList.toggle('on', on(b)));
  const paint = () => { seg('s-lang', b => (b.dataset.l === 'en') === en); seg('s-mot', b => (b.dataset.m === '1') === !window.OLI_NOMOTION); }; paint();
  root.querySelectorAll('#s-lang button').forEach(b => b.onclick = () => { if ((b.dataset.l === 'en') === en) return; if (b.dataset.l === 'en') LS.set('oli-lang', 'en'); else LS.del('oli-lang'); location.reload(); });
  root.querySelectorAll('#s-mot button').forEach(b => b.onclick = () => { window.OLI_NOMOTION = b.dataset.m === '0'; if (window.OLI_NOMOTION) LS.set('oli-nomotion', '1'); else LS.del('oli-nomotion'); paint(); });
  // the game
  let ready = false, hadSave = false;
  const setCont = () => { const c = $('h-cont'); c.disabled = !ready; c.classList.toggle('load', !ready); c.querySelector('.htx b').textContent = !ready ? T.loading : (hadSave ? T.cont : T.start); c.querySelector('.htx small').textContent = !ready ? '' : (hadSave ? T.contS : T.startS); };
  const cuBusy = () => { const b = document.getElementById('cu-box'); return !!b && b.style.display !== 'none'; };
  const poll = setInterval(() => { const lab = window.__lab; if (lab && lab.restored && !cuBusy() && window.__wp && window.__wp.idle && window.__wp.idle()) { clearInterval(poll); hadSave = lab.restored.from === 'save'; ready = true; setCont(); addMenuButton(); } }, 200); setCont();
  function close() { if (!ready) return; window.__homeOpen = false; root.classList.add('hide'); setTimeout(() => { if (!window.__homeOpen) root.style.display = 'none'; }, 400); if (window.__wp) window.__wp.markDirty(); }
  function open() { show('main'); root.style.display = ''; void root.offsetWidth; root.classList.remove('hide'); window.__homeOpen = true; hadSave = true; setCont(); const es = document.getElementById('eco-sheet'); if (es) es.classList.remove('open'); try { window.__lab.save(); } catch (_) { } }
  $('h-cont').onclick = close;
  $('h-reset').onclick = () => { if (ready) $('h-modal').classList.add('on'); };
  $('r-no').onclick = () => $('h-modal').classList.remove('on');
  $('r-yes').onclick = () => { $('h-modal').classList.remove('on'); try { window.__lab.newGame(); hadSave = false; setCont(); const m = $('h-msg'); m.textContent = T.rDone; setTimeout(() => { m.textContent = ''; }, 6000); } catch (e) { $('h-msg').textContent = String(e && e.message || e); } };
  // a way back to this menu from inside the game (next to the existing "new game" button of the company sheet)
  function addMenuButton() { const top = document.querySelector('#eco-sheet .top'); if (!top || document.getElementById('es-home')) return; const b = document.createElement('button'); b.id = 'es-home'; b.textContent = T.menu; b.style.cssText = 'min-height:40px;margin-inline-start:8px;background:#27344e;border:1px solid #5a6f96;color:#fff;border-radius:8px;padding:0 12px;font:700 13px sans-serif'; b.onclick = open; top.appendChild(b); }
  window.OliHome = { open, close, isOpen: () => !!window.__homeOpen, ready: () => ready };
})();
