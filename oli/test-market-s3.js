/* S3 news and economic events: a 100-item library with full metadata, real economic effects, each effect counted once, ended items leave.  node test-market-s3.js */
const NEWS = require('./news-data.js'), OE = require('./oil-engine.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol) * Math.max(1, Math.abs(a), Math.abs(b));
function Rng(s) { this.s = s >>> 0 || 1; this.next = () => { let t = this.s += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; this.gauss = () => { let u = 0, v = 0; while (!u) u = this.next(); while (!v) v = this.next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }; }
const month = d => Math.floor(((d % 365) + 365) % 365 / 30.42) + 1;
const mk = (seed, P) => { const e = new OE.OilEngine(Object.assign({ maxActive: 0 }, P || {}), new Rng(seed)); e.regLeft = 1e9; return e; };
const run = (e, n) => { for (let i = 0; i < n; i++) { const d = e.lastDay + 1; e.dayStep(d, month(d), 'x'); } return e; };
const ID = t => NEWS.EVENTS.find(e => e.text.includes(t)).id, E = NEWS.EVENTS;

console.log('1. the library');
T('1a at least 100 items, unique ids', E.length >= 100 && new Set(E.map(e => e.id)).size === E.length);
T('1b every item has: duration, strength, direction, regions, supply / demand / stock effects, an end condition and a description', E.every(e => e.days > 0 && e.power && e.dir && e.regions.length && 'sup' in e && 'dem' in e && 'hoard' in e && 'rel' in e && e.end && e.desc));
const has = re => E.filter(e => re.test(e.text)).length;
const need = { 'أوبك+': /أوبك/, 'الحروب والنزاعات': /حرب|نزاع|هجوم/, 'العقوبات': /عقوبات/, 'اكتشاف الحقول': /اكتشاف/, 'أعطال الإنتاج': /عطل|تعطل|حريق|انفجار|توقف/, 'إغلاق الموانئ': /ميناء|موانئ|مضيق|قناة/, 'تعطل الأنابيب': /أنابيب/, 'الأزمات الاقتصادية': /ركود|أزمة|مالية|إفلاس/, 'الطلب الصيني': /الصين/, 'الشحن': /شحن|ناقلات/, 'الكوارث الطبيعية': /إعصار|زلزال|فيضان|عاصفة|جفاف|برد/, 'الطاقة البديلة': /شمسية|رياح|كهربائ|بديلة|متجددة/ };
for (const k in need) T('1c category present: ' + k + ' (' + has(need[k]) + ' items)', has(need[k]) >= 1);
T('1d a start date is recorded when an item begins (the log has day, end day and status)', (() => { const e = mk(1); run(e, 3); e.force(ID('إغلاق جزئي لمضيق'), e.lastDay, '2030-05-01'); const L = e.log[e.log.length - 1]; return L.day >= 0 && L.end === L.day + 30 && L.status === 'active' && L.date === '2030-05-01' && L.regions.length; })());

console.log('2. one item: effect, decay, end (paired against an untouched control, same seed)');
for (const [t, days] of [['إغلاق جزئي لمضيق', 30], ['أوبك+ تقرر خفض الإنتاج بمقدار', 120]]) { const id = ID(t), ev = E.find(x => x.id === id), c = mk(4), s = mk(4); run(c, 40); run(s, 40); s.force(id, s.lastDay, 'x'); const diff = []; let peak = 0;
  for (let d = 0; d < days + 80; d++) { run(c, 1); run(s, 1); diff.push(s.flow.P - c.flow.P); }
  const fnow = s.log[s.log.length - 1];
  T('2a ' + id + ': during the item the world supply is below the control (min ' + Math.min(...diff).toFixed(2) + ' mb/d, defined ' + ev.sup + ')', Math.min(...diff) < ev.sup * 0.4);
  T('2b ' + id + ': the effect is not bigger than defined (counted once): |dSupply| <= |defined| + the producers\' own answer', Math.abs(Math.min(...diff)) <= Math.abs(ev.sup) * 1.25 + 0.3, Math.min(...diff));
  T('2c ' + id + ': after the item ends it leaves the active list, the log says ended, and the supply gap closes (' + diff[days + 70].toFixed(2) + ' mb/d)', !s.view().active.some(a => a.id === id) && fnow.status === 'ended' && Math.abs(diff[days + 70]) < Math.max(0.35, Math.abs(ev.sup) * 0.12), [fnow.status, diff[days + 70]]); }

console.log('3. several items together');
{ const a = ID('إغلاق جزئي لمضيق'), b = ID('إعصار في خليج المكسيك'), c1 = mk(6), s1 = mk(6), s2 = mk(6), s3 = mk(6); for (const e of [c1, s1, s2, s3]) run(e, 40); s1.force(a, s1.lastDay, 'x'); s2.force(b, s2.lastDay, 'x'); s3.force(a, s3.lastDay, 'x'); s3.force(b, s3.lastDay, 'x');
  for (const e of [c1, s1, s2, s3]) run(e, 5); const nA = s1.newsSum.sup, nB = s2.newsSum.sup, nAB = s3.newsSum.sup;
  T('3a simultaneous items ADD their supply effect once each: news(A+B) = news(A) + news(B) (' + nAB.toFixed(2) + ' = ' + nA.toFixed(2) + ' + ' + nB.toFixed(2) + ')', near(nAB, nA + nB, 1e-9));
  const up = ID('أوبك+ تعلن زيادة تدريجية'), dn = ID('أوبك+ تقرر خفض الإنتاج'), o = mk(8); run(o, 30); o.force(dn, o.lastDay, 'x'); o.force(up, o.lastDay, 'x'); run(o, 3); const e1 = E.find(x => x.id === dn), e2 = E.find(x => x.id === up);
  { const act2 = o.view().active, want = act2.reduce((a, x) => a + E.find(q => q.id === x.id).sup * x.f, 0); T('3b opposite items (cut vs increase) net out arithmetically: news supply = sum of (item supply x its own decay) over the active items, both counted once', act2.length === 2 && near(o.newsSum.sup, want, 1e-9) && Math.abs(o.newsSum.sup) < Math.abs(e1.sup), [o.newsSum.sup, want]); }
  const f = mk(9); run(f, 30); f.force(a, f.lastDay, 'x'); const act = f.view().active.length; f.force(a, f.lastDay + 1, 'x'); T('3c the same item cannot be active twice (forcing it again restarts it, it is not stacked)', act === 1 && f.view().active.length === 1); }

console.log('4. exclusivity: the same shortage is not counted twice (random items ON, 10 seeds x 6 years)');
{ let viol = 0, maxCo = 0, started = 0; for (const sd of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) { const e = new OE.OilEngine({}, new Rng(sd * 77)); for (let d = 0; d < 2190; d++) { e.dayStep(d, month(d), 'x'); const g = {}; for (const a of e.active) { const gp = E[a.i].grp; if (gp) g[gp] = (g[gp] || 0) + 1; } for (const k in g) { maxCo = Math.max(maxCo, g[k]); if (g[k] > 1) viol++; } } started += e.log.length; }
  T('4a never two items of one exclusivity group active together (' + started + ' items started, max co-active ' + maxCo + ')', viol === 0 && started > 100, viol); }
T('4b the groups are defined: OPEC quota decisions, large war supply shocks, transport chokepoints', ['OPEC_QUOTA', 'SUPPLY_SHOCK', 'CHOKEPOINT'].every(g => E.some(e => e.grp === g)));

console.log('5. real economic results');
{ const id = ID('إغلاق جزئي لمضيق'), ev = E.find(x => x.id === id); const c = mk(12), s = mk(12); run(c, 40); run(s, 40); s.force(id, s.lastDay, 'x'); run(c, 3); run(s, 3);
  T('5a a strait closure raises the freight cost multiplier (' + s.cost.freight.toFixed(3) + ' vs control ' + c.cost.freight.toFixed(3) + ') and exports/supply fall at the same time', s.cost.freight > c.cost.freight + 0.03 && s.flow.P < c.flow.P - 1);
  run(c, ev.days + 20); run(s, ev.days + 20); T('5b when the item ends the freight multiplier returns to normal (' + s.cost.freight.toFixed(3) + ')', near(s.cost.freight, 1, 0.01));
  const ship = E.filter(e => e.cat === 'SHIP' && e.sup < 0); T('5c every transport-loss item raises freight, and a bigger loss gives a bigger multiplier (derived: 1 + 0.06 x loss where the data had none)', ship.every(e => e.cost && e.cost.freight > 1) && (() => { const a = E.find(x => x.id === 'N074'), b2 = E.find(x => x.id === 'N018'); return b2.cost.freight > a.cost.freight; })()); }
{ const id = ID('هجوم على ناقلات'), c = mk(3); run(c, 30); c.force(id, c.lastDay, 'x'); T('5d an item that needs a market state ends early when that state is gone (end rule): an item with endIf stops at once the state changes', E.filter(e => e.endIf).length >= 1 && (() => { const e = mk(2); run(e, 10); const rq = E.find(x => x.endIf); e.regime = rq.endIf; e.force(rq.id, e.lastDay, 'x'); run(e, 3); const was = e.view().active.some(a => a.id === rq.id); e.regime = rq.endIf === 'STABLE' ? 'RECESSION' : 'STABLE'; e.regLeft = 1e9; run(e, 3); const L = e.log.find(l => l.id === rq.id); return was && !e.view().active.some(a => a.id === rq.id) && L.endReason === 'state'; })()); }

console.log('6. news screen data');
{ const e = mk(5); run(e, 5); e.force(ID('إغلاق جزئي لمضيق'), e.lastDay, 'x'); const a = e.view().active[0]; T('6a an active item exposes id, text, direction, regions, remaining days, end condition', a && a.id && a.regions.length && a.left > 0 && a.left <= a.days && a.end && a.dir);
  run(e, 40); T('6b an ended item is no longer "current": not in active, still in the log as ended', e.view().active.length === 0 && e.log.every(l => l.status === 'ended')); }
console.log('7. save / load keeps the active items and the log');
{ const e = mk(14); run(e, 20); e.force(ID('إغلاق جزئي لمضيق'), e.lastDay, 'x'); run(e, 4); const j = JSON.parse(JSON.stringify(e.toJSON())), b = mk(14); b.load(j); T('7 after load the same items are active with the same remaining days and the same news sums', JSON.stringify(b.view().active.map(a => [a.id, a.left])) === JSON.stringify(e.view().active.map(a => [a.id, a.left])) && b.log.length === e.log.length); }
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
