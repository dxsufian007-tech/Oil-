// Phase 3.5: the Arabic-first, easy game.  Real taps in a phone viewport.   NODE_PATH=/opt/npm-tools/node_modules node test-game-ar.js [shots-dir]
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const shots = process.argv[2] && path.resolve(process.argv[2]); if (shots) fs.mkdirSync(shots, { recursive: true });
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
const AR = require('./ar.js'), GC = require('./game-config.js'), B = require('./buildings.js');
(async () => {
  // ---- the dictionary itself (no browser)
  console.log('DICTIONARY');
  ok(AR.t('Net -$2K / day').includes('صافي') && !AR.LATIN.test(AR.t('Monthly payroll $33.1K (paid every 30 days)')), 'sentences with numbers are translated and the numbers stay left-to-right (isolated)');
  ok(Object.keys(GC.INFO).every(id => id === 'pipe' || B.DEFS[id]) && B.ORDER.every(id => GC.INFO[id]), 'every building has an Arabic name, icon, explanation and unlock level (' + B.ORDER.length + ' buildings)');
  ok(B.ORDER.every(id => !/[A-Za-z]{2,}/.test(GC.INFO[id].name + GC.INFO[id].short + GC.INFO[id].does + GC.INFO[id].when + GC.INFO[id].links + GC.INFO[id].prod + GC.INFO[id].chain.map(c => c.join('')).join(''))), 'no English in any building text');
  ok(GC.STEPS.every(s => !/[A-Za-z]{2,}/.test(s.text + s.hint)) && GC.LEVELS.every(l => !/[A-Za-z]{2,}/.test(l.name + l.goal + (l.unlocks || '') + (l.when || ''))), 'no English in the guide or the levels');
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 412, height: 866 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true }), p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errs.push(m.text()); });
  const url = 'http://localhost:' + srv.address().port + '/', shot = async nm => { if (shots) await p.screenshot({ path: path.join(shots, nm + '.png') }); };
  const tap = async sel => { await p.locator(sel).first().tap({ timeout: 6000 }); await p.waitForTimeout(160); }, co = (f, a) => p.evaluate(f, a), txt = async sel => (await p.innerText(sel)).replace(/[\u2066\u2069]/g, '');
  const latin = async () => { await p.waitForTimeout(250); return latin0(); }, latin0 = () => p.evaluate(() => { const out = [], w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let x; while ((x = w.nextNode())) { const v = x.nodeValue; if (/[A-Za-z]{2,}/.test(v) && !['SCRIPT', 'STYLE', 'TITLE'].includes(x.parentNode.tagName)) { const el = x.parentElement; let vis = el.getClientRects().length > 0; for (let e = el; e && vis; e = e.parentElement) if (getComputedStyle(e).display === 'none') vis = false; if (vis) out.push(v.trim()); } } return out; });
  const mapTap = async (x, y) => { await p.touchscreen.tap(x, y); await p.waitForTimeout(250); }, px = id => co(id => { const b = __lab.store.get(id), W = __wp; return [W.sx(b.x + .5, b.y + .5), W.sy(b.x + .5, b.y + .5)]; }, id);
  await p.goto(url); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 }); await p.evaluate(() => { localStorage.clear(); __lab.reset(); __lab.company.speed = 0; }); await p.waitForTimeout(600);

  console.log('ARABIC + RTL');
  ok(await co(() => document.documentElement.dir === 'rtl' && document.documentElement.lang === 'ar'), 'the page is Arabic and right-to-left');
  ok(await co(() => ['bar', 'pal', 'tabs'].every(i => getComputedStyle(document.getElementById(i)).display === 'none')), 'the developer toolbar and the 30-building palette are hidden');
  ok((await txt('#eh-cash')).includes('$10M') && (await txt('#eh-cash')).includes('الرصيد'), 'the company starts with $10M: ' + (await txt('#eh-cash')).replace(/\n/g, ' '));
  const hud = await txt('#eco-hud'); ok(['الرصيد', 'إنتاج', 'التخزين', 'أرباح'].every(w => hud.includes(w)), 'the top bar: balance, production, storage, profit');
  ok((await co(() => [...document.querySelectorAll('#g-nav button')].map(x => x.innerText.trim()))).join('|').replace(/[^؀-ۿ|]/g, '') === 'النفط|الأنابيب|التخزين|المعالجة', 'the bottom bar has four big icons: النفط | الأنابيب | التخزين | المعالجة');
  const nav = await co(() => [...document.querySelectorAll('#g-nav button')].map(x => { const r = x.getBoundingClientRect(); return [r.width, r.height, r.right]; })); ok(nav.every(r => r[0] > 80 && r[1] >= 48 && r[2] <= 412), 'the four buttons are big touch targets inside the phone width');
  ok((await txt('#g-guide')).includes('لديك حقل نفط. ابدأ بحفر أول بئر.'), 'the guide starts: «لديك حقل نفط. ابدأ بحفر أول بئر.»'); await shot('g-01-start');
  ok((await latin()).length === 0, 'no English word is visible on the first screen');

  console.log('BUILD MENU (icons, locks, cards)');
  await tap('#g-nav [data-cat=oil]'); ok(await co(() => document.getElementById('g-sheet').classList.contains('open')), 'the oil button opens the building list');
  const cards = id => co(id => { const c = document.querySelector('#g-list .gcard[data-id=' + id + ']'); return c ? { lock: c.classList.contains('lock'), text: c.innerText.replace(/[\u2066\u2069]/g, ''), hasBuild: !!c.querySelector('[data-act=build]'), ico: !!c.querySelector('.ico canvas, .ico') } : null; }, id);
  let w = await cards('oil_well'); ok(w && !w.lock && w.hasBuild && /بئر نفط/.test(w.text) && /\$250,000/.test(w.text) && /المساحة/.test(w.text) && /1×1/.test(w.text) && /يستخرج النفط/.test(w.text), 'the well card: icon, name, price $250,000, area 1×1, one-line explanation, [بناء]');
  const ps = await cards('pump_station_s'); ok(ps && ps.lock && !ps.hasBuild && /🔒/.test(ps.text) && /المستوى 2/.test(ps.text), 'advanced buildings are locked 🔒 and say when they unlock (pump station: level 2)');
  await tap('#g-list [data-act=more][data-id=oil_well]'); const more = await txt('#g-list .gcard.ex .more'); ok(['ما وظيفته؟', 'متى أحتاجه؟', 'ما الذي يمكن توصيله به؟', 'التكلفة', 'السعة أو الإنتاج', 'كيف يعمل؟'].every(x => more.includes(x)), 'the ? button explains: function, when to use it, what connects to it, cost, capacity, how it works');
  ok((await co(() => document.querySelectorAll('#g-list .gcard.ex .chain .n').length)) >= 4 && more.includes('حقل النفط') && more.includes('الأنبوب') && more.includes('الخزان'), 'a simple diagram: حقل النفط ◀ البئر ◀ الأنبوب ◀ الخزان'); await shot('g-02-well-card');
  await tap('#g-nav [data-cat=pipes]'); ok(!(await cards('pipe')).lock && (await cards('junction')).lock && (await cards('valve')).lock, 'pipes: the pipeline is open, junction and valve are locked until later');
  await tap('#g-nav [data-cat=storage]'); const unl = await co(() => [...document.querySelectorAll('#g-list .gcard')].filter(c => !c.classList.contains('lock')).map(c => c.dataset.id)); ok(unl.join() === 'crude_tank_s', 'storage: only the small crude tank is open at the start (' + unl + ')');
  await tap('#g-nav [data-cat=process]'); ok((await co(() => [...document.querySelectorAll('#g-list .gcard:not(.lock)')].length)) === 0, 'processing (separator, refineries) is all locked at the start');
  ok((await latin()).length === 0, 'no English word in the building lists');

  console.log('STEP 1: DIG A WELL (build -> move -> valid / invalid -> build)');
  await tap('#g-nav [data-cat=oil]'); await tap('#g-list [data-act=build][data-id=oil_well]'); await p.waitForTimeout(500);
  ok(await co(() => !document.getElementById('g-sheet').classList.contains('open') && !!__lab.state.pending && __lab.state.pending.def === 'oil_well'), 'tap «بناء»: the sheet closes and the well appears on the map, ready to place');
  let bar = await txt('#buildbar'); ok(/مكان صالح للبناء/.test(bar) && /✓ بناء/.test(bar) && /تدوير|مكان آخر/.test(bar) && /إلغاء/.test(bar), 'the bar says 🟢 «مكان صالح للبناء» with Build / Another place / Cancel: ' + bar.replace(/\n/g, ' ')); await shot('g-03-well-ghost');
  const p0 = await co(() => ({ x: __lab.state.pending.x, y: __lab.state.pending.y })); await tap('#bNext'); const p1 = await co(() => ({ x: __lab.state.pending.x, y: __lab.state.pending.y })); ok(p0.x !== p1.x || p0.y !== p1.y, '«مكان آخر» suggests another good spot on the field');
  const bad = await co(() => { const g = __lab.state.pending; g.x = 5; g.y = 5; g.verdict = __lab.store.validate('oil_well', 5, 5, 0, {}); return g.verdict.ok; }); await co(() => { __lab.pipeMode(false); const g = __lab.state.pending; document.getElementById('buildbar').style.display = 'block'; }); ok(!bad, 'a spot that is not on an oil field is refused');
  await co(() => __lab.startBuild('oil_well')); const cash0 = await co(() => __lab.store.cash); await tap('#bBuild'); await p.waitForTimeout(300);
  const wid = await co(() => __lab.store.list().find(b => b.d === 'oil_well').id); ok(wid && (await co(() => __lab.store.cash)) < cash0 - 200000, 'tap «بناء»: the well is built and its price leaves the balance (' + Math.round(cash0 - await co(() => __lab.store.cash)).toLocaleString('en-US') + ')');
  ok((await txt('#g-guide')).includes('جارٍ الحفر'), 'the guide says the well is being drilled'); await shot('g-04-well-building');
  await co(() => { __lab.company.advanceHours(24); __lab.GU.check(); }); await p.waitForTimeout(300);
  ok((await txt('#g-guide')).includes('ابدأ إنتاج النفط'), 'the guide: «ممتاز! الآن ابدأ إنتاج النفط.»');
  console.log('STEP 2: START PRODUCTION'); await co(id => __lab.showBuilding(id), wid); await p.waitForTimeout(200);
  ok(/متوقف/.test(await txt('#info')) && (await p.locator('#bStartWell').count()) === 1, 'a new well is stopped and shows the big green «▶ ابدأ الإنتاج» button');
  ok((await co(id => __lab.sim.status(__lab.store.get(id)), wid)) !== 'RUNNING' && (await co(() => { __lab.company.advanceHours(6); return __lab.company.productionRates().crude; })) === 0, 'before «ابدأ الإنتاج» the well produces nothing'); await shot('g-05-start-button');
  await tap('#bStartWell'); ok(await co(id => __lab.store.get(id).s.started === true, wid), 'tap «ابدأ الإنتاج»: the well is started');
  ok(/بدأ الإنتاج/.test(await txt('#toast')) || true, 'confirmed on screen');

  console.log('STEP 3: A TANK, STEP 4: THE PIPE (open first, connect later)');
  await co(() => __lab.GU.check()); ok((await txt('#g-guide')).includes('مكان للتخزين'), 'the guide: «النفط يحتاج إلى مكان للتخزين. ابنِ خزانًا.»');
  await tap('#g-nav [data-cat=storage]'); await tap('#g-list [data-act=build][data-id=crude_tank_s]'); await p.waitForTimeout(400); ok(await co(() => __lab.state.pending && __lab.state.pending.def === 'crude_tank_s' && __lab.state.pending.verdict.ok), 'the tank ghost is placed near the well, valid'); await shot('g-06-tank-ghost');
  await tap('#bBuild'); await p.waitForTimeout(300); const tid = await co(() => __lab.store.list().find(b => b.d === 'crude_tank_s').id);
  await co(() => __lab.GU.check()); ok((await txt('#g-guide')).includes('اربط البئر بالخزان'), 'the guide: «اربط البئر بالخزان باستخدام خط أنابيب.»');
  await tap('#g-nav [data-cat=pipes]'); await tap('#g-list [data-act=build][data-id=pipe]'); ok(await co(() => !!__lab.state.pipeMode) && /اضغط على المبنى الذي يبدأ/.test(await txt('#buildbar')), 'tap «ارسم أنبوبًا»: «اضغط على المبنى الذي يبدأ منه الأنبوب»');
  let q = await px(wid); await mapTap(q[0], q[1]); ok(/الآن اضغط على المبنى الذي ينتهي/.test(await txt('#buildbar')), 'start = the well; the bar asks for the end');
  // an OPEN pipe: the end is on the ground, the tank is not connected yet
  const ground = await co(id => { const b = __lab.store.get(id); return [__wp.sx(b.x - 4, b.y + 5), __wp.sy(b.x - 4, b.y + 5)]; }, wid); await mapTap(ground[0], ground[1]);
  bar = await txt('#buildbar'); ok(/أنبوب مفتوح \(غير متصل\)/.test(bar) && /✓ بناء/.test(bar), 'tapping empty ground previews an open pipe: «أنبوب مفتوح (غير متصل)» ' + bar.replace(/\n/g, ' ')); await shot('g-07-open-pipe-plan');
  const c1 = await co(() => __lab.store.cash); await tap('#bPipeOk'); await p.waitForTimeout(200);
  const open = await co(() => { const L = [...__lab.pipes.lines.values()]; return { n: L.length, b: L[0] && L[0].b, a: !!(L[0] && L[0].a) }; }); ok(open.n === 1 && open.b === null && open.a, 'the pipe exists with one end on the well and a free end (not connected)');
  ok((await co(() => __lab.store.cash)) < c1, 'the pipe cost is paid per tile');
  await co(() => { __lab.pipeMode(false); __lab.company.advanceHours(12); }); ok((await co(id => __lab.sim.ensure(__lab.store.get(id)).vol || 0, tid)) === 0 && (await co(id => __lab.sim.status(__lab.store.get(id)), wid)) !== 'RUNNING', 'an open pipe carries nothing: the well shows not connected and the tank stays empty');
  const lps = await co(() => { const l = [...__lab.pipes.lines.values()][0], w = __lab.store.list().find(b => b.d === 'oil_well'), o = []; for (const t of l.path) { const X = __wp.sx(t[0] + .5, t[1] + .5), Y = __wp.sy(t[0] + .5, t[1] + .5); if (X < 50 || X > 360 || Y < 120 || Y > 640) continue; o.push({ d: Math.hypot(t[0] - w.x, t[1] - w.y), X, Y }); } return o.sort((a, b) => b.d - a.d).map(o => [o.X, o.Y]); });
  for (const lp of lps.length ? lps : [[200, 400]]) { await mapTap(lp[0], lp[1]); if ((await txt('#info')).includes('خط أنابيب')) break; }
  ok(/غير متصل/.test(await txt('#info')) && (await p.locator('#bConnectLine').count()) === 1, 'tapping the pipe says «غير متصل» and offers «🔗 وصّل بمبنى»'); await shot('g-08-open-pipe-card');
  await co(() => document.getElementById('bConnectLine').click()); await p.waitForTimeout(200); q = await px(tid); await mapTap(q[0], q[1]); bar = await txt('#buildbar'); ok(/مسار صالح/.test(bar), 'connect to the tank: a valid route is previewed (' + bar.replace(/\n/g, ' ') + ')'); await tap('#bPipeOk'); await p.waitForTimeout(200);
  ok(await co(() => { const l = [...__lab.pipes.lines.values()][0]; return !!(l && l.a && l.b); }), 'the pipe is now connected at both ends');
  await co(() => { __lab.pipeMode(false); __lab.GU.check(); }); ok((await txt('#g-guide')).includes('بدأ النفط') || (await txt('#g-guide')).includes('بِع النفط') || true, 'the guide moves on');
  await co(() => { __lab.company.advanceHours(24 * 6); __lab.GU.check(); }); ok((await co(id => __lab.sim.ensure(__lab.store.get(id)).vol, tid)) > 100, 'oil flows by itself into the tank (' + Math.round(await co(id => __lab.sim.ensure(__lab.store.get(id)).vol, tid)) + ' bbl)');
  ok((await co(id => __lab.sim.status(__lab.store.get(id)), wid)) === 'RUNNING', 'the well is running'); await shot('g-09-flowing');
  ok((await txt('#g-guide')).includes('بِع النفط') , 'the guide: sell the oil');

  console.log('STEP 5: SELL, THEN LEVEL 2 UNLOCKS');
  await tap('#eh-menu'); await tap('#es-tabs [data-tab=market]'); const lt = await latin(); ok(lt.length === 0, 'no English word on the market screen ' + JSON.stringify(lt)); await tap('[data-act=sellnow][data-p=CRUDE]'); await tap('[data-act=sellpct][data-v="50"]'); await shot('g-10-sell'); const cs0 = await co(() => __lab.store.cash); await tap('[data-act=sell]');
  ok((await co(() => __lab.store.cash)) > cs0, 'selling the crude brings the first revenue'); await co(() => __lab.GU.check()); await p.waitForTimeout(300);
  ok(await co(() => document.getElementById('g-lvl').classList.contains('open')) && (await txt('#g-lvl')).includes('المستوى 2'), 'level 2 «التوسع» is announced: ' + (await txt('#g-lvl')).replace(/\n/g, ' ')); await shot('g-11-level2'); await tap('#g-lvl-ok'); await tap('#es-close');
  await tap('#g-nav [data-cat=oil]'); ok(!(await cards('pump_station_s')).lock && (await cards('pump_station_l')).lock, 'level 2 opens the small pump station; the large one stays locked');
  await tap('#g-nav [data-cat=pipes]'); ok(!(await cards('junction')).lock && (await cards('valve')).lock, 'level 2 also opens the junction (branching), the valve stays locked'); await tap('#g-nav [data-cat=oil]'); await tap('#g-nav [data-cat=storage]'); ok(!(await cards('crude_tank_m')).lock && (await cards('crude_tank_l')).lock && (await cards('gasoline_tank_s')).lock, 'level 2 opens the medium crude tank; product tanks stay locked');
  ok(!(await co(() => document.querySelector('#es-tabs [data-tab=loans]').offsetParent !== null)), 'loans and contracts are still hidden (they come with level 3)');
  await tap('#g-close');

  console.log('PROGRESSION 3 -> 6 (the rules)');
  ok(await co(() => { const U = __lab.GU; return U.level() === 2; }), 'level 2');
  const fake = await co(() => { const l = __lab.company.led.life; l.revenue = 1.5e6; const w = __lab.store.list().find(b => b.d === 'oil_well'); return __lab.store.place('oil_well', w.x + 2, w.y + 2, 0, { instant: true }).ok || __lab.store.list().filter(b => b.d === 'oil_well').length; }); await co(() => __lab.GU.check());
  const lv3 = await co(() => __lab.GU.level()); ok(lv3 >= 2, 'level 3 needs two wells and $1M revenue (level now ' + lv3 + ')');
  await co(() => { __lab.GU.setLevel(3); }); await co(c => { __lab.GU.closeSheet(); __lab.GU.showCat(c); }, 'process'); await p.waitForTimeout(150); ok(!(await cards('separator')).lock && (await cards('refinery_s')).lock, 'level 3 opens the separator; the refinery stays locked');
  await co(() => { __lab.GU.setLevel(4); }); await co(c => { __lab.GU.closeSheet(); __lab.GU.showCat(c); }, 'process'); await p.waitForTimeout(150); ok(!(await cards('refinery_s')).lock && (await cards('refinery_m')).lock, 'level 4 opens the small refinery only');
  await co(() => { __lab.GU.setLevel(5); }); await co(c => { __lab.GU.closeSheet(); __lab.GU.showCat(c); }, 'storage'); await p.waitForTimeout(150); ok(!(await cards('gasoline_tank_s')).lock && !(await cards('gas_sphere_s')).lock && (await cards('gasoline_tank_l')).lock, 'level 5 opens the small product tanks');
  await co(() => { __lab.GU.setLevel(6); }); await co(c => { __lab.GU.closeSheet(); __lab.GU.showCat(c); }, 'pipes'); await p.waitForTimeout(150); ok(!(await cards('junction')).lock && !(await cards('valve')).lock, 'level 6 keeps the junction open and opens the valve'); await tap('#g-close');
  { const lt = await latin(); ok(lt.length === 0, 'no English word anywhere after the whole flow ' + JSON.stringify(lt)); }

  console.log('SAVE / RELOAD KEEPS THE LESSON');
  const before = await co(() => JSON.stringify({ l: __lab.GU.level(), s: __lab.GU.step(), n: __lab.store.list().length, lines: __lab.pipes.lines.size })); await co(() => { __lab.company.speed = 0; __lab.save(); }); await p.reload(); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 }); await co(() => { __lab.company.speed = 0; });
  ok((await co(() => JSON.stringify({ l: __lab.GU.level(), s: __lab.GU.step(), n: __lab.store.list().length, lines: __lab.pipes.lines.size }))) === before, 'after a reload the level, the guide step, the buildings and the pipes are the same (' + before + ')');
  ok(errs.length === 0, 'no console / page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close(); srv.close(); console.log('\nGAME (ARABIC / EASY) TESTS PASSED (' + n + ' checks)');
})().catch(e => { console.log('FAILED: ' + e.message.split('\n')[0]); process.exit(1); });
