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
    ar: { sub: 'Oil Management Game', cont: 'متابعة اللعبة', start: 'ابدأ اللعبة', loading: 'جارٍ تحميل اللعبة…', maps: 'خرائط جديدة', modes: 'أنماط اللعب', reset: 'إعادة تعيين اللعبة', settings: 'الإعدادات', about: 'حول اللعبة', back: 'رجوع', soon: 'قريباً', current: 'الحالي',
      modesT: 'أنماط اللعب', modesS: 'أنماط جديدة قادمة. النمط المفتوح هو الوحيد المتاح الآن.', mapsT: 'خرائط جديدة', mapsS: 'خرائط جديدة قادمة. الخريطة الحالية هي المتاحة الآن.',
      m0: 'الوضع المفتوح', m0d: 'كل المباني والأنظمة مفتوحة. العب بحرية وابنِ إمبراطوريتك النفطية.', m1: 'المسيرة المهنية', m1d: 'ابدأ بشركة صغيرة وتدرّج عبر مراحل ومهام.', m2: 'التحديات', m2d: 'أهداف محددة بمدة ومكافآت.', m3: 'التنافس', m3d: 'قارن أداء شركتك بشركات أخرى.', m4: 'السوق المتقلب', m4d: 'أزمات وصدمات أسعار أشدّ.',
      p0: 'العالم الحالي', p0d: 'الحقول والمناطق والمصافي المتاحة في اللعبة الآن.', p1: 'الخليج العربي', p1d: 'حقول عملاقة وصحراء ممتدة.', p2: 'بحر الشمال', p2d: 'منصات بحرية وطقس قاسٍ.', p3: 'سيبيريا', p3d: 'أراضٍ متجمدة وخطوط طويلة.', p4: 'الأمازون', p4d: 'غابات كثيفة وتضاريس صعبة.', p5: 'ألاسكا', p5d: 'ثلوج وأنابيب عبر الجبال.',
      lang: 'اللغة', langD: 'تتغير اللغة بعد إعادة تحميل الواجهة (لن يُمسّ الحفظ).', motion: 'دقة أقل أثناء تحريك الخريطة', motionD: 'يجعل التحريك والتقريب أسلس على الهواتف، وتعود الصورة الحادة عند التوقف.', on: 'مفعّل', off: 'متوقف',
      aboutT: 'حول اللعبة', aboutD: 'OLI لعبة إدارة شركة نفط: ابحث عن الحقول واحفر الآبار، وصِل الأنابيب والمضخات والخزانات، وكرّر الخام وتاجر بالمنتجات وأدر مالية شركتك.', ver: 'النسخة', saveNote: 'يُحفظ تقدمك تلقائياً على هذا الجهاز.',
      rT: 'إعادة تعيين اللعبة؟', rD: 'سيُحذف الحفظ الحالي بالكامل (المباني والأنابيب والأموال) وتبدأ لعبة جديدة. لا يمكن التراجع عن ذلك.', rNo: 'إلغاء', rYes: 'احذف وابدأ من جديد', rDone: 'تمت إعادة التعيين. اضغط «ابدأ اللعبة».', menu: '🏠 القائمة الرئيسية' },
    en: { sub: 'Oil Management Game', cont: 'Continue', start: 'Start game', loading: 'Loading the game…', maps: 'New maps', modes: 'Game modes', reset: 'Reset game', settings: 'Settings', about: 'About', back: 'Back', soon: 'Soon', current: 'Current',
      modesT: 'Game modes', modesS: 'New modes are coming. The open mode is the only one available now.', mapsT: 'New maps', mapsS: 'New maps are coming. The current map is the one available now.',
      m0: 'Open mode', m0d: 'Every building and system is open. Play freely and build your oil empire.', m1: 'Career', m1d: 'Start small and grow through stages and tasks.', m2: 'Challenges', m2d: 'Timed goals with rewards.', m3: 'Competition', m3d: 'Compare your company with others.', m4: 'Volatile market', m4d: 'Harsher crises and price shocks.',
      p0: 'Current world', p0d: 'The fields, regions and refineries available in the game now.', p1: 'Arabian Gulf', p1d: 'Giant fields and endless desert.', p2: 'North Sea', p2d: 'Offshore platforms and harsh weather.', p3: 'Siberia', p3d: 'Frozen land and long pipelines.', p4: 'Amazon', p4d: 'Dense forest and rough terrain.', p5: 'Alaska', p5d: 'Snow and pipes across mountains.',
      lang: 'Language', langD: 'The language changes after the screen reloads (your save is not touched).', motion: 'Lower resolution while moving the map', motionD: 'Makes panning and zooming smoother on phones; the sharp picture returns when you stop.', on: 'On', off: 'Off',
      aboutT: 'About', aboutD: 'OLI is an oil company management game: find fields and drill wells, connect pipes, pumps and tanks, refine crude, trade products and run your company\'s finances.', ver: 'Version', saveNote: 'Your progress is saved automatically on this device.',
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
#oli-home .scene{position:absolute;inset:0;width:100%;height:100%}
#oli-home .view{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;padding:max(14px,env(safe-area-inset-top)) 16px max(18px,env(safe-area-inset-bottom));overflow-y:auto}
#oli-home .view.on{display:flex}
#oli-home .htop{width:100%;max-width:560px;display:flex;justify-content:space-between;gap:10px}
#oli-home .pill{display:inline-flex;align-items:center;gap:9px;min-height:46px;padding:0 18px;border-radius:24px;background:rgba(18,26,42,.72);border:1.5px solid rgba(255,255,255,.28);color:#fff;font-weight:700;font-size:17px;font-family:inherit;backdrop-filter:blur(3px)}
#oli-home .pill svg{width:26px;height:26px}
#oli-home .pill:active,#oli-home .hb:active{transform:scale(.97)}
#oli-home .hbrand{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;max-width:100%}
#oli-home .hmenu{flex:0 0 auto;width:100%;max-width:520px;display:flex;flex-direction:column}
#oli-home .logo{flex:0 0 auto;width:min(78vw,340px);height:auto;margin-top:2vh;filter:drop-shadow(0 6px 10px rgba(0,0,0,.45))}
#oli-home .spacer{flex:1 1 20px;min-height:12px}
#oli-home .list{width:100%;max-width:520px;display:flex;flex-direction:column;gap:clamp(10px,2vh,18px);padding-bottom:clamp(8px,4vh,40px)}
#oli-home .hb{display:flex;align-items:center;gap:14px;width:100%;min-height:clamp(60px,9vh,82px);padding:0 14px;border-radius:26px;border:2px solid rgba(160,190,230,.55);background:linear-gradient(#34445e,#1c2638 70%);color:#fff;font-weight:800;font-size:clamp(20px,3.2vh,27px);font-family:inherit;box-shadow:0 6px 14px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.25);text-align:center}
#oli-home .hb .ic{flex:0 0 clamp(46px,7vh,60px);height:clamp(46px,7vh,60px);border-radius:50%;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#fff}
#oli-home .hb .ic svg{width:60%;height:60%}
#oli-home .hb .htx{flex:1}
#oli-home .hb .ch{font-size:34px;line-height:1;opacity:.85;transform:none}
#oli-home .hb.gold{border-color:#ffd978;background:linear-gradient(#d9a23c,#9a6418 75%);box-shadow:0 6px 16px rgba(0,0,0,.5),0 0 18px rgba(255,190,70,.35),inset 0 1px 0 rgba(255,255,255,.55);text-shadow:0 2px 3px rgba(60,30,0,.55)}
#oli-home .hb.gold .ic{background:rgba(70,38,6,.55);color:#ffcf6a}
#oli-home .hb.red{border-color:#e69a8c;background:linear-gradient(#8e3a30,#5a1f1a 75%)}
#oli-home .hb[disabled]{filter:saturate(.5) brightness(.85)}
#oli-home .hb.load .htx{animation:ohp 1.2s ease-in-out infinite}
@keyframes ohp{50%{opacity:.45}}
#oli-home .h1{width:100%;max-width:560px;font-weight:800;font-size:26px;font-family:inherit;margin:14px 0 4px;text-shadow:0 2px 6px rgba(0,0,0,.6)}
#oli-home .sub{width:100%;max-width:560px;font-size:15px;opacity:.85;margin-bottom:12px;text-shadow:0 1px 4px rgba(0,0,0,.6)}
#oli-home .hpanel{width:100%;max-width:560px;display:flex;flex-direction:column;gap:12px;padding-bottom:20px}
#oli-home .card{position:relative;display:flex;gap:12px;align-items:center;padding:12px;border-radius:20px;background:rgba(16,24,40,.84);border:1.5px solid rgba(255,255,255,.2);box-shadow:0 4px 12px rgba(0,0,0,.4)}
#oli-home .card.cur{border-color:#ffd978;background:rgba(40,32,14,.88)}
#oli-home .card.soon{filter:grayscale(.55) brightness(.82);cursor:not-allowed}
#oli-home .card .th{flex:0 0 76px;height:76px;border-radius:16px;display:flex;align-items:center;justify-content:center;color:#fff;border:1.5px solid rgba(255,255,255,.3);overflow:hidden}
#oli-home .card .th svg{width:46px;height:46px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}
#oli-home .card .bd{flex:1;min-width:0}
#oli-home .card .hnm{font-weight:800;font-size:19px;font-family:inherit}
#oli-home .card .ds{font-size:13.5px;opacity:.82;margin-top:3px;line-height:1.4}
#oli-home .tag{position:absolute;top:10px;${en ? 'right' : 'left'}:10px;display:flex;align-items:center;gap:5px;padding:3px 11px;border-radius:12px;font-weight:800;font-size:13px;font-family:inherit}
#oli-home .tag svg{width:14px;height:14px}
#oli-home .tag.soon{background:#2d3b55;color:#cfe0ff;border:1px solid rgba(190,210,255,.5)}
#oli-home .tag.cur{background:#ffd978;color:#3a2504}
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
@media (orientation:landscape) and (max-height:600px){#v-main.on{flex-direction:row;flex-wrap:wrap;align-content:flex-start;justify-content:center;column-gap:4vw}#v-main .htop{flex:0 0 100%}#v-main .spacer{display:none}#v-main .hbrand{flex:0 0 40%;margin-top:2vh}#v-main .logo{width:min(34vw,250px)}#v-main .hmenu{flex:0 0 46%;margin-top:1vh}#oli-home .hb{min-height:50px;font-size:19px}#oli-home .list{gap:9px}}
`;
  const SCENE = `<svg class="scene" viewBox="-300 0 1000 800" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><defs>
<linearGradient id="hsk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#27385e"/><stop offset=".38" stop-color="#6e6486"/><stop offset=".6" stop-color="#d98a62"/><stop offset=".74" stop-color="#f5bd72"/></linearGradient>
<radialGradient id="hsun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff1c2"/><stop offset=".35" stop-color="#ffd27a" stop-opacity=".75"/><stop offset="1" stop-color="#ffb35a" stop-opacity="0"/></radialGradient>
<linearGradient id="hd1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c98d5a"/><stop offset="1" stop-color="#8b5a35"/></linearGradient>
<linearGradient id="hd2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a87245"/><stop offset="1" stop-color="#5e3b24"/></linearGradient>
<linearGradient id="hpipe" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7d8794"/><stop offset=".25" stop-color="#d6dce4"/><stop offset=".55" stop-color="#8a94a1"/><stop offset="1" stop-color="#3b424c"/></linearGradient>
<linearGradient id="htw" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8d96a3"/><stop offset=".45" stop-color="#e2e7ee"/><stop offset="1" stop-color="#6c7582"/></linearGradient></defs>
<rect x="-300" width="1000" height="800" fill="url(#hsk)"/><g transform="translate(0,-95)"><circle cx="214" cy="470" r="150" fill="url(#hsun)"/>
<path d="M-300 560 H0 Q70 520 130 548 T260 540 T400 556 H700 V930 H-300z" fill="#6f4a52" opacity=".75"/>
<path d="M-300 585 H0 Q90 560 170 588 T400 580 H700 V930 H-300z" fill="url(#hd1)"/>
<g fill="#2c1d1a" opacity=".92"><path d="M20 610 l26-62 h8 l-26 62z M38 548 l22 62" stroke="#2c1d1a" stroke-width="3" fill="none"/><path d="M6 548 h70 l8 -10 h8 l-6 16 h-80z"/><rect x="58" y="520" width="3" height="30"/><path d="M52 520 q22 -34 58 -26 l0 6 q-34 -6 -52 22z"/><circle cx="26" cy="556" r="11"/></g>
<g><rect x="302" y="500" width="30" height="96" rx="4" fill="url(#htw)"/><rect x="340" y="470" width="24" height="126" rx="4" fill="url(#htw)"/><rect x="370" y="520" width="26" height="76" rx="4" fill="url(#htw)"/><rect x="272" y="535" width="22" height="61" rx="3" fill="url(#htw)"/>
<g stroke="#4a525d" stroke-width="2" opacity=".8"><path d="M302 520h30M302 540h30M340 490h24M340 520h24M340 550h24M370 545h26"/></g><rect x="346" y="440" width="12" height="34" fill="#6c7582"/><rect x="350" y="418" width="4" height="26" fill="#6c7582"/><circle cx="352" cy="414" r="4" fill="#ff9a3a"/><rect x="316" y="478" width="8" height="26" fill="#6c7582"/></g>
<path d="M-300 640 H0 Q120 612 240 636 T400 630 H700 V930 H-300z" fill="url(#hd2)"/>
<g opacity=".55" fill="#3d5030"><path d="M250 632l5-16 4 16zM262 634l4-12 3 12zM110 650l4-14 4 14z"/></g>
</g><rect x="-300" y="700" width="1000" height="70" rx="10" fill="url(#hpipe)"/><rect x="40" y="696" width="14" height="78" rx="3" fill="#b88a3a" opacity=".9"/><rect x="250" y="696" width="14" height="78" rx="3" fill="#b88a3a" opacity=".9"/>
<rect x="-300" y="760" width="1000" height="60" fill="#241913" opacity=".55"/></svg>`;
  const LOGO = `<svg class="logo" viewBox="0 0 360 215" aria-label="OLI"><defs>
<linearGradient id="hg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0b0"/><stop offset=".35" stop-color="#f6c75a"/><stop offset=".7" stop-color="#c8872a"/><stop offset="1" stop-color="#8a5412"/></linearGradient>
<linearGradient id="hd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a0"/><stop offset="1" stop-color="#e49a2a"/></linearGradient></defs>
<g transform="translate(4,28)"><circle cx="86" cy="86" r="76" fill="url(#hg)"/><circle cx="86" cy="86" r="58" fill="#10151f"/><circle cx="86" cy="86" r="58" fill="none" stroke="#6b4a14" stroke-width="3"/>
<path d="M86 42c-18 28-27 42-27 58a27 27 0 0054 0c0-16-9-30-27-58z" fill="url(#hd)"/><path d="M72 104a14 14 0 008 14" stroke="#fff6cc" stroke-width="4" fill="none" stroke-linecap="round" opacity=".85"/></g>
<g fill="url(#hg)" stroke="#6b4a14" stroke-width="2.2" stroke-linejoin="round"><path d="M192 56h30v94h56v30h-86z"/><path d="M296 56h30v124h-30z"/></g>
<g stroke="#f4cf72" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M299 55l8-38h12l8 38M302 42h20M304 30h16M308 20h8"/><circle cx="313" cy="11" r="4" fill="#f4cf72"/></g>
<path d="M30 192q120 20 300-18" stroke="#f0b94a" stroke-width="4" fill="none" stroke-linecap="round" opacity=".9"/></svg>`;

  const root = document.createElement('div'); root.id = 'oli-home';
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const btn = (id, cls, ic, tx) => '<button class="hb ' + cls + '" id="' + id + '"><span class="ic">' + ic + '</span><span class="htx">' + tx + '</span><span class="ch">›</span></button>';
  const th = (g, svg) => '<div class="th" style="background:' + g + '">' + svg + '</div>';
  const card = (cls, g, svg, nm, ds, tag) => '<div class="card ' + cls + '" ' + (cls.indexOf('soon') >= 0 ? 'aria-disabled="true"' : '') + '>' + th(g, svg) + '<div class="bd"><div class="hnm">' + nm + '</div><div class="ds">' + ds + '</div></div>' + tag + '</div>';
  const soonTag = '<span class="tag soon">' + I.lock + T.soon + '</span>', curTag = '<span class="tag cur">' + I.check + T.current + '</span>';
  const mi = { open: '<svg viewBox="0 0 24 24"><path d="M12 3c-3.5 5-5.5 7.800-5.500 11a5.500 5.500 0 0011 0c0-3.200-2-6-5.500-11z" fill="currentColor"/></svg>', career: '<svg viewBox="0 0 24 24"><path d="M4 19V9l4 4 4-7 4 6 4-3v10z" fill="currentColor"/></svg>', chal: '<svg viewBox="0 0 24 24"><path d="M7 4h10v4a5 5 0 01-10 0zM5 5H3v2a3 3 0 003 3M19 5h2v2a3 3 0 01-3 3M12 13v4M8 20h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>', comp: '<svg viewBox="0 0 24 24"><circle cx="8" cy="9" r="3" fill="currentColor"/><circle cx="16.500" cy="9" r="3" fill="currentColor" opacity=".7"/><path d="M2.500 19a5.500 5.500 0 0111 0zM13 19a5 5 0 0110 0z" fill="currentColor"/></svg>', mkt: '<svg viewBox="0 0 24 24"><path d="M3 17l5-6 4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 6h5v5" fill="none" stroke="currentColor" stroke-width="2.200"/></svg>' };
  const GR = ['linear-gradient(135deg,#e0a53c,#8a5412)', 'linear-gradient(135deg,#3d6aa8,#1d2f55)', 'linear-gradient(135deg,#6a4aa8,#2d1f55)', 'linear-gradient(135deg,#2f8a6a,#14443a)', 'linear-gradient(135deg,#a8483d,#4a1d18)'];
  const PG = ['linear-gradient(135deg,#d9a35a,#6c8a4a)', 'linear-gradient(135deg,#e6b86a,#a8643a)', 'linear-gradient(135deg,#4a7ea8,#1d3a55)', 'linear-gradient(135deg,#cfe0ea,#6c8aa8)', 'linear-gradient(135deg,#3f8a4a,#154a24)', 'linear-gradient(135deg,#dfe8f0,#7a8fa8)'];
  const pin = '<svg viewBox="0 0 24 24"><path d="M12 2.500a6.500 6.500 0 00-6.500 6.500c0 5 6.500 12.500 6.500 12.500S18.500 14 18.500 9A6.500 6.500 0 0012 2.500z" fill="currentColor"/><circle cx="12" cy="9" r="2.500" fill="#0e1522"/></svg>';
  root.innerHTML = SCENE
    + '<div class="view on" id="v-main"><div class="htop"><button class="pill" id="h-set">' + I.gear + '<span>' + T.settings + '</span></button><button class="pill" id="h-abt">' + I.info + '<span>' + T.about + '</span></button></div>'
    + '<div class="hbrand">' + LOGO + '<div class="hsubt" style="margin-top:-6px;padding:6px 22px;border-radius:20px;background:rgba(20,28,44,.78);border:1.5px solid rgba(255,255,255,.22);font-weight:700;font-size:19px;font-family:system-ui,sans-serif;letter-spacing:.3px;direction:ltr">' + T.sub + '</div></div><div class="spacer"></div>'
    + '<div class="hmenu"><div class="hmsg" id="h-msg"></div><div class="list">' + btn('h-cont', 'gold load', I.play, T.loading) + btn('h-maps', '', I.map, T.maps) + btn('h-modes', '', I.pad, T.modes) + btn('h-reset', 'red', I.reset, T.reset) + '</div></div></div>'
    + '<div class="view" id="v-modes"><div class="htop"><button class="pill back">' + T.back + '</button></div><div class="h1">' + T.modesT + '</div><div class="sub">' + T.modesS + '</div><div class="hpanel">'
    + card('cur', GR[0], mi.open, T.m0, T.m0d, curTag) + card('soon', GR[1], mi.career, T.m1, T.m1d, soonTag) + card('soon', GR[2], mi.chal, T.m2, T.m2d, soonTag) + card('soon', GR[3], mi.comp, T.m3, T.m3d, soonTag) + card('soon', GR[4], mi.mkt, T.m4, T.m4d, soonTag) + '</div></div>'
    + '<div class="view" id="v-maps"><div class="htop"><button class="pill back">' + T.back + '</button></div><div class="h1">' + T.mapsT + '</div><div class="sub">' + T.mapsS + '</div><div class="hpanel">'
    + card('cur', PG[0], pin, T.p0, T.p0d, curTag) + [1, 2, 3, 4, 5].map(i => card('soon', PG[i], pin, T['p' + i], T['p' + i + 'd'], soonTag)).join('') + '</div></div>'
    + '<div class="view" id="v-set"><div class="htop"><button class="pill back">' + T.back + '</button></div><div class="h1">' + T.settings + '</div><div class="hpanel" style="margin-top:8px">'
    + '<div class="hrow"><div class="l"><div class="t">' + T.lang + '</div><div class="d">' + T.langD + '</div></div><div class="seg" id="s-lang"><button data-l="ar">العربية</button><button data-l="en">English</button></div></div>'
    + '<div class="hrow"><div class="l"><div class="t">' + T.motion + '</div><div class="d">' + T.motionD + '</div></div><div class="seg" id="s-mot"><button data-m="1">' + T.on + '</button><button data-m="0">' + T.off + '</button></div></div></div></div>'
    + '<div class="view" id="v-abt"><div class="htop"><button class="pill back">' + T.back + '</button></div><div class="h1">' + T.aboutT + '</div><div class="hpanel" style="margin-top:8px"><div class="about">' + T.aboutD + '<br><br><b>' + T.ver + ':</b> <span dir="ltr">' + (window.OLI_VERSION || '1.0.0') + '</span><br>' + T.saveNote + '</div></div></div>'
    + '<div class="modal" id="h-modal"><div class="hbox"><h3>' + T.rT + '</h3><p>' + T.rD + '</p><div class="bt"><button id="r-no">' + T.rNo + '</button><button class="d" id="r-yes">' + T.rYes + '</button></div></div></div>';
  document.body.appendChild(root); window.__homeOpen = true;
  const $ = id => document.getElementById(id), views = ['main', 'modes', 'maps', 'set', 'abt'];
  const show = v => { for (const n of views) $('v-' + n).classList.toggle('on', n === v); const sc = $('v-' + v); if (sc) sc.scrollTop = 0; };
  root.querySelectorAll('.back').forEach(b => b.onclick = () => show('main'));
  $('h-set').onclick = () => show('set'); $('h-abt').onclick = () => show('abt'); $('h-maps').onclick = () => show('maps'); $('h-modes').onclick = () => show('modes');
  root.querySelectorAll('.card.soon').forEach(c => c.onclick = () => { c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); });      // "Soon" cards cannot be opened: they only shake
  // settings (real options only)
  const seg = (id, on) => root.querySelectorAll('#' + id + ' button').forEach(b => b.classList.toggle('on', on(b)));
  const paint = () => { seg('s-lang', b => (b.dataset.l === 'en') === en); seg('s-mot', b => (b.dataset.m === '1') === !window.OLI_NOMOTION); }; paint();
  root.querySelectorAll('#s-lang button').forEach(b => b.onclick = () => { if ((b.dataset.l === 'en') === en) return; if (b.dataset.l === 'en') LS.set('oli-lang', 'en'); else LS.del('oli-lang'); location.reload(); });
  root.querySelectorAll('#s-mot button').forEach(b => b.onclick = () => { window.OLI_NOMOTION = b.dataset.m === '0'; if (window.OLI_NOMOTION) LS.set('oli-nomotion', '1'); else LS.del('oli-nomotion'); paint(); });
  // the game
  let ready = false, hadSave = false;
  const setCont = () => { const c = $('h-cont'); c.disabled = !ready; c.classList.toggle('load', !ready); c.querySelector('.htx').textContent = !ready ? T.loading : (hadSave ? T.cont : T.start); };
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
