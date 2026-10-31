# Oli — لعبة إدارة النفط

لعبة نفط تعمل في المتصفح وعلى أندرويد (APK). واجهة عربية (مع English من الإعدادات)، والكود بالإنجليزية.

**الحلقة:** آبار نفط ← أنابيب (زوايا 90° فقط) ← خزانات ← السوق (بيع فوري / عقود آجلة / انتظار) ← مال ← بناء وتطوير.

## التشغيل في المتصفح
افتح `index.html` مباشرة، أو: `npx serve .`

## الملفات
| ملف | الدور |
|---|---|
| `core.js` | منطق اللعبة وكل الأسعار والتكاليف (`CFG` في أعلى الملف — عدّلها بسهولة) |
| `game.js` | الرسم (Canvas أيزومتري)، الكاميرا، اللمس، الواجهة، الترجمة |
| `index.html`, `style.css`, `fonts/` | الواجهة والخطوط (محلية، بدون إنترنت) |
| `test-core.js` | اختبارات المنطق: `npm test` |
| `android/`, `capacitor.config.json`, `build-www.js` | مشروع أندرويد (Capacitor) |
| `.github/workflows/android.yml` | بناء الـ APK تلقائياً على GitHub |

## الحركة وإحساس اللعب
- المضخة تتحرك بسرعة تتبع إنتاج البئر الفعلي، وتتوقف تدريجياً عند توقف الإنتاج (خزان ممتلئ أو بدون أنبوب).
- جزيئات النفط تمشي داخل الأنابيب المتصلة فقط، من البئر نحو الخزان، وسرعتها تتبع الإنتاج.
- مستوى الخزان (زجاجة المستوى) يتبع المخزون الفعلي بنعومة، وعند الامتلاء يومض بالأحمر مع منبه.
- البناء له حركة ظهور وغبار، والسعر ينزلق بين التحديثات، وللمال والنفط والبيع أرقام عائمة ووميض.
- الحركة تتجمد عند الإيقاف المؤقت، وجودة الرسم تنخفض تلقائياً على الأجهزة البطيئة.

## الاقتصاد والسوق (المرحلة 2)
كل الأرقام في `core.js` (`CFG`) وكلها تُقرأ من حالة اللعبة، والواجهة لا تحتفظ بأي رقم خاص بها.
- **السوق:** `game.market()` يعطي السعر الحالي والسابق والتغير والاتجاه ووقت السوق؛ السعر محصور بين `PRICE.MIN` و`PRICE.MAX` وينزلق بنعومة بين التحديثات، وله اتجاهات تستمر دقائق.
- **البيع الفوري:** الإيراد = الكمية × السعر الحالي؛ الكمية 100/250/500/الكل أو شريط التمرير؛ لا يمكن بيع أكثر من المخزون.
- **الانتظار:** يبقى النفط في الخزان والسعر يتحرك، لكن الانتظار له تكلفة تشغيل.
- **العقود الآجلة:** تختار الكمية والمدة (1/2/3/5 دقائق)، والسعر المقفل = سعر السوق المتوقع بعد تلك المدة (+1%). النفط لا يُحجز؛ عند الانتهاء إن وُجد في التخزين يُسلَّم بالسعر المقفل (COMPLETED)، وإلا تدفع غرامة 15% (EXPIRED). لا ربح مضمون: السعر قد يرتفع بعد القفل.
- **التكاليف (دولار/دقيقة، `CFG.OPEX`):** المضخة وهي تعمل فعلاً، الخزان لكل مستوى + رسم تخزين لكل برميل، والأنابيب لكل قطعة. المال لا يصبح سالباً: ما لا يمكن دفعه يصير دَيناً يُسدَّد من الإيراد التالي.
- **الربح = الإيرادات − تكاليف التشغيل** (تشمل الغرامات)، ويظهر في نافذة السوق مع المخزون والمال.

## الترقيات والمخاطر والاستكشاف (المرحلة 3)
كل الأرقام في `CFG` داخل `core.js`، وكل شيء محفوظ في حالة اللعبة (`serialize/load`)؛ الواجهة تقرأ فقط.
- **ترقية الآبار:** مستوى 1–5 بمضاعف إنتاج `1 / 1.2 / 1.4 / 1.65 / 2`، وتكلفة `$500 / 1000 / 2000 / 4000`. الإنتاج = أساس النوع × مضاعف المستوى × معامل الحالة × معامل الضغط.
- **أنواع الآبار:** صغير (10/د، ضغط يتراجع ببطء، مخاطر قليلة)، متوسط (22/د)، كبير (45/د، ضغط يتراجع أسرع وتآكل أعلى). اختر النوع من شريط S/M/L عند البناء.
- **ترقية الأنابيب:** تُرقّى الشبكة (أضعف القطع أولاً) وتكلفتها تتبع عدد القطع. السعة `25 / 40 / 60 / 90 / 130` برميل/دقيقة، وتزيد السرعة والموثوقية. إن كان إنتاج الآبار أكبر من السعة يحدث اختناق حقيقي: يُستخرج فقط ما يمر في الأنبوب، والباقي يبقى في الاحتياطي تحت الأرض.
- **ترقية الخزانات:** السعة `1000 / 2000 / 3500 / 5500 / 8000`.
- **الضغط:** ينخفض ببطء أثناء الضخ حسب نوع البئر ويتعافى ببطء عند التوقف. معامل الإنتاج = `0.25 + 0.75 × الضغط`.
- **الحالة والصيانة:** تتآكل أثناء الإنتاج وتقلل الإنتاج (حتى 40%)، وعند 10% يتعطل البئر. الصيانة تُدفع (حسب سوء الحالة) وتعيد الحالة إلى 100%.
- **تسريب الأنابيب:** احتمال معتدل لكل قطعة (أقل مع مستوى أعلى وحالة أفضل). التسريب يضيّع 30% من النفط عند كل نقطة تسريب ويظهر كعلامة حمراء نابضة مع تنبيه. الحالات: `NORMAL / LEAK / REPAIRING`. الإصلاح مدفوع ويستغرق 6 ثوانٍ ولا يمكن بدؤه مرتين.
- **جودة النفط:** LOW ×0.85 / MEDIUM ×1.00 / HIGH ×1.20 على سعر السوق. الجودة خاصية الاحتياطي، والخزان يحسب متوسطاً موزوناً لما فيه.
- **الاستكشاف:** الخريطة مقسمة إلى مناطق 4×4 مخفية. استكشاف منطقة يكلّف `$1000` ويستغرق 20 ثانية، والنتيجة: فارغة أو احتياطي صغير/متوسط/كبير بحجم وجودة وإنتاج محتمل. لا يمكن بناء بئر إلا على احتياطي مكتشف، والآبار في منطقة واحدة تتشارك إنتاجها المحتمل، والاحتياطي ينفد.
- **الاقتصاد:** الصيانة والإصلاح تُحسب ضمن تكاليف التشغيل، والترقيات والاستكشاف في `capex`، وكلها تظهر في نافذة السوق.
- الاختبارات: `node test-core.js` و`node test-p3.js`.

## المناطق والعقود والأحداث والمنافسون (المرحلة 4)
- **المناطق (5):** داخل الخريطة نفسها، لكل منطقة تضاريس وسعر استكشاف ومخاطرة واحتمال نفط. الحالات: مقفلة ← متاحة ← مستكشفة ← نشطة (فيها بئر). الفتح يتطلب تكلفة ورصيداً أدنى. المخاطرة تضرب احتمال التسرب وتآكل الآبار.
- **التضاريس:** رمل ×1، مسطحة ×0.85، وعرة ×1.25، صخور ×1.5 على تكلفة البناء (مع معامل المنطقة). لا تمنع البناء.
- **عقود التوريد:** عروض جديدة كل دقيقة تقريباً (حتى 3 عروض و3 عقود نشطة). التسليم من المخزون الحر فقط. الاكتمال يدفع المكافأة كاملة، والفشل يدفع 40% من قيمة المسلَّم مع غرامة 10%، والعرض غير المقبول ينتهي (EXPIRED). السعر قد يكون أقل من السوق.
- **أحداث السوق:** ارتفاع طلب، صدمة عرض، هبوط، ازدهار، سوق مستقر. نادرة (كل 5–10 دقائق)، ترتفع تدريجياً وتعود للطبيعي تدريجياً، مع شريط إشعار لا يوقف اللعبة.
- **المنافسون (3 شركات AI):** هجومي / متوازن / متحفظ، تحديث كل 5 ثوانٍ لا كل إطار. تأثيرهم على السعر محدود (±4%).
- **الحصة السوقية:** إنتاج كل شركة (متوسط ~10 دقائق) ÷ المجموع. **الترتيب** حسب إجمالي الإيرادات.
- الحفظ: كل شيء ضمن حالة اللعبة نفسها (نظام الحفظ الحالي) والحفظ القديم يُحمَّل.
- الاختبارات: `npm test` (core + p3 + p4).

## تلميع اللعب وسهولة التحكم (المرحلة 5)
- **أول لعبة موجَّهة:** بطاقة خطوات (بئر ← أنبوب ← خزان ← انتظر ← بع) مع نقطة مضيئة على الخريطة وزر ينبض. الخطوة تُحسب من حالة اللعبة، وتنتهي بأول بيع وتُحفظ `tutorialDone`. زر «تخطي» متاح.
- **بناء أسهل:** البقع الصالحة للبئر والخزان تظهر بالأخضر، والضغط قرب بقعة صالحة ينقل البناء إليها تلقائياً.
- **الأنابيب بالسحب:** اسحب من بئر/خزان/أنبوب إلى الوجهة؛ المسار أفقي/عمودي فقط، والنهاية تلتقط أقرب بئر أو خزان أو أنبوب. مؤشر أخضر (يربط بئراً بخزان) / كهرماني (صالح لكن غير مكتمل) / أحمر (غير صالح). التأكيد قبل البناء على اللمس.
- **الكاميرا:** إصبع واحد للتحريك وإصبعان للتقريب، والسحب لا يبني. اختيار مبنى/أنبوب/منطقة ينقل الكاميرا بانسياب (لا قفز) ويلغيه أي لمس.
- **رسائل مساعدة** تقول ماذا تفعل (مثل «هذه المنطقة تحتاج استكشافاً أولاً»).
- **تغذية راجعة:** ضغط الأزرار، نبضات على العناصر المطلوبة، تأثير اكتشاف/إصلاح/بيع، لوحات أقصر مع «تفاصيل أكثر».
- **السرعة:** زر في الأعلى يدور بين 1× ← 2× ← إيقاف، وتؤثر على المحاكاة نفسها.
- **افتراضات ذكية:** نافذة السوق تفتح بكمية البيع الحرة جاهزة، وكمية العقد الآجل تبدأ بالنصف.
- إصلاح: النقرة الشبحية على الهاتف بعد لمس الخريطة (كانت تضغط عنصراً انتقل تحت الإصبع).

## قواعد اللعبة
- شبكة 44×28. الآبار والأنابيب والخزانات لها 5 مستويات (التفاصيل في قسم المرحلة 3).
- الأنابيب أفقية/عمودية فقط، مع معاينة وتكلفة؛ الوصلات غير الصحيحة (أنبوب عائم) مرفوضة.
- الإنتاج يتوقف عند امتلاء الخزان.
- السوق: السعر الحالي، السابق، والاتجاه؛ بيع فوري، عقود 1/2/3 دقائق بعلاوة سعر، أو انتظار مع تنبيه سعر.
- التحكم: سحب = تحريك، قرصة = تكبير، لمسة = اختيار، وضع البناء مع تأكيد ✓.
- الحفظ التلقائي في `localStorage` (المال، النفط، الآبار، الأنابيب، الخزانات، التطويرات، السوق).

## بناء APK
**الأسهل (GitHub Actions):** ادفع المشروع إلى GitHub ← تبويب Actions ← *Build Android APK* ← Run workflow. بعد دقائق تجد `Oli.apk` في **Releases → apk-latest** (أو في Artifacts).
ثم نزّله على الهاتف وافتحه (فعّل "التثبيت من مصادر غير معروفة").

**محلياً** (يلزم JDK 21 و Android SDK):
```
npm ci
npm run android:sync
cd android && ./gradlew assembleDebug
# الناتج: android/app/build/outputs/apk/debug/app-debug.apk
```

## Phase 6 — Building system + smart oil network

- **Real construction**: `place()` / `buildRoute()` put objects into Game State at once with `ready` times (`CFG.BUILD`: well 5 s, tank 4 s, pipe 0.12 s per tile, max 3 s per route). Unfinished objects are not part of the live network; they animate (scale/fade, progress bar, dust, pipes tile by tile) from the real progress. Saves keep construction state.
- **Network graph** (`rebuildNetwork`): pipes, wells and tanks are nodes of connected components; per well a BFS through pipe tiles gives `routes` (every reachable finished tank with its pipe-path length). Rebuilt only when the network changes (build, remove, repair, break, a construction finishing) — never per frame.
- **Smart routing** (`routeFlow`): each well picks the first route (shortest by pipe path, then tank id) whose tank still has room; full / unconnected / unfinished tanks are skipped and the target changes when a tank fills.
- **Capacity**: actual flow = min(production, pipe capacity along the path), shared fairly between wells on the same tiles; what does not fit stays in the ground. A tank never exceeds its capacity.
- **UI**: well panel (connected? which tank, how many tiles, why there is no flow), tank panel (inflow, feeding wells), pipe panel (flow / capacity / problem), map highlight of the selected network, construction animation, coach waits while building.
- Tests: `npm test` (core 1–10) and the browser tests (scenarios 11–12, panels, construction).

## توسيع الخريطة (×10)
- العالم الآن 140×88 مربع، والخريطة القديمة محفوظة كما هي عند الإزاحة (48,32). الحفظ القديم يُحمَّل ويُزاح تلقائياً.

## Phase 8 — ضغط النفط والتدفق الديناميكي + محطة الضخ
- **المعادلات** (`Hyd` في core.js): Darcy-Weisbach (ΔP = f·(L/D)·ρv²/2)، رينولدز، f=64/Re (صفحي)، Swamee-Jain (مضطرب) مع مزج 2300–4000، خسائر ثانوية K·ρv²/2 (كوع/تي/صمام/مضخة)، منحنى المضخة H=H0−kQ² و ΔP=ρgH، ضغط خلفي للخزان P=Pbase+Pmax·fill²، تدفق البئر Q=rate·clamp((Pres−Preq)/(Pres−Pwh),0,1).
- **الحلّال** (`hydSolve`): اختيار مسار لكل بئر (أقل ضغط + تكلفة المسافة + hysteresis)، ثم Gauss-Seidel بجذر Illinois لكل بئر (حد 40 تكرار)، ثم تحجيم السعة، ثم حساب الضغوط. عند عدم التقارب يُبقى آخر تدفق مستقر. يعاد الحل كل 0.2 ث أو عند تغيّر الشبكة فقط (≤5 مرات/ث).
- **التدفق الزمني** (`routeFlow`): dQ/dt=(Q*−Q)/τ، تسارع/تباطؤ المضخة، حركة الصمامات، طرقة مائية عند الإغلاق/امتلاء الخزان.
- **المضخة**: مبنى 1×1 يوضع على خط أنابيب مستقيم، اتجاه (R للقلب)، تشغيل/إيقاف، 3 مستويات، تكلفة 2500، استهلاك kW=ΔP·Q/η يدخل في المصاريف.
- **الصمامات**: مفتوح / جزئي / مغلق من لوحة الأنبوب.
- **التصحيح**: `#debug` أو Shift+D يعرض لوحة تشخيص.
- **الإعدادات**: كتلة `CFG.HYD` في core.js.
- **الاختبارات**: `npm test` (يشمل test-p8.js: 23 اختباراً).

## الرسومات (Art pass)
- `art.js` يحتوي كل الأصول المولّدة (WebP بخلفية شفافة): المضخة، 4 آبار (صغير ×2، متوسط، كبير)، 3 مستويات خزانات، أنابيب (مستقيم x/y، كوع، صمام)، نخيل، صخور، رمل، شاطئ، وأيقونات (عملة، نفط، مفتاح، عدسة).
- `game.js`: `sprite()` / `sprImg()` ترسم الصور وتعود للرسم البرمجي القديم إن لم تُحمَّل بعد. حركة الآبار والمستوى في الخزان والجسيمات تبقى مرتبطة بالمحاكاة الفعلية.
- الأرض: ملمس رمل فوق التدرج القديم، وتظهر حافة الشاطئ على بلاط الماء الذي يلامس اليابسة من جهة واحدة.
- لم تُستخدم بعد: الشارة الدائرية وشريط الاسم الأزرق.

## سلامة شبكة الأنابيب (Phase 9)
- الشبكة = رسم بياني على المربعات: كل مربع أنبوب/بئر/خزان/مضخة عقدة، والجيران الأربعة حواف. لا توجد أي علاقة "بصرية فقط".
- `routePipe` يرفض الآن أي مسار يعبر أنبوباً قائماً (`crossPipe`) أو يلاصق شبكة أخرى في منتصفه (`pipeTouch`)؛ يجرّب التوجيه الـL الآخر تلقائياً. الوصلة الحقيقية = إنهاء الأنبوب على/بجانب أنبوب قائم.
- `validateNetwork()` يفحص اتساق الرسم البياني والمسارات والحواف الهيدروليكية والتدفق، ويظهر في `debugSnapshot().problems` وفي لوحة التشخيص.
- الصمام المغلق كلياً: الأنابيب المجاورة تنتهي عنده بصرياً كما تنتهي فعلياً.
- الاختبارات: `test-p9.js` (11 اختباراً بينها اختبار عشوائي من 700 عملية).

## UX / Input polish (Phase 10)
Mobile-first building, camera and pipe-drawing input (game.js only; core.js stays the single source of truth).
- **Touch priority**: modal > placement > pipe drawing > selection > pan > background.
- **Building**: pick a tool, drag a preview (relative movement, smooth grid glide), valid/invalid colour with a specific reason, Confirm / Cancel. Nothing is charged or built before Confirm. A drop on a bad cell glides to the nearest valid one. Dragging near a screen edge auto-pans.
- **Camera**: one finger pans on empty ground / on built things in select mode; two fingers pinch-zoom; no pan while placing or drawing a pipe; the finger left over after a pinch never pans or taps.
- **Pipes**: drag from an anchor (well/tank/pump/pipe, snapped within 2 tiles) to the target; auto-routed preview with cost and reason; Confirm builds, Cancel clears.
- **Taps**: 4 px/6 px drag thresholds (touch/mouse), tap debounce, duplicate touch+click (Android WebView ghost clicks) suppressed, a second tap confirms a pending cell only after 450 ms.
- **Back (Android / Escape)**: one step per press: modal -> preview/pipe -> build tool -> selection -> nothing (never exits the game).
- Tests: `node test-p10-ui.js` (phone, CDP touch events, 24 scenarios); older UI tests updated where the old rule (a drag in build mode panned the camera) changed.

## Input phase 1/20 (Phase 11)
- One derived input mode (`inputMode()`): UI_INTERACTION > PINCH_ZOOM > PIPE_DRAWING > BUILDING_PLACEMENT > SELECTING > DEFAULT. One pointer-event pipeline on the map; no touch/mouse/click duplicates.
- A touch that starts ON a building never pans the camera (tap selects; a drag does nothing, buildings are not movable). Touches near a building, on empty ground, pan.
- `resetGestures()` on touchcancel, lost pointer capture, window blur and tab hide: no stuck gestures. Confirm presses within 350 ms are one action.
- Tests: `node test-p11-ui.js` (34 checks incl. coordinate round trips on 3 other screens/DPRs over the whole 140x88 map).

## Camera & world navigation (Phase 12 — phase 2/20)
- One camera state: `cam = { x, y, z, minZoom, maxZoom }` (x/y = world point at the canvas centre). Limits live in `CAM` (`MIN_Z` 0.28, `MAX_Z` 2, `EDGE` 48) — nothing else hard-codes zoom limits.
- Bounds are computed per zoom from world size + viewport size (`fitView`): the view centre stays inside the world diamond and the whole view stays inside the world's bounding box (+`EDGE`); a view larger than the world is centred. The minimum zoom rises automatically on huge screens so the world always fills the view.
- `focusOn(wx, wy, {instant, force, minZoom})` clamps its goal, glides with a frame-rate independent ease, ends by itself (reached / stalled / 2.5 s) and is interrupted instantly by touch, minimap, wheel or keyboard.
- Resize / rotation: `resize` event + `ResizeObserver` on the canvas; the world point at the centre stays at the centre.
- The projection is unchanged: the artwork and grid are isometric, the camera is a flat 2D pan/zoom (no tilt or rotation).
- Tests: `node test-p12-ui.js` (26 checks).

## Smart building system (Phase 13 — phase 3/20)
Existing flow kept and tightened: Build menu -> tool -> drag preview (snaps to the shared grid, glides, 48 px above the finger) -> live validity -> explicit Confirm -> `game.place()` (validates again, charges once) -> real Game State building with construction timer.
- Reasons read "Cannot build here — occupied / outside the buildable area / water / overlaps an existing structure" (AR + EN).
- Build menu dims tools you cannot pay for (`updateMenuAfford`, DOM touched only when it flips); menu buttons ignore same-button repeats within 250 ms; choosing the active tool again keeps the preview.
- Cancel/Back: preview gone -> leave build tool -> the previously selected building is selected again; Game State untouched.
- The confirm bar writes the DOM only when text/state changed (no writes while dragging inside a cell).
- Rotation: only the pump has a direction (flip button); the previewed direction is exactly what `place()` stores. Wells and tanks have none (architecture left ready).
- Tests: `node test-p13-ui.js` (17 checks).

## Placement validation, snap & preview (Phase 14 — phase 4/20)
- One grid mapping in `game.js`: `gridToWorld(u, v)` / `worldToGrid(wx, wy)` (+ `cc`, `footprintCenter`, `cellAt`, `s2w` / `w2s`) — drawing, picking, preview, touch and camera all go through it (stable round trips, tested).
- One footprint table in `core.js`: `CFG.FOOTPRINT` (well 1x1, tank 2x2, pump 1x1) feeds `cellsOf`, `canPlace`, price, spots and the preview polygon.
- `game.placement(type, x, y, kind)` is the single verdict: `state` VALID | INVALID | UNAFFORDABLE, `kind` OUT_OF_BOUNDS | OCCUPIED | OVERLAPPING | RESTRICTED_AREA | TERRAIN | RULE, `reason`, `cost`, `cells`. `place()` re-validates on the live state, so a stale preview can never build or charge. `validateNetwork()` also checks that every building is fully inside the world, registered in `occ`, and shares no cell.
- Reasons: "outside the world" (anchor outside), "partly outside the world" (footprint crossing the edge), "occupied" (the spot), "overlaps existing structure" (a corner), plus the existing water / blocked / locked / not explored / not enough money.
- Preview: green = valid, amber = valid spot but insufficient funds, red = invalid; the real asset is drawn translucent in every state (never recoloured) and the confirm bar carries the state.
- Tests: `node test-p14.js` (core, 9) and `node test-p14-ui.js` (phone, 21).

## Smart pipe building & auto-routing (Phase 15 — phase 5/20)
- Flow (unchanged shape): Pipe tool -> start on a well / tank / pump / pipe (or the tile beside one) -> tap or drag toward the destination -> route preview -> Confirm / Cancel. Previewing and cancelling touch nothing (cash, pipes, network version are identical afterwards).
- Router (`core.js`): `routePipe()` tries the two single-corner "L" shapes first; when both are blocked (a building, water, blocked ground, a locked region, another network in the way) it runs `findPath()` — A* over the 4-neighbour grid, step cost = real ground price (terrain x region), +0.55 per corner, searched in a window around the two ends (`ROUTE_MARGIN` 24, max `ROUTE_MAX_EXPAND` 60000 states). A detour never steps on or beside anything except the two end objects (so it cannot link another network or feed another tank by accident) and is accepted only up to 2.5x the direct distance + 12 tiles. No way at all -> `noRoute` ("No valid route found"); a way only as a huge detour -> the original specific reason (e.g. "Pipe crossing is not a junction").
- One judge for a route: `evalRoute(cells)` (bounds, buildings, blocked / water / locked ground, contacts with other networks, pump sides, anchoring, ambiguity, cost). The preview, the router and `buildRoute()` all use it; `buildRoute()` judges the SAME cells again on the live state, checks the money, and only then writes — so a stale preview, a second confirm or a failed check builds nothing (atomic: all tiles or none, money taken once).
- Pumps: a pump joins only at its back and front; a route may start / end on a pump only along its axis (`pumpSide`: "Cannot connect to this side of the pump"); the router honours it and the two connection tiles glow while choosing the start.
- Preview: full route in blue (existing pipe tiles in grey), corner dots, a two-line pill (cost · tiles · corners / status · "detour around an obstacle" / junction label), a ring on the destination, red + the specific reason when invalid, Confirm disabled when invalid or unaffordable.
- Pinch while drawing zooms and keeps the start; a one-finger drag on the ground neither pans nor builds; releasing a drag leaves a preview (Confirm is always explicit).
- Tests: `node test-p15.js` (core, 31) and `node test-p15-ui.js` (phone with real touch events, 9 scenarios).

## Network graph & junctions (Phase 16 — groundwork for phase 6/20, NOT a finished phase)
- `net.graph` is DERIVED from the same tiles and the same link rule the solver uses (inside `rebuildNetwork`, only when the topology changes): nodes = wells, tanks, pumps, junctions (pipe tile with 3-4 links) and pipe ends; edges = pipe segments between nodes. Ids are deterministic (`J<tile>`, `E<tile>`, `S<lowest tile>`, `W/T/P<building id>`), so they are identical after save/load.
- Joining a pipe to the middle of another pipe makes a junction by itself and splits the segment logically; removing a branch (`removeBranch`, panel button) merges it again. `visualMask(k)` is the single link rule used by the renderer and checked against the solver's by `validateNetwork()`.
- A route end that would touch two different networks at once is refused ("ambiguous"); crossing a pipe is never a junction (detour or refusal).
- Tests: `node test-p16.js` (core, 28).
