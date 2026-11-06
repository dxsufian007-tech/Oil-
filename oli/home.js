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
    ar: { tag: 'ابنِ إمبراطوريتك النفطية', contS: 'إكمال تقدمك', startS: 'ابدأ رحلتك النفطية', resetS: 'بدء لعبة جديدة من الصفر', sub: 'Oil Management Game', cont: 'متابعة اللعبة', start: 'ابدأ اللعبة', loading: 'جارٍ تحميل اللعبة…', maps: 'خرائط جديدة', modes: 'أنماط اللعب', reset: 'إعادة تعيين اللعبة', settings: 'الإعدادات', about: 'حول اللعبة', back: 'رجوع', soon: 'قريباً', current: 'الحالي',
      modesT: 'أنماط اللعب', modesS: 'أنماط جديدة قادمة. النمط المفتوح هو الوحيد المتاح الآن.', mapsT: 'خرائط جديدة', mapsS: 'خرائط جديدة قادمة. الخريطة الحالية هي المتاحة الآن.',
      m0: 'الوضع المفتوح', m0d: 'كل المباني والأنظمة مفتوحة. العب بحرية وابنِ إمبراطوريتك النفطية.', m1: 'المسيرة المهنية', m1d: 'ابدأ بشركة صغيرة وتدرّج عبر مراحل ومهام.', m2: 'التحديات', m2d: 'أهداف محددة بمدة ومكافآت.', m3: 'التنافس', m3d: 'قارن أداء شركتك بشركات أخرى.', m4: 'السوق المتقلب', m4d: 'أزمات وصدمات أسعار أشدّ.',
      p0: 'العالم الحالي', p0d: 'الحقول والمناطق والمصافي المتاحة في اللعبة الآن.', p1: 'الخليج العربي', p1d: 'حقول عملاقة وصحراء ممتدة.', p2: 'بحر الشمال', p2d: 'منصات بحرية وطقس قاسٍ.', p3: 'سيبيريا', p3d: 'أراضٍ متجمدة وخطوط طويلة.', p4: 'الأمازون', p4d: 'غابات كثيفة وتضاريس صعبة.', p5: 'ألاسكا', p5d: 'ثلوج وأنابيب عبر الجبال.',
      lang: 'اللغة', langD: 'تتغير اللغة بعد إعادة تحميل الواجهة (لن يُمسّ الحفظ).', motion: 'دقة أقل أثناء تحريك الخريطة', motionD: 'يجعل التحريك والتقريب أسلس على الهواتف، وتعود الصورة الحادة عند التوقف.', on: 'مفعّل', off: 'متوقف',
      aboutT: 'حول اللعبة', aboutD: 'OLI لعبة إدارة شركة نفط: ابحث عن الحقول واحفر الآبار، وصِل الأنابيب والمضخات والخزانات، وكرّر الخام وتاجر بالمنتجات وأدر مالية شركتك.', ver: 'النسخة', saveNote: 'يُحفظ تقدمك تلقائياً على هذا الجهاز.',
      rT: 'إعادة تعيين اللعبة؟', rD: 'سيُحذف الحفظ الحالي بالكامل (المباني والأنابيب والأموال) وتبدأ لعبة جديدة. لا يمكن التراجع عن ذلك.', rNo: 'إلغاء', rYes: 'احذف وابدأ من جديد', rDone: 'تمت إعادة التعيين. اضغط «ابدأ اللعبة».', menu: '🏠 القائمة الرئيسية' },
    en: { tag: 'Build your oil empire', contS: 'Resume your progress', startS: 'Begin your oil journey', resetS: 'Start a new game from scratch', sub: 'Oil Management Game', cont: 'Continue', start: 'Start game', loading: 'Loading the game…', maps: 'New maps', modes: 'Game modes', reset: 'Reset game', settings: 'Settings', about: 'About', back: 'Back', soon: 'Soon', current: 'Current',
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
#oli-home .logo{flex:0 0 auto;width:min(86vw,39vh,400px);height:auto;margin-top:0;filter:drop-shadow(0 6px 10px rgba(0,0,0,.45))}
#oli-home .spacer{flex:1 1 20px;min-height:12px}
#oli-home .list{width:100%;max-width:520px;display:flex;flex-direction:column;gap:clamp(8px,1.6vh,16px);padding-bottom:clamp(4px,2vh,24px)}
#oli-home .hb{position:relative;overflow:hidden;display:flex;align-items:center;gap:12px;width:100%;min-height:clamp(50px,8vh,78px);padding:0 12px;border-radius:30px;border:2px solid #d4a640;background:linear-gradient(#27498a,#0f2248 78%);color:#fff;font-family:inherit;box-shadow:0 6px 14px rgba(0,0,0,.55),inset 0 2px 0 rgba(255,255,255,.28),inset 0 -3px 6px rgba(0,0,0,.35);text-align:center}
#oli-home .hb::after{content:"";position:absolute;inset:3px 3px auto;height:42%;border-radius:26px 26px 40% 40%;background:linear-gradient(rgba(255,255,255,.2),rgba(255,255,255,0));pointer-events:none}
#oli-home .hb .ic{flex:0 0 clamp(40px,6.4vh,58px);height:clamp(40px,6.4vh,58px);border-radius:50%;background:radial-gradient(#142a55,#0a1428);border:2px solid #e2b94c;display:flex;align-items:center;justify-content:center;color:#f4cf72}
#oli-home .hb .ic svg{width:58%;height:58%}
#oli-home .hb .htx{flex:1;display:flex;flex-direction:column;align-items:center;min-width:0}
#oli-home .hb .htx b{font-weight:800;font-size:clamp(19px,3vh,27px);line-height:1.2;text-shadow:0 2px 3px rgba(0,0,0,.5)}
#oli-home .hb .htx small{font-weight:600;font-size:clamp(12px,1.7vh,15px);opacity:.85;line-height:1.25}
#oli-home .hb.navy .htx b{color:#fff4d6}
#oli-home .hb .soonp{flex:0 0 auto;padding:3px 12px;border-radius:14px;background:linear-gradient(#3a2a0a,#1e1405);border:1.5px solid #e2b94c;color:#ffd978;font-weight:800;font-size:clamp(12px,1.8vh,15px);position:relative;z-index:1}
#oli-home .hb.soon{cursor:default;filter:saturate(.85) brightness(.93)}
#oli-home .hb.gold{border-color:#ffe08a;background:linear-gradient(#f3c25a,#b9791f 55%,#8a5410);color:#2e1a03;box-shadow:0 6px 16px rgba(0,0,0,.55),0 0 20px rgba(255,190,70,.4),inset 0 2px 0 rgba(255,255,255,.65),inset 0 -3px 6px rgba(80,40,0,.4)}
#oli-home .hb.gold .htx b{text-shadow:0 1px 0 rgba(255,235,170,.7)}
#oli-home .hb.gold .ic{background:radial-gradient(#3d2306,#1d1003);border-color:#ffe08a;color:#ffd978}
#oli-home .hb .deco{position:absolute;bottom:0;${en ? 'right' : 'left'}:6%;height:78%;width:auto;opacity:.32;color:#2e1a03;pointer-events:none}
#oli-home .hb.red{border-color:#f0b27a;background:linear-gradient(#d44a33,#8e231a 60%,#5e130e)}
#oli-home .hb.red .ic{background:radial-gradient(#7a1c14,#3c0c08);border-color:#f0b27a;color:#ffe3b0}
#oli-home .hb[disabled]{filter:saturate(.55) brightness(.88)}
#oli-home .hb.load .htx b{animation:ohp 1.2s ease-in-out infinite}
#oli-home .hsubt{margin-top:-4px;padding:clamp(5px,.9vh,9px) clamp(20px,6vw,34px);border-radius:26px;background:linear-gradient(#10141c,#05070b);border:2px solid #d4a640;color:#ffe9b0;font-weight:800;font-size:clamp(16px,2.6vh,22px);box-shadow:0 4px 10px rgba(0,0,0,.5)}
#oli-home .rock{transform-origin:0 0;animation:ork 3.2s ease-in-out infinite}
@keyframes ork{50%{transform:rotate(-5deg)}}
@media (prefers-reduced-motion:reduce){#oli-home .rock{animation:none}}
#oli-home .hb.load .htx{animation:ohp 1.2s ease-in-out infinite}
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
@media (orientation:landscape) and (max-height:600px){#v-main.on{flex-direction:row;flex-wrap:wrap;align-content:flex-start;justify-content:center;column-gap:4vw}#v-main .htop{flex:0 0 100%}#v-main .spacer{display:none}#v-main .hbrand{flex:0 0 40%;margin-top:2vh}#v-main .logo{width:min(38vw,64vh,300px)}#v-main .hmenu{flex:0 0 46%;margin-top:1vh}#oli-home .hb{min-height:46px}#oli-home .hb .htx small{display:none}#oli-home .list{gap:9px}}
`;
  const SCENE = `<svg class="scene" viewBox="0 0 450 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><defs>
<linearGradient id="hsk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16244a"/><stop offset=".3" stop-color="#3a3f78"/><stop offset=".48" stop-color="#9a5f7e"/><stop offset=".62" stop-color="#ee9a5e"/><stop offset=".72" stop-color="#ffc874"/></linearGradient>
<radialGradient id="hsun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff4cc"/><stop offset=".3" stop-color="#ffd27a" stop-opacity=".8"/><stop offset="1" stop-color="#ffa84a" stop-opacity="0"/></radialGradient>
<linearGradient id="hmt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6c5a82"/><stop offset="1" stop-color="#b9788a"/></linearGradient>
<linearGradient id="hmt2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4b3e66"/><stop offset="1" stop-color="#8d5a72"/></linearGradient>
<linearGradient id="hgr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a5a3a"/><stop offset="1" stop-color="#2b1a14"/></linearGradient>
<linearGradient id="hpipe" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a525d"/><stop offset=".18" stop-color="#e9edf2"/><stop offset=".4" stop-color="#a9b2bd"/><stop offset=".75" stop-color="#4a525d"/><stop offset="1" stop-color="#20252c"/></linearGradient>
<linearGradient id="htw" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6c7582"/><stop offset=".4" stop-color="#eef2f7"/><stop offset=".7" stop-color="#aab3bf"/><stop offset="1" stop-color="#555d69"/></linearGradient>
<linearGradient id="htk" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5f6874"/><stop offset=".35" stop-color="#f3f6fa"/><stop offset=".65" stop-color="#b4bdc8"/><stop offset="1" stop-color="#4c545f"/></linearGradient>
<linearGradient id="hbr" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0b0b0d"/><stop offset=".4" stop-color="#4a4d54"/><stop offset=".7" stop-color="#1a1b1f"/><stop offset="1" stop-color="#050506"/></linearGradient>
<linearGradient id="hgd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a0"/><stop offset=".5" stop-color="#d49a32"/><stop offset="1" stop-color="#7a4c10"/></linearGradient>
<linearGradient id="hor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8a24a"/><stop offset="1" stop-color="#8c4a14"/></linearGradient></defs>
<rect x="-120" width="690" height="900" fill="url(#hsk)"/>
<g fill="#ffb27a" opacity=".5"><ellipse cx="70" cy="190" rx="90" ry="12"/><ellipse cx="120" cy="214" rx="120" ry="10"/><ellipse cx="380" cy="130" rx="100" ry="11"/><ellipse cx="340" cy="156" rx="90" ry="8"/><ellipse cx="40" cy="330" rx="80" ry="9"/></g>
<g fill="#ffe0a8" opacity=".25"><ellipse cx="90" cy="420" rx="110" ry="8"/><ellipse cx="400" cy="400" rx="90" ry="7"/></g>
<g fill="#fff" opacity=".7"><circle cx="40" cy="60" r="1.2"/><circle cx="130" cy="30" r="1"/><circle cx="260" cy="70" r="1.2"/><circle cx="410" cy="40" r="1"/><circle cx="330" cy="100" r="1"/><circle cx="70" cy="120" r="1"/></g>
<rect x="-120" y="560" width="690" height="340" fill="url(#hgr)"/><g transform="translate(0,-150)"><circle cx="110" cy="590" r="170" fill="url(#hsun)"/><circle cx="110" cy="596" r="26" fill="#fff0c0"/>
<path d="M-120 580 L-60 560 L0 600 L70 548 L120 574 L190 520 L250 566 L320 540 L450 590 L500 560 L570 590 V700 H-120z" fill="url(#hmt)"/>
<path d="M-120 620 L0 630 L90 596 L170 622 L260 584 L340 620 L450 600 L570 625 V720 H-120z" fill="url(#hmt2)"/>
<path d="M-120 650 H0 Q120 626 230 646 T450 640 H570 V760 H-120z" fill="url(#hgr)"/>
<g><rect x="360" y="372" width="26" height="288" rx="3" fill="url(#htw)"/><rect x="357" y="386" width="32" height="5" fill="#59616d"/><circle cx="359.0" cy="383" r="1.7" fill="#ffd36a"/><circle cx="369.0" cy="383" r="1.7" fill="#ffd36a"/><circle cx="379.0" cy="383" r="1.7" fill="#ffd36a"/><circle cx="389.0" cy="383" r="1.7" fill="#ffd36a"/><rect x="357" y="420" width="32" height="5" fill="#59616d"/><circle cx="359.0" cy="417" r="1.7" fill="#ffd36a"/><circle cx="369.0" cy="417" r="1.7" fill="#ffd36a"/><circle cx="379.0" cy="417" r="1.7" fill="#ffd36a"/><circle cx="389.0" cy="417" r="1.7" fill="#ffd36a"/><rect x="357" y="454" width="32" height="5" fill="#59616d"/><circle cx="359.0" cy="451" r="1.7" fill="#ffd36a"/><circle cx="369.0" cy="451" r="1.7" fill="#ffd36a"/><circle cx="379.0" cy="451" r="1.7" fill="#ffd36a"/><circle cx="389.0" cy="451" r="1.7" fill="#ffd36a"/><rect x="357" y="488" width="32" height="5" fill="#59616d"/><circle cx="359.0" cy="485" r="1.7" fill="#ffd36a"/><circle cx="369.0" cy="485" r="1.7" fill="#ffd36a"/><circle cx="379.0" cy="485" r="1.7" fill="#ffd36a"/><circle cx="389.0" cy="485" r="1.7" fill="#ffd36a"/><rect x="357" y="522" width="32" height="5" fill="#59616d"/><circle cx="359.0" cy="519" r="1.7" fill="#ffd36a"/><circle cx="369.0" cy="519" r="1.7" fill="#ffd36a"/><circle cx="379.0" cy="519" r="1.7" fill="#ffd36a"/><circle cx="389.0" cy="519" r="1.7" fill="#ffd36a"/><rect x="357" y="556" width="32" height="5" fill="#59616d"/><circle cx="359.0" cy="553" r="1.7" fill="#ffd36a"/><circle cx="369.0" cy="553" r="1.7" fill="#ffd36a"/><circle cx="379.0" cy="553" r="1.7" fill="#ffd36a"/><circle cx="389.0" cy="553" r="1.7" fill="#ffd36a"/><rect x="357" y="590" width="32" height="5" fill="#59616d"/><circle cx="359.0" cy="587" r="1.7" fill="#ffd36a"/><circle cx="369.0" cy="587" r="1.7" fill="#ffd36a"/><circle cx="379.0" cy="587" r="1.7" fill="#ffd36a"/><circle cx="389.0" cy="587" r="1.7" fill="#ffd36a"/><rect x="357" y="624" width="32" height="5" fill="#59616d"/><circle cx="359.0" cy="621" r="1.7" fill="#ffd36a"/><circle cx="369.0" cy="621" r="1.7" fill="#ffd36a"/><circle cx="379.0" cy="621" r="1.7" fill="#ffd36a"/><circle cx="389.0" cy="621" r="1.7" fill="#ffd36a"/><rect x="402" y="430" width="22" height="230" rx="3" fill="url(#htw)"/><rect x="399" y="444" width="28" height="5" fill="#59616d"/><circle cx="401.0" cy="441" r="1.7" fill="#ffd36a"/><circle cx="409.6666666666667" cy="441" r="1.7" fill="#ffd36a"/><circle cx="418.3333333333333" cy="441" r="1.7" fill="#ffd36a"/><circle cx="427.0" cy="441" r="1.7" fill="#ffd36a"/><rect x="399" y="478" width="28" height="5" fill="#59616d"/><circle cx="401.0" cy="475" r="1.7" fill="#ffd36a"/><circle cx="409.6666666666667" cy="475" r="1.7" fill="#ffd36a"/><circle cx="418.3333333333333" cy="475" r="1.7" fill="#ffd36a"/><circle cx="427.0" cy="475" r="1.7" fill="#ffd36a"/><rect x="399" y="512" width="28" height="5" fill="#59616d"/><circle cx="401.0" cy="509" r="1.7" fill="#ffd36a"/><circle cx="409.6666666666667" cy="509" r="1.7" fill="#ffd36a"/><circle cx="418.3333333333333" cy="509" r="1.7" fill="#ffd36a"/><circle cx="427.0" cy="509" r="1.7" fill="#ffd36a"/><rect x="399" y="546" width="28" height="5" fill="#59616d"/><circle cx="401.0" cy="543" r="1.7" fill="#ffd36a"/><circle cx="409.6666666666667" cy="543" r="1.7" fill="#ffd36a"/><circle cx="418.3333333333333" cy="543" r="1.7" fill="#ffd36a"/><circle cx="427.0" cy="543" r="1.7" fill="#ffd36a"/><rect x="399" y="580" width="28" height="5" fill="#59616d"/><circle cx="401.0" cy="577" r="1.7" fill="#ffd36a"/><circle cx="409.6666666666667" cy="577" r="1.7" fill="#ffd36a"/><circle cx="418.3333333333333" cy="577" r="1.7" fill="#ffd36a"/><circle cx="427.0" cy="577" r="1.7" fill="#ffd36a"/><rect x="399" y="614" width="28" height="5" fill="#59616d"/><circle cx="401.0" cy="611" r="1.7" fill="#ffd36a"/><circle cx="409.6666666666667" cy="611" r="1.7" fill="#ffd36a"/><circle cx="418.3333333333333" cy="611" r="1.7" fill="#ffd36a"/><circle cx="427.0" cy="611" r="1.7" fill="#ffd36a"/><rect x="332" y="520" width="18" height="140" rx="3" fill="url(#htw)"/><rect x="329" y="534" width="24" height="5" fill="#59616d"/><circle cx="331.0" cy="531" r="1.7" fill="#ffd36a"/><circle cx="338.3333333333333" cy="531" r="1.7" fill="#ffd36a"/><circle cx="345.6666666666667" cy="531" r="1.7" fill="#ffd36a"/><circle cx="353.0" cy="531" r="1.7" fill="#ffd36a"/><rect x="329" y="568" width="24" height="5" fill="#59616d"/><circle cx="331.0" cy="565" r="1.7" fill="#ffd36a"/><circle cx="338.3333333333333" cy="565" r="1.7" fill="#ffd36a"/><circle cx="345.6666666666667" cy="565" r="1.7" fill="#ffd36a"/><circle cx="353.0" cy="565" r="1.7" fill="#ffd36a"/><rect x="329" y="602" width="24" height="5" fill="#59616d"/><circle cx="331.0" cy="599" r="1.7" fill="#ffd36a"/><circle cx="338.3333333333333" cy="599" r="1.7" fill="#ffd36a"/><circle cx="345.6666666666667" cy="599" r="1.7" fill="#ffd36a"/><circle cx="353.0" cy="599" r="1.7" fill="#ffd36a"/><rect x="329" y="636" width="24" height="5" fill="#59616d"/><circle cx="331.0" cy="633" r="1.7" fill="#ffd36a"/><circle cx="338.3333333333333" cy="633" r="1.7" fill="#ffd36a"/><circle cx="345.6666666666667" cy="633" r="1.7" fill="#ffd36a"/><circle cx="353.0" cy="633" r="1.7" fill="#ffd36a"/>
<rect x="404" y="404" width="18" height="30" fill="#6c7582"/><rect x="411" y="380" width="4" height="26" fill="#59616d"/><circle cx="413" cy="376" r="4" fill="#ff9a3a"/><ellipse cx="413" cy="366" rx="3" ry="6" fill="#ffb347" opacity=".85"/>
<path d="M386 480h18M386 560h18M350 600h14M350 520h12" stroke="#59616d" stroke-width="5"/><path d="M300 600 V560 H332" stroke="#6c7582" stroke-width="5" fill="none"/>
<rect x="274" y="582" width="70" height="78" rx="5" fill="url(#htk)"/><ellipse cx="309" cy="582" rx="35" ry="7" fill="#dfe5ec"/><rect x="274" y="602" width="70" height="3" fill="#59616d" opacity=".7"/><rect x="274" y="630" width="70" height="3" fill="#59616d" opacity=".7"/>
<rect x="216" y="610" width="52" height="50" rx="4" fill="url(#htk)"/><ellipse cx="242" cy="610" rx="26" ry="5" fill="#dfe5ec"/><rect x="200" y="630" width="40" height="30" rx="3" fill="url(#htk)"/>
<path d="M309 596q0-10 8-10" stroke="#59616d" stroke-width="3" fill="none"/><circle cx="309" cy="618" r="9" fill="#e8a24a"/><path d="M309 610c-4 5-6 7-6 10a6 6 0 0012 0c0-3-2-5-6-10z" fill="#fff0b0"/>
<g fill="#ffd36a"><circle cx="280" cy="650" r="1.8"/><circle cx="292" cy="650" r="1.8"/><circle cx="304" cy="650" r="1.8"/><circle cx="316" cy="650" r="1.8"/><circle cx="328" cy="650" r="1.8"/><circle cx="340" cy="650" r="1.8"/><circle cx="222" cy="654" r="1.8"/><circle cx="238" cy="654" r="1.8"/><circle cx="254" cy="654" r="1.8"/><circle cx="206" cy="654" r="1.6"/></g>
<rect x="196" y="654" width="254" height="6" fill="#3a2a22"/><path d="M200 654h250" stroke="#7a8896" stroke-width="3"/></g>
<g transform="translate(0,6)"><path d="M0 672 H200 Q230 660 260 672 H450 V760 H0z" fill="#3b2a22" opacity=".55"/>
<g class="pj" transform="translate(48,0)"><path d="M44 662 L78 566 M112 662 L84 566" stroke="#2b2118" stroke-width="7" fill="none"/><path d="M52 640 H104 M58 612 H98 M66 588 H92" stroke="#2b2118" stroke-width="3.5"/><path d="M44 662 L112 600 M112 662 L52 600" stroke="#2b2118" stroke-width="2.5"/><rect x="36" y="660" width="86" height="10" rx="2" fill="#241b14"/>
<g class="rock" style="transform-origin:81px 560px"><path d="M2 548 Q6 520 30 516 L60 540 L178 566 L174 580 L58 558 L44 572 Q18 580 2 548z" fill="url(#hor)" stroke="#3a2210" stroke-width="2.5"/><path d="M8 540q4-18 22-20" stroke="#ffd48a" stroke-width="2.5" fill="none" opacity=".8"/></g>
<circle cx="81" cy="560" r="9" fill="#2b2118"/><circle cx="81" cy="560" r="4" fill="#e8a24a"/>
<path d="M18 556 V648" stroke="#1d1611" stroke-width="3"/><circle cx="148" cy="652" r="20" fill="#2b2118" stroke="#a8631e" stroke-width="3"/><circle cx="148" cy="652" r="8" fill="#e8a24a"/><path d="M148 632 L160 590" stroke="#2b2118" stroke-width="5"/><rect x="132" y="632" width="44" height="30" rx="4" fill="#4a3a2c"/>
<rect x="8" y="648" width="26" height="22" rx="3" fill="#2b2118"/><path d="M14 648v-10h14v10" stroke="#8a8f97" stroke-width="4" fill="none"/></g>
<g fill="#ffb347" opacity=".55"><circle cx="10" cy="562" r="2"/></g></g></g>
<rect x="-120" y="760" width="690" height="140" fill="#1a110d" opacity=".35"/>
<g><path d="M0 704 H20 V812 H0z" fill="url(#hbr)"/><rect x="-14" y="698" width="100" height="204" rx="12" fill="url(#hbr)"/><rect x="-14" y="728" width="100" height="9" fill="url(#hgd)"/><rect x="-14" y="866" width="100" height="9" fill="url(#hgd)"/><ellipse cx="36" cy="698" rx="50" ry="9" fill="#2b2d33"/><ellipse cx="36" cy="698" rx="42" ry="6" fill="#0b0b0d"/>
<path d="M40 758c-14 22-22 34-22 46a22 22 0 0044 0c0-12-8-24-22-46z" fill="url(#hgd)" stroke="#5e3b0a" stroke-width="2.5"/><path d="M30 806a11 11 0 006 10" stroke="#fff6cc" stroke-width="3" fill="none" stroke-linecap="round"/>
<path d="M-14 890 Q4 868 28 880 L58 900 H-14z" fill="#6b5446"/><path d="M-14 880 Q10 856 34 876 L24 900 H-14z" fill="#8a6f5c" opacity=".8"/></g>
<g><rect x="-20" y="828" width="500" height="92" rx="14" fill="url(#hpipe)"/><rect x="-20" y="828" width="500" height="5" fill="#fff" opacity=".35"/>
<g id="hfl"><rect x="86" y="818" width="26" height="112" rx="6" fill="url(#hgd)" stroke="#5e3b0a" stroke-width="2"/><circle cx="99" cy="832" r="3.6" fill="#f6dc9a" stroke="#5e3b0a"/><circle cx="99" cy="850" r="3.6" fill="#f6dc9a" stroke="#5e3b0a"/><circle cx="99" cy="868" r="3.6" fill="#f6dc9a" stroke="#5e3b0a"/><circle cx="99" cy="886" r="3.6" fill="#f6dc9a" stroke="#5e3b0a"/><circle cx="99" cy="904" r="3.6" fill="#f6dc9a" stroke="#5e3b0a"/></g>
<rect x="244" y="818" width="26" height="112" rx="6" fill="url(#hgd)" stroke="#5e3b0a" stroke-width="2"/><circle cx="257" cy="832" r="3.6" fill="#f6dc9a" stroke="#5e3b0a"/><circle cx="257" cy="850" r="3.6" fill="#f6dc9a" stroke="#5e3b0a"/><circle cx="257" cy="868" r="3.6" fill="#f6dc9a" stroke="#5e3b0a"/><circle cx="257" cy="886" r="3.6" fill="#f6dc9a" stroke="#5e3b0a"/><circle cx="257" cy="904" r="3.6" fill="#f6dc9a" stroke="#5e3b0a"/>
<g transform="translate(370,0)"><rect x="-14" y="812" width="28" height="118" rx="6" fill="url(#hgd)" stroke="#5e3b0a" stroke-width="2"/><rect x="-9" y="786" width="18" height="30" fill="url(#hgd)" stroke="#5e3b0a" stroke-width="2"/><rect x="-5" y="766" width="10" height="24" fill="#c28a2a"/><ellipse cx="0" cy="760" rx="34" ry="9" fill="none" stroke="url(#hgd)" stroke-width="7"/><path d="M-34 760 V764M34 760 V764M0 751V769" stroke="#8a5a14" stroke-width="3"/><circle cx="0" cy="760" r="6" fill="#e2b94c"/></g>
<circle cx="352" cy="836" r="3.2" fill="#f6dc9a" stroke="#5e3b0a"/><circle cx="352" cy="856" r="3.2" fill="#f6dc9a" stroke="#5e3b0a"/><circle cx="352" cy="876" r="3.2" fill="#f6dc9a" stroke="#5e3b0a"/><circle cx="352" cy="896" r="3.2" fill="#f6dc9a" stroke="#5e3b0a"/><circle cx="388" cy="836" r="3.2" fill="#f6dc9a" stroke="#5e3b0a"/><circle cx="388" cy="856" r="3.2" fill="#f6dc9a" stroke="#5e3b0a"/><circle cx="388" cy="876" r="3.2" fill="#f6dc9a" stroke="#5e3b0a"/><circle cx="388" cy="896" r="3.2" fill="#f6dc9a" stroke="#5e3b0a"/></g>
<rect x="-120" y="0" width="690" height="900" fill="#06101f" opacity=".1"/></svg>`;
  const leaves = (mir) => { let o = ''; for (let i = 0; i < 11; i++) { const t = i / 10, x = 62 - 26 * Math.sin(t * 1.5) + t * t * 8, y = 296 - t * 150, r = -20 - t * 40; o += '<ellipse cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="11" ry="4.6" transform="rotate(' + (r - 90 + 60) + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')" fill="url(#hg)" stroke="#6b4a14" stroke-width="1"/><ellipse cx="' + (x - 13).toFixed(1) + '" cy="' + (y + 5).toFixed(1) + '" rx="10" ry="4" transform="rotate(' + (r - 30) + ' ' + (x - 13).toFixed(1) + ' ' + (y + 5).toFixed(1) + ')" fill="url(#hg)" stroke="#6b4a14" stroke-width="1"/>'; } return mir ? '<g transform="translate(400,0) scale(-1,1)">' + o + '</g>' : '<g>' + o + '</g>'; };
  const LOGO = `<svg class="logo" viewBox="0 0 400 330" aria-label="OLI EMPIRE"><defs>
<linearGradient id="hg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3b8"/><stop offset=".3" stop-color="#f6c75a"/><stop offset=".68" stop-color="#c8872a"/><stop offset="1" stop-color="#7e4a0e"/></linearGradient>
<linearGradient id="hd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0b0"/><stop offset="1" stop-color="#e49a2a"/></linearGradient></defs>
${leaves(false)}${leaves(true)}
<g stroke="#5e3b0a" stroke-width="2.4" stroke-linejoin="round"><path d="M150 76 L156 34 L178 56 L200 22 L222 56 L244 34 L250 76z" fill="url(#hg)"/><rect x="148" y="70" width="104" height="14" rx="3" fill="url(#hg)"/></g>
<circle cx="156" cy="32" r="4.5" fill="#f4cf72"/><circle cx="200" cy="19" r="5" fill="#f4cf72"/><circle cx="244" cy="32" r="4.5" fill="#f4cf72"/><circle cx="200" cy="77" r="4" fill="#d6342a"/><circle cx="175" cy="77" r="3" fill="#2d6ad6"/><circle cx="225" cy="77" r="3" fill="#2d6ad6"/>
<g transform="translate(4,0)"><g stroke="#5e3b0a" stroke-width="2.6" stroke-linejoin="round" fill="url(#hg)"><circle cx="118" cy="148" r="64"/><path d="M196 86h40v70h50v32h-90z"/><path d="M296 86h40v102h-40zM288 84h56v12h-56zM288 178h56v12h-56z"/></g>
<circle cx="118" cy="148" r="47" fill="#0c1220" stroke="#6b4a14" stroke-width="3"/>
<path d="M118 112c-15 22-23 33-23 46a23 23 0 0046 0c0-13-8-24-23-46z" fill="url(#hd)"/><path d="M106 160a12 12 0 006 11" stroke="#fff6cc" stroke-width="3.5" fill="none" stroke-linecap="round" opacity=".9"/></g>
<text x="200" y="272" text-anchor="middle" font-family="Georgia,'Times New Roman','Noto Serif',serif" font-weight="900" font-size="64" textLength="268" lengthAdjust="spacingAndGlyphs" fill="url(#hg)" stroke="#5e3b0a" stroke-width="2" paint-order="stroke">EMPIRE</text></svg>`;
  const DECO = '<svg class="deco" viewBox="0 0 120 70" fill="currentColor"><path d="M0 70q25-18 60-10t60 10z"/><path d="M30 64l16-34h5l-14 34zM58 64l-14-34h5l16 34z" /><path d="M24 30h56l6-8h8l-4 12H24z"/><circle cx="30" cy="38" r="8"/></svg>';

  const root = document.createElement('div'); root.id = 'oli-home';
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const btn = (id, cls, ic, tx, sub, soon) => '<button class="hb ' + cls + (soon ? ' soon' : '') + '" id="' + id + '"' + (soon ? ' aria-disabled="true"' : '') + '><span class="ic">' + ic + '</span><span class="htx"><b>' + tx + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</span>' + (soon ? '<span class="soonp">' + T.soon + '</span>' : '') + (cls.indexOf('gold') >= 0 ? DECO : '') + '</button>';
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
  // landscape: show the middle band of the scene (pumpjack + refinery) instead of the foreground pipe
  const mq = window.matchMedia('(orientation:landscape) and (max-height:600px)'), scn = root.querySelector('.scene'), fitScene = () => scn.setAttribute('viewBox', mq.matches ? '-50 330 550 248' : '0 0 450 900'); fitScene(); if (mq.addEventListener) mq.addEventListener('change', fitScene);
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
