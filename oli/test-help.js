/* The in-game help (help.js): every building, pipe, central segment and oil field gets the same 12-section Arabic help sheet,
 * built from the game's real data and the object's LIVE state, and reading it never changes the game.
 *   node oli/test-help.js */
const { B, I, E, EC, game, put, pipe, chain } = require('./test-economy-helpers.js');
const H = require('./help.js'), BC = require('./building-config.js'), GC = require('./game-config.js'), K = require('./test-central-kit.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' ' + JSON.stringify(x).slice(0, 400))); } };
const ctx = g => ({ GC, B, BC, EC, SIM: g.sim, store: g.store, pipes: g.net, company: g.co, CEN: K.C });
const text = d => H.html(d, new Set(H.SECTIONS.map(s => s[0])));
const clean = s => !/undefined|NaN|\[object|null(?![_a-z])/.test(s.replace(/<[^>]+>/g, ' '));
const full = d => H.SECTIONS.every(([k]) => Array.isArray(d.sec[k]) && d.sec[k].length && d.sec[k].every(x => typeof x === 'string' && x.trim().length));
const has = (d, re) => re.test(text(d));
const stockUp = co => { for (const [m, q] of [['CHEM', 20000], ['OPS', 5000]]) co.buy(m, q, 'A', 'CASH'); };

console.log('1. every building in the game has a full help sheet before it is built (auto-extends with new defs)');
{ const g = game(5e9), ids = Object.keys(B.DEFS);
  const bad = ids.filter(id => { const d = H.definition(ctx(g), id); return !d || !full(d) || !clean(text(d)); });
  T('1a all ' + ids.length + ' building types: 12 non-empty sections, no undefined/NaN', !bad.length, bad);
  T('1b the twelve sections are the requested ones, in order', H.SECTIONS.map(s => s[2]).join('|') === 'وظيفة المعدة|طريقة التشغيل|المدخلات|المخرجات|الطاقة الإنتاجية|متطلبات البناء|التوصيلات|الكفاءة|التكاليف|حالة المعدة|المشاكل والحلول|مثال عملي');
  const ref = H.definition(ctx(g), 'refinery_l'), cap = BC.REFINERY.sizes.L.cap;
  T('1c numbers come from the config: large refinery capacity, cost and yields', has(ref, new RegExp(cap.toLocaleString('en-US'))) && has(ref, /\$400 مليون/) && has(ref, /45 بنزين · 30 ديزل · 10 وقود طائرات · 5 غاز/));
  T('1d refinery materials per barrel come from economy-config', has(ref, new RegExp(String(EC.MATERIAL_USE.CHEM.qty) + ' كغ لكل برميل')) && has(ref, new RegExp((cap * EC.MATERIAL_USE.CHEM.qty).toLocaleString('en-US') + ' كغ كيماويات')) && has(ref, /اشترِ كيماويات ومواد تشغيل/));
  const pu = H.definition(ctx(g), 'pump_station_s'); T('1e pump: max flow, boost range and minimum inlet from the config', has(pu, /5,000/) && has(pu, /100 و250/) && has(pu, /15 رطل/));
  const pd0 = H.definition(ctx(g), 'pipe'); T('1e2 the pipe card of the build menu has its own sheet (every diameter from the config)', pd0 && full(pd0) && clean(text(pd0)) && Object.keys(BC.PIPES).every(d => has(pd0, new RegExp(BC.PIPES[d].capacity.toLocaleString('en-US')))));
  const fake = 'help_probe_def'; B.define({ id: fake, name: 'Probe', category: 'PIPELINE', section: 'PIPELINE', family: 'PROBE', type: 'probe', footprint: [2, 2], cost: 123456, maintenanceCost: 10, operatingCost: 20, buildTime: 5, visual: 'valve', allowedTerrain: ['FLAT_DESERT'], maxSlope: 3, capacity: { value: 777, unit: 'bbl/day' }, connections: [] });
  const pd = H.definition(ctx(g), fake); T('1f a NEW building type gets a full sheet automatically (generic profile)', pd && full(pd) && clean(text(pd)) && has(pd, /123,456/) && has(pd, /777/), pd && pd.sec);
  delete B.DEFS[fake]; }

console.log('2. every placed building: live sheet, status and diagnosis');
{ const g = game(5e9), ids = Object.keys(B.DEFS).filter(id => id !== 'central_station'); let x = 4, y = 4; const placed = [];
  for (const id of ids) { const [w, h] = B.DEFS[id].footprint; if (x + w + 3 > 390) { x = 4; y += 16; } const v = g.store.place(id, x, y, 0, { instant: true }); if (v.ok) placed.push(v.building); x += w + 3; }
  for (const b of placed) g.sim.ensure(b); g.sim.step(0.05);
  const bad = placed.filter(b => { const d = H.building(ctx(g), b); return !full(d) || !clean(text(d)) || !d.issues.length; }).map(b => b.d);
  T('2a ' + placed.length + ' placed buildings of every type: full live sheet + at least one diagnosis line', placed.length === ids.length && !bad.length, { n: placed.length, bad });
  const st = placed.filter(b => !/مدة البناء|المساحة/.test(text(H.building(ctx(g), b)))); T('2b every sheet states footprint and build time', !st.length);
  const en = placed.filter(b => /[A-Za-z]{4,}/.test(H.building(ctx(g), b).sec.state.join(' ').replace(/<[^>]+>/g, '').replace(/psi|CRUDE|LPG/g, ''))).map(b => b.d); T('2c the live state lines are all in Arabic (no English indicator names)', !en.length, en); }

console.log('3. smart help: the reason and the fix follow the real state');
{ const g = game(500e6), c = chain(g, true, false); for (const b of g.store.list()) g.sim.ensure(b);
  const w = c.wells[0]; g.sim.ensure(w).started = false; g.co.advanceHours(2);
  let d = H.building(ctx(g), w); T('3a stopped well: status «متوقف بأمرك», tells to press «ابدأ الإنتاج»', d.status.code === 'STOPPED' && d.issues.some(i => /ابدأ الإنتاج/.test(i.fix)), d.issues);
  for (const x of c.wells) g.sim.ensure(x).started = true;
  g.co.advanceHours(48); d = H.building(ctx(g), c.ref);
  T('3b refinery without chemicals: NO_MATERIALS, names the missing materials with stock and daily need', g.sim.status(c.ref) === 'NO_MATERIALS' && d.issues.some(i => /كيماويات 0 كغ \(تحتاج 1,800 كغ\/يوم/.test(i.t) && /الشراء/.test(i.fix)), d.issues);
  stockUp(g.co); g.co.advanceHours(24); d = H.building(ctx(g), c.ref);
  T('3c with materials bought the same refinery runs (no material warning)', /RUNNING|OVER_CAPACITY|LOW_PRESSURE/.test(g.sim.status(c.ref)) && c.ref.s._in > 0 && !d.issues.some(i => /المواد لا تكفي/.test(i.t)), [g.sim.status(c.ref), d.issues]);
  const tk = c.tg, cap = B.DEFS[tk.d].capacity.value; g.sim.ensure(tk).vol = cap; d = H.building(ctx(g), tk);
  T('3d full tank: says full, its capacity and the room left (0), and how to fix', d.issues.some(i => i.tone === 'bad' && /ممتلئ/.test(i.t) && new RegExp(cap.toLocaleString('en-US')).test(i.t) && /المتبقي 0/.test(i.t) && /بِع/.test(i.fix)), d.issues);
  g.sim.ensure(tk).vol = cap * 0.5; d = H.building(ctx(g), tk); T('3e the same tank half full: no full warning, shows level and room left', !d.issues.some(i => /ممتلئ/.test(i.t)) && has(d, /المتبقي/) && has(d, /50%/), d.issues);
  const p2 = put(g, 'pump_station_s', 200, 200); g.sim.ensure(p2); g.sim.step(0.05); d = H.building(ctx(g), p2);
  T('3f pump with nothing connected: names the unconnected inlet and outlet', d.issues.some(i => /الدخول غير موصول/.test(i.t)) && d.issues.some(i => /الخروج غير موصول/.test(i.t)), d.issues);
  const L = [...g.net.lines.values()][0]; d = H.pipe(ctx(g), L); T('3g connected pipe: both ends named, capacity of its diameter', full(d) && clean(text(d)) && has(d, /طرف البداية: بئر نفط/) && has(d, new RegExp(BC.PIPES[L.dia].capacity.toLocaleString('en-US'))), d.sec.conn);
  const wl = put(g, 'oil_well', 150, 150); const r = I.layOpenPipe(g.store, g.net, g.ts, { b: wl.id, port: 'OIL_OUT_E' }, [160, 150], 8); const open = r.ok ? (r.line || [...g.net.lines.values()].pop()) : null;
  if (open) { d = H.pipe(ctx(g), open); const end = open.path[open.path.length - 1]; T('3h open-ended pipe: says which end is open and WHERE (tile)', d.status.tone === 'bad' && d.issues.some(i => i.t.includes('(' + end.join('، ') + ')')), d.issues); } else T('3h open-ended pipe laid', false, r);
  g.sim.step(0.05); d = H.building(ctx(g), wl); T('3i well whose only pipe goes nowhere: help still explains the state', full(d) && d.issues.length > 0); }

console.log('4. central network: station, segment, channel closed / cut');
{ const g = K.mk(); const cx = { GC, B, BC, EC, SIM: g.sim, store: g.store, pipes: g.net, company: g.co, CEN: K.C }, st0 = [...g.cn.st.values()][0], sb = g.store.get(st0.b);
  let d = H.building(cx, sb); T('4a central station sheet: six channels, 300,000 per channel, no connected facility explained', full(d) && clean(text(d)) && has(d, /300,000/) && d.issues.some(i => /لا توجد منشأة موصولة/.test(i.t)), d.issues);
  g.cn.setChannel('CRUDE', 'CLOSED'); d = H.building(cx, sb); T('4b closed crude channel: the station says it neither receives nor distributes, and where to open it', d.issues.some(i => /قناة نفط خام مغلقة/.test(i.t) && /الشبكة المركزية/.test(i.fix)), d.issues); g.cn.setChannel('CRUDE', 'OPEN');
  const sg = [...g.cn.seg.values()][0]; g.cn.setFault(sg.id, 'DIESEL', true); d = H.segment(cx, sg);
  T('4c cut diesel channel on a segment: segment sheet names it and the fix', full(d) && d.status.tone === 'bad' && d.issues.some(i => /ديزل مقطوعة/.test(i.t)), d.issues);
  d = H.building(cx, sb); T('4d the station also warns that a segment of the diesel channel is cut', d.issues.some(i => /ديزل مقطع مقطوع/.test(i.t)), d.issues);
  const pm = [...g.cn.pumps.values()][0], pg = g.cn.seg.get(pm.seg); d = H.segment(cx, pg); T('4e segment with a network pump: direction (forward/reverse) shown', has(d, /أمامي|عكسي/), d.sec.eff);
  const f = { x: 10, y: 10, props: { capacity: 12000 }, remainingReserve: 900000, initialReserve: 1000000, pr: 0.8 }; d = H.field(cx, f, 2); T('4f oil field sheet: field capacity, reserve, wells', full(d) && has(d, /12,000/) && has(d, /900,000/) && has(d, /آبارك في هذا الحقل: 2/)); }

console.log('5. reading the help never changes the game');
{ const g = game(500e6), c = chain(g, true, false); stockUp(g.co); g.co.advanceHours(24);
  const snap = () => JSON.stringify({ s: [...g.store.items.values()].map(b => [b.id, b.st, b.s]), n: g.net.toJSON ? g.net.toJSON() : null, cash: g.store.cash, co: g.co.toJSON() });
  const a = snap(); for (const b of g.store.list()) { H.building(ctx(g), b); text(H.building(ctx(g), b)); } for (const L of g.net.lines.values()) H.pipe(ctx(g), L); for (const id of Object.keys(B.DEFS)) H.definition(ctx(g), id);
  T('5a buildings, pipes, cash and company identical after opening every help sheet', snap() === a); }

console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
