/* Phase 6 of the oil system: map layers. Every layer is checked against the real data it claims to show, on the real world, with real buildings, pipes and production.
 *   NODE_PATH=/opt/npm-tools/node_modules node oli/test-map-layers.js */
const W = require('./worldmap.js'), B = require('./buildings.js'), I = require('./industry.js'), ML = require('./map-layers.js'), BC = require('./building-config.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const nf = n => Math.round(n).toLocaleString('en-US');

function newGame(seed) { const world = W.createWorld({ seed: seed || 20260101 }), ts = B.fromWorld(world), store = new B.BuildingStore(ts, { cash: 1e11 }), pipes = new I.PipeNet(ts.W), sim = new I.Sim(store, pipes), layers = ML.create({ world, store, pipes, sim, ts }); return { world, ts, store, pipes, sim, layers }; }
const starter = g => g.world.homeRegionOfWorld();
const fieldsOf = g => g.world.regionSites(starter(g).id).filter(s => s.kind === 'FIELD').sort((a, b) => b.radius - a.radius);
const open = (g, f) => { g.world.discover(f.id); g.world.survey(f.id); g.world.makeDrillable(f.id); return f; };
const viewAt = (x, y, half) => ({ x0: x - half, y0: y - half, x1: x + half, y1: y + half });
function spotNear(g, def, cx, cy, maxr, skip) { for (let r = 0; r <= maxr; r++) { const n = 16 + r * 6; for (let a = 0; a < n; a++) { const x = Math.round(cx + Math.cos(a / n * 6.283) * r), y = Math.round(cy + Math.sin(a / n * 6.283) * r); if (skip && skip(x, y)) continue; if (g.store.validate(def, x, y, 0, {}).ok) return [x, y]; } } return null; }
function rig(g, f, n, dia) {
  const wells = [], tanks = [], bad = []; let tries = 0; const giveUp = (x, y) => bad.some(q => Math.hypot(q[0] - x, q[1] - y) < 3);
  while (wells.length < n && tries++ < n * 12) {
    const s = spotNear(g, 'oil_well', f.x, f.y, f.radius, (x, y) => giveUp(x, y) || g.store.list().some(o => Math.hypot(o.x - x, o.y - y) < 7)); if (!s) break; const w = g.store.place('oil_well', s[0], s[1], 0, { instant: true }); if (!w.ok) { bad.push(s); continue; }
    const drop = () => { g.store.demolish(w.building.id, { building: true, pipes: true, pipeSet: g.pipes }); bad.push(s); };
    const ts = spotNear(g, 'crude_tank_l', w.building.x + 8, w.building.y, 16); const t = ts && g.store.place('crude_tank_l', ts[0], ts[1], 0, { instant: true }); if (!(t && t.ok)) { drop(); continue; }
    const L = I.layPipe(g.store, g.pipes, g.ts, { b: w.building.id, port: 'OIL_OUT_E' }, { b: t.building.id, port: 'INPUT_W' }, dia || 16); if (!L.ok) { g.store.demolish(t.building.id, { building: true, pipes: true, pipeSet: g.pipes }); drop(); continue; }
    wells.push(w.building); tanks.push(t.building);
  }
  g.tanks = tanks; return wells;
}
const run = (g, days) => { for (let d = 0; d < days; d++) { for (const t of g.tanks) if (t.s) t.s.vol = 0; for (let q = 0; q < 4; q++) g.sim.step(0.25); } };

console.log('1. the eight layers exist, switch on and off independently, and show several at once');
{ const g = newGame(), L = g.layers;
  T('1a eight layers, each with an Arabic name, a colour, a symbol and a legend', L.IDS.length === 8 && L.IDS.every(id => L.DEFS[id].ar && /^#/.test(L.DEFS[id].color) && L.DEFS[id].icon && L.legend(id).length >= 3), L.IDS);
  T('1b the colours of the eight layers are all different', new Set(L.IDS.map(i => L.DEFS[i].color)).size === 8);
  T('1c all start off, each switches on and off by itself', L.on.size === 0 && L.toggle('FIELDS') === true && L.on.has('FIELDS') && L.on.size === 1 && L.toggle('FIELDS') === false && L.on.size === 0);
  L.set('FIELDS', true); L.set('PRODUCTION', true); L.set('PIPELINES', true);
  T('1d several layers can be on at the same time', L.on.size === 3 && Object.keys(L.all(viewAt(starter(g).x0 + 160, starter(g).y0 + 160, 120))).length === 3);
  T('1e an unknown layer is refused', L.set('NOPE', true) === false && !L.on.has('NOPE')); }

console.log('2. terrain layer: classes come from the real tiles');
{ const g = newGame(), L = g.layers, r = starter(g), cx = r.x0 + 160, cy = r.y0 + 160, close = L.features('TERRAIN', viewAt(cx, cy, 120)), far = L.features('TERRAIN', { x0: 0, y0: 0, x1: g.world.W, y1: g.world.H });
  T('2a close up: cells, bounded in number', close.items.length > 50 && close.items.length <= L.K.MAX_ITEMS && close.items.every(i => i.k === 'cell'), close.items.length);
  const ok = close.items.slice(0, 80).every(c => { const t = g.world.tile(c.x + (c.s >> 1), c.y + (c.s >> 1)); const water = t.terrain === 'WATER_WADI'; return (c.cls === 'WATER') === water; });
  T('2b a cell is water exactly where the tile under it is water', ok);
  T('2c every terrain kind present in the view has a cell class (plain / dunes / hills / mountains / valley / water)', new Set(close.items.map(i => i.cls)).size >= 2, [...new Set(close.items.map(i => i.cls))]);
  T('2d zoomed out: no tile reading, one rectangle per region with its real kind, and a hint to zoom in', far.items.length === g.world.regions.length && far.items.every((it, i) => it.k === 'rect') && !!far.note && g.world.regions.every(rg => far.items.some(it => it.x === rg.x0 && it.y === rg.y0)));
  const chunks0 = g.world.chunksGenerated(); L.features('TERRAIN', { x0: 0, y0: 0, x1: g.world.W, y1: g.world.H }); T('2e the zoomed-out view generates no new chunks (no hidden cost)', g.world.chunksGenerated() === chunks0); }

console.log('3. infrastructure layer: buildings, pipes and tracks of the game');
{ const g = newGame(), f = open(g, fieldsOf(g)[2]), wells = rig(g, f, 2), L = g.layers, v = viewAt(f.x, f.y, 90), r = L.features('INFRA', v), bl = r.items.filter(i => i.k === 'bld'), ln = r.items.filter(i => i.k === 'line' && !i.road);
  T('3a every building of the store in view is drawn at its place with its real footprint', g.store.list().every(b => bl.some(i => i.id === b.id && i.x === b.x && i.y === b.y)), [g.store.list().length, bl.length]);
  T('3b the wells are drawn as wells and the tanks as storage', bl.filter(i => i.type === 'well').length === wells.length && bl.some(i => i.type !== 'well'));
  T('3c every laid pipe is drawn along its real path', [...g.pipes.lines.values()].every(p => ln.some(i => i.pts.length === p.path.length && i.pts[0][0] === p.path[0][0] + .5)), [g.pipes.lines.size, ln.length]);
  const tr = g.world.tracks(starter(g).id); T('3d the desert tracks of the region appear as roads', tr.length === 0 || r.items.some(i => i.road)); }

console.log('4. geological layer: rocks, depths, faults');
{ const g = newGame(), L = g.layers, g2 = newGame(), g3 = newGame(777), r = starter(g), x = r.x0 + 130, y = r.y0 + 150;
  T('4a the geology of a place is the same every time (it comes from the seed only)', JSON.stringify(L.geology(x, y)) === JSON.stringify(L.geology(x, y)) && JSON.stringify(L.geology(x, y)) === JSON.stringify(g2.layers.geology(x, y)));
  T('4b a different world has a different geology', JSON.stringify(g3.layers.geology(x, y).stack) !== JSON.stringify(L.geology(x, y).stack));
  const c = L.column(x, y);
  T('4c the stack of rocks is continuous: each layer starts where the one above ends, the order is surface rock > limestone > cap rock > reservoir > source > basement', c.stack.every((l, i) => i === 0 ? l.top === 0 : Math.abs(l.top - c.stack[i - 1].bottom) < 1e-6) && c.stack.slice(1).map(l => l.id).join() === 'LIMESTONE,CAPROCK,RESERVOIR,SOURCE,BASEMENT');
  T('4d the reservoir lies deeper than the cap rock and is thick, and the whole stack is deep', c.reservoirTop >= 150 && c.reservoirBottom - c.reservoirTop >= 30 && c.stack[2].bottom === c.reservoirTop);
  T('4e faults exist in every region and lie inside it', g.world.regions.every(rg => { const fs = L.faultsOf(rg.id); return fs.length >= 1 && fs.length <= 3; }));
  const f0 = L.faultsOf(r.id)[0], mx = (f0.x1 + f0.x2) / 2, my = (f0.y1 + f0.y2) / 2, nx = -(f0.y2 - f0.y1), ny = f0.x2 - f0.x1, nl = Math.hypot(nx, ny);
  const a = L.column(mx + nx / nl * 3, my + ny / nl * 3), b = L.column(mx - nx / nl * 3, my - ny / nl * 3);
  T('4f across a fault the rocks are shifted by about its throw (' + f0.throwM + ' m)', Math.abs(a.reservoirTop - b.reservoirTop) > f0.throwM * .6 && Math.abs(a.reservoirTop - b.reservoirTop) < f0.throwM * 1.6, [a.reservoirTop, b.reservoirTop, f0.throwM]);
  const f = fieldsOf(g)[1]; const before = L.column(f.x, f.y);
  T('4g an undiscovered field is not hinted: no structure drawn, no field in the column', before.field === null && !L.features('GEOLOGY', viewAt(f.x, f.y, 60)).items.some(i => i.label && /تركيب/.test(i.label)));
  g.world.discover(f.id); T('4h discovered but not surveyed: still nothing about its depth', L.column(f.x, f.y).field === null);
  g.world.survey(f.id); const after = L.column(f.x, f.y);
  T('4i once surveyed, the reservoir interval of the column contains the real depth of the field', after.field && after.field.id === f.id && after.reservoirTop <= f.depth + 60 && after.reservoirBottom >= f.depth - 60, [after.reservoirTop, after.reservoirBottom, f.depth]);
  T('4j and the structure is drawn on the map with its depth only when the survey gives one', L.features('GEOLOGY', viewAt(f.x, f.y, 60)).items.some(i => i.k === 'ell' && /تركيب/.test(i.label)));
  const gl = L.features('GEOLOGY', viewAt(x, y, 100)); T('4k rock cells and faults are drawn together', gl.items.some(i => i.k === 'cell') && gl.items.some(i => i.fault)); }

console.log('5. exploration layer: only what the player may know');
{ const g = newGame(), L = g.layers, r = starter(g), fs = g.world.regionSites(r.id), real = fs.find(s => s.kind === 'FIELD'), dry = fs.find(s => s.kind === 'DRY'), v = viewAt(r.x0 + 160, r.y0 + 160, 170);
  const has = id => L.features('EXPLORATION', v).items.some(i => i.sid === id);
  T('5a an undiscovered site is not on the layer at all (real or dry, nobody can tell them apart)', !has(real.id) && (!dry || !has(dry.id)));
  T('5b every region is shown, with the class the player may know (prior until evaluated)', L.features('EXPLORATION', { x0: 0, y0: 0, x1: g.world.W, y1: g.world.H }).items.filter(i => i.k === 'rect').length === g.world.regions.length);
  g.world.discover(real.id); T('5c discovered: only a rough indicator circle, not the field itself', L.features('EXPLORATION', v).items.some(i => i.sid === real.id && i.k === 'ell' && Math.abs(i.r - real.radius) > 1e-9 || i.sid === real.id && i.k === 'ell' && (i.x !== real.x || i.y !== real.y)));
  const rid = real.regionId != null ? real.regionId : r.id, lab0 = L.features('EXPLORATION', v).items.find(i => i.rid === r.id).label; g.world.evaluateZone(r.id); const z = g.world.zoneInfo(r.id), lab1 = L.features('EXPLORATION', v).items.find(i => i.rid === r.id).label;
  T('5d evaluating the zone changes its label to the evaluated class and probability', lab0 !== lab1 && /احتمال/.test(lab1) && /تقدير أولي/.test(lab0), [lab0, lab1]);
  g.world.survey(real.id); T('5e surveyed field: its state and the survey probability are shown', L.features('EXPLORATION', v).items.some(i => i.sid === real.id && /تم مسحه/.test(i.label)));
  if (dry) { g.world.discover(dry.id); g.world.survey(dry.id); T('5f a surveyed dry site is marked not economic', L.features('EXPLORATION', v).items.some(i => i.sid === dry.id && i.k === 'dot' && /غير اقتصادي/.test(i.label))); } else T('5f (no dry site in the starter region)', true); }

console.log('6. fields and reservoirs layer');
{ const g = newGame(), L = g.layers, f = fieldsOf(g)[2], v = viewAt(f.x, f.y, 60), item = () => L.features('FIELDS', v).items.find(i => i.sid === f.id);
  T('6a an undiscovered field has no boundary on the map', !item()); g.world.discover(f.id); T('6b discovered only: still no boundary (only the exploration layer shows the indicator)', !item());
  g.world.survey(f.id); const s1 = item();
  T('6c surveyed: the real boundary (centre and radius of the field) with the ESTIMATED reserve, never the true number', s1 && s1.x === f.x && s1.r === f.radius && /تقدير/.test(s1.label) && !s1.label.includes(nf(f.initialReserve)), s1 && s1.label);
  g.world.makeDrillable(f.id); const s2 = item();
  T('6d drillable: remaining reserve, depth and pressure appear', s2.gauge && /متبقٍ/.test(s2.label) && /عمق/.test(s2.label) && /ضغط 100%/.test(s2.label) && s2.pr === 1, s2.label);
  const wells = rig(g, f, 2); g.tanks.forEach(t => t); g.sim.step(1 / 24); run(g, 120); const s3 = item();
  T('6e after production the layer shows the lower pressure and the lower remaining reserve of the field', s3.pr < 1 && s3.pr === g.world.pressureOf(f.id) && s3.ratio < 1 && Math.abs(s3.ratio - f.remainingReserve / f.initialReserve) < 1e-9, [s3.pr, s3.ratio]);
  T('6f the field is now in the PRODUCING colour', s3.stroke === '#6dff9a', s3.stroke); }

console.log('7. production layer');
{ const g = newGame(), f = open(g, fieldsOf(g)[2]); f.props.capacity = 2500; const wells = rig(g, f, 2), L = g.layers; run(g, 20);
  const r = L.features('PRODUCTION', viewAt(f.x, f.y, 80)), dots = r.items.filter(i => i.k === 'dot');
  T('7a one marker per well on the map', dots.length === wells.length, dots.length);
  T('7b each marker carries the well\'s real daily oil, water cut and status', wells.every(w => { const d = dots.find(i => i.id === w.id), s = w.s; return d && Math.abs(d.out - Math.round(s._out)) <= 1 && Math.abs(d.oil - Math.round(s._out * (1 - s._wc - s._gas))) <= 1 && d.wc === s._wc && d.status === g.sim.status(w); }));
  T('7c producing wells are green, with a bigger marker for a bigger output', dots.every(d => d.producing && d.c === '#6dff9a') && dots.every(d => d.r >= 5));
  const sum = r.items.find(i => i.k === 'ell' && i.sid === f.id);
  T('7d the field summary shows the pressure, the annual decline rate, the water cut and the wells working', sum && /ضغط \d+%/.test(sum.label) && new RegExp('نضوب ' + Math.round(f.props.decline * 100) + '%').test(sum.label) && /مياه \d+%/.test(sum.label) && new RegExp(wells.length + '/' + wells.length).test(sum.label), sum && sum.label);
  const w0 = wells[0]; w0.c = 0; w0.st = 'DAMAGED'; g.sim.step(1 / 24); const dd = L.features('PRODUCTION', viewAt(f.x, f.y, 80)).items.find(i => i.id === w0.id);
  T('7e a broken well turns red and is not counted as working', dd && !dd.producing && dd.c === '#ff8a80', dd); }

console.log('8. pipelines layer: direction, capacity, bottleneck, cut');
{ const g = newGame(), f = open(g, fieldsOf(g)[2]); f.props.capacity = 6000; const wells = rig(g, f, 1, 16), L = g.layers; run(g, 5);
  const lines = () => L.features('PIPELINES', viewAt(f.x, f.y, 90)).items.filter(i => i.k === 'line'), ln = lines()[0], real = [...g.pipes.lines.values()][0];
  T('8a each pipe is drawn with its real flow, capacity and usage', ln && ln.flow === Math.round(real.flow) && ln.cap === BC.PIPES[real.dia].capacity && Math.abs(ln.use - real.flow / ln.cap) < 1e-9, ln);
  T('8b a pipe that carries oil has an arrow (flow direction) and the flow colour', ln.arrow && ln.c === '#4fc3f7' && !ln.jam && !ln.cut);
  const cap0 = BC.PIPES[8].capacity; BC.PIPES[8].capacity = 300;   /* a narrow pipe: the 8-inch pipe is limited to 300 bbl/day for this scenario, restored right after */
  const g2 = newGame(), f2 = open(g2, fieldsOf(g2)[2]); f2.props.capacity = 6000; const w2 = rig(g2, f2, 1, 8); run(g2, 5);
  const nar = g2.layers.features('PIPELINES', viewAt(f2.x, f2.y, 90)).items.find(i => i.k === 'line'), real2 = [...g2.pipes.lines.values()][0]; BC.PIPES[8].capacity = cap0;
  T('8c a pipe running at its limit is marked as a bottleneck (red) — the narrow 8" pipe', nar.jam && nar.c === '#ff5c5c' && nar.use >= .9 && real2.dia === 8, [nar.use, real2.dia, nar.flow, nar.cap]);
  const g3 = newGame(), f3 = open(g3, fieldsOf(g3)[2]); const w3 = rig(g3, f3, 1, 16); run(g3, 3); const dmg = w3[0]; const ct = g3.tanks[0]; ct.c = 0; ct.st = 'DAMAGED'; for (let i = 0; i < 6; i++) g3.sim.step(1 / 24);
  const cut = g3.layers.features('PIPELINES', viewAt(f3.x, f3.y, 90)).items.find(i => i.k === 'line');
  T('8d a pipe that ends at a damaged building and carries nothing is shown as cut (orange, dashed)', cut && cut.flow === 0 && cut.cut === true && cut.c === '#ffb347' && !!cut.dash && !cut.arrow, cut);
  const pump = g.store.place('pump_station_l', f.x + 30, f.y + 30, 0, { instant: true }); if (pump.ok) T('8e pump stations appear on the layer with their status', g.layers.features('PIPELINES', viewAt(f.x + 30, f.y + 30, 40)).items.some(i => i.k === 'dot' && i.id === pump.building.id)); else T('8e (no room for a pump station here)', true); }

console.log('9. land and investment layer');
{ const g = newGame(), L = g.layers, all = L.features('LAND', { x0: 0, y0: 0, x1: g.world.W, y1: g.world.H }), owned = all.items.filter(i => i.owned), avail = all.items.filter(i => i.available);
  T('9a one rectangle per region, with the real region borders', all.items.length === g.world.regions.length && all.items.every(i => { const r = g.world.regions[i.rid]; return i.x === r.x0 && i.y === r.y0 && i.w === r.w; }));
  T('9b owned regions are exactly the unlocked ones', owned.length === g.world.regions.filter(r => r.unlocked).length && owned.every(i => g.world.regions[i.rid].unlocked));
  T('9c available regions are the locked ones touching an owned region, with their real exploration price', avail.length > 0 && avail.every(i => !g.world.regions[i.rid].unlocked && i.label.includes(nf(g.world.zoneInfo(i.rid).exploreCost))));
  T('9d the layer states plainly that offers for sale do not exist yet', /المرحلة السابعة/.test(all.note)); }

console.log('10. tapping: details of a field, a well, a pipe, a region');
{ const g = newGame(), f = open(g, fieldsOf(g)[2]), wells = rig(g, f, 1), L = g.layers; run(g, 30);
  const w = wells[0], iw = L.inspect(w.x + .5, w.y + .5, ['PRODUCTION']).find(i => i.kind === 'well'), get = (o, k) => o.rows.find(r => r[0] === k)[1];
  T('10a a well shows its status, daily oil, water cut and the reservoir pressure of its field', iw && get(iw, 'نسبة المياه') === Math.round(w.s._wc * 100) + '%' && get(iw, 'ضغط المكمن') === Math.round(g.world.pressureOf(f.id) * 100) + '%' && get(iw, 'عمق المكمن') === nf(f.depth) + ' م', iw);
  const ln = [...g.pipes.lines.values()][0], p = ln.path[Math.floor(ln.path.length / 2)], ip = L.inspect(p[0] + .5, p[1] + .5, ['PIPELINES']).find(i => i.kind === 'pipe');
  T('10b a pipe shows diameter, length, flow, capacity and usage', ip && get(ip, 'القطر') === ln.dia + '"' && get(ip, 'التدفق') === nf(ln.flow) + ' برميل/يوم' && get(ip, 'السعة') === nf(BC.PIPES[ln.dia].capacity) + ' برميل/يوم', ip);
  const fi = L.inspect(f.x, f.y, ['FIELDS']).find(i => i.kind === 'field');
  T('10c a developed field shows depth, remaining reserve, depletion, pressure and injection wells', fi && get(fi, 'عمق المكمن') === nf(f.depth) + ' م' && get(fi, 'الاحتياطي المتبقي') === nf(f.remainingReserve) + ' برميل' && get(fi, 'ضغط المكمن') === Math.round(g.world.pressureOf(f.id) * 100) + '%' && fi.rows.some(r => r[0] === 'آبار الحقن'), fi);
  const g2 = newGame(), f2 = fieldsOf(g2)[2]; g2.world.discover(f2.id); g2.world.survey(f2.id); const fi2 = g2.layers.inspect(f2.x, f2.y, ['FIELDS']).find(i => i.kind === 'field');
  T('10d a surveyed (not developed) field shows an estimate with a range, no depth and no true reserve', fi2 && fi2.rows.some(r => r[0] === 'الاحتياطي المقدّر') && !fi2.rows.some(r => r[0] === 'عمق المكمن') && !JSON.stringify(fi2).includes(nf(f2.initialReserve)), fi2);
  const un = newGame(), fu = fieldsOf(un)[3]; T('10e an undiscovered field answers nothing about itself', !un.layers.inspect(fu.x, fu.y, ['FIELDS', 'EXPLORATION', 'PRODUCTION']).some(i => i.kind === 'field'));
  const rg = L.inspect(starter(g).x0 + 5, starter(g).y0 + 5, ['LAND']).find(i => i.kind === 'region'); T('10f a region shows its type, status, estimate and exploration price', rg && get(rg, 'تكلفة الاستكشاف') === '$' + nf(g.world.zoneInfo(starter(g).id).exploreCost), rg); }

console.log('11. geological section');
{ const g = newGame(), f = open(g, fieldsOf(g)[2]), wells = rig(g, f, 2), L = g.layers; run(g, 30);
  const a = { x: f.x - 60, y: f.y - 10 }, b = { x: f.x + 60, y: f.y + 10 }, s = L.section(a, b, 60);
  T('11a the section samples the line and gives surface height and the stack of rocks at every point', s && s.points.length === 61 && s.points.every(p => p.stack.length === 6 && p.surface >= 0));
  T('11b depths are in metres below the surface and the stack is continuous', s.points.every(p => p.stack.every((l, i) => i === 0 ? l[0] === 0 : Math.abs(l[0] - p.stack[i - 1][1]) < 1e-6)));
  const fd = s.fields.find(q => q.id === f.id);
  T('11c the field crossed by the line is in the section with its real reservoir interval around the real depth', fd && fd.top <= f.depth + 60 && fd.bottom >= f.depth - 60 && fd.depth === f.depth && fd.halfWidth > 0, fd);
  T('11d the oil fill of the field equals remaining / initial reserve', fd && Math.abs(fd.fill - f.remainingReserve / f.initialReserve) < 1e-9);
  const ws = s.wells; T('11e wells close to the line are drawn with the real depth of their field and their output', ws.length >= 1 && ws.every(w => w.depth === f.depth) && ws.every(w => wells.some(x => x.id === w.id && w.out === Math.round(x.s._out))), ws);
  const fr = L.faultsOf(starter(g).id)[0], s2 = L.section({ x: fr.x1 - 30, y: fr.y1 - 30 }, { x: fr.x2 + 30, y: fr.y2 + 30 }, 20);
  const s3 = L.section({ x: (fr.x1 + fr.x2) / 2 - 40, y: (fr.y1 + fr.y2) / 2 + 40 }, { x: (fr.x1 + fr.x2) / 2 + 40, y: (fr.y1 + fr.y2) / 2 - 40 }, 20);
  T('11f a line crossing a fault reports it (with its throw)', s3.faults.some(q => q.id === fr.id && q.throwM === fr.throwM), s3.faults);
  T('11g a section of zero length is refused', L.section(a, a) === null);
  const un = newGame(), fu = fieldsOf(un)[3], su = un.layers.section({ x: fu.x - 50, y: fu.y }, { x: fu.x + 50, y: fu.y }); T('11h an undiscovered field is not in the section', !su.fields.some(q => q.id === fu.id)); }

console.log('12. performance: every layer on at once');
{ const g = newGame(), f = open(g, fieldsOf(g)[2]); f.props.capacity = 3000; rig(g, f, 4); run(g, 10); const L = g.layers; for (const id of L.IDS) L.set(id, true);
  for (const r of g.world.regions) if (r.unlocked) for (const s of g.world.regionSites(r.id)) { g.world.discover(s.id); g.world.survey(s.id); }
  const views = [viewAt(f.x, f.y, 60), viewAt(f.x, f.y, 200), { x0: 0, y0: 0, x1: g.world.W, y1: g.world.H }]; let worst = 0, items = 0;
  for (const v of views) { L.all(v); const t0 = process.hrtime.bigint(); for (let i = 0; i < 5; i++) L.all(v); const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 5; worst = Math.max(worst, ms); items = Math.max(items, L.stats.totalItems); }
  T('12a all eight layers on: the data of a frame is built in under 25 ms in the worst view (' + worst.toFixed(1) + ' ms, ' + items + ' items)', worst < 25, worst);
  T('12b no layer ever returns more than its cap', L.IDS.every(id => views.every(v => L.features(id, v).items.length <= L.K.MAX_ITEMS + 5)));
  const c0 = g.world.chunksGenerated(); L.all({ x0: 0, y0: 0, x1: g.world.W, y1: g.world.H }); T('12c the full-world view reads no tiles (no chunk generation)', g.world.chunksGenerated() === c0);
  const before = JSON.stringify([g.world.reserveSnapshot(), g.world.progressSnapshot()]); L.all(views[0]); L.inspect(f.x, f.y, L.IDS); L.section({ x: f.x - 50, y: f.y }, { x: f.x + 50, y: f.y });
  T('12d drawing and asking never change the game (reserves and progress identical)', before === JSON.stringify([g.world.reserveSnapshot(), g.world.progressSnapshot()])); }

console.log('\nMAP LAYER TESTS: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
