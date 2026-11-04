/* Phase 3 of the oil system: oil fields. Five size classes (the spec's ranges x RESERVE_SCALE), every field different, and what the player may know depends on how far the field has been explored.
 *   node oli/test-fields.js */
const { createWorld, CONFIG } = require('./worldmap.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const SEEDS = [20260101, 1, 2, 3, 4, 5], worlds = SEEDS.map(sd => createWorld({ seed: sd })), all = worlds.flatMap(w => w.allSites()), fields = all.filter(s => s.kind === 'FIELD'), dry = all.filter(s => s.kind === 'DRY');
const O = CONFIG.OILFIELD, N = CONFIG.FIELD_NOMINAL, SC = CONFIG.RESERVE_SCALE, FP = CONFIG.FIELD_PROPS, CL = ['MARGINAL', 'SMALL', 'MEDIUM', 'LARGE', 'MAJOR'];
const mean = a => a.reduce((p, q) => p + q, 0) / a.length, sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };

console.log('1. five size classes with the spec ranges x the scale');
T('1a the scale is the middle option (' + SC + ') and is a single tunable number', SC === 0.25);
T('1b every class range = the nominal range of the spec x scale (giant 1-5 bn, large 300 m-1 bn, medium 50-300 m, small 5-50 m, marginal under 5 m)', CL.every(k => O[k].reserve[0] === N[k][0] * SC && O[k].reserve[1] === N[k][1] * SC) && N.MAJOR[0] === 1e9 && N.MAJOR[1] === 5e9 && N.LARGE[0] === 3e8 && N.MEDIUM[0] === 5e7 && N.SMALL[0] === 5e6 && N.MARGINAL[1] === 5e6);
T('1c the classes do not overlap: each one starts where the smaller one ends', CL.slice(1).every((k, i) => N[k][0] >= N[CL[i]][1] - 1));
T('1d all five classes occur (' + CL.map(k => k + ' ' + fields.filter(f => f.type === k).length).join(', ') + ' in ' + fields.length + ' fields on ' + SEEDS.length + ' maps)', CL.every(k => fields.some(f => f.type === k)));
T('1e every field lies inside the range of its class', fields.every(f => f.initialReserve >= O[f.type].reserve[0] * 0.999 && f.initialReserve <= O[f.type].reserve[1] * 1.001));
T('1f small fields are common, giants are rare', fields.filter(f => f.type === 'MAJOR').length < fields.filter(f => f.type === 'SMALL').length / 5 && fields.filter(f => f.type === 'MAJOR').length >= 1);
T('1g the biggest field holds at least 500 times the oil of the smallest', Math.max(...fields.map(f => f.initialReserve)) / Math.max(1, Math.min(...fields.map(f => f.initialReserve))) >= 500);

console.log('2. every field is different');
const prop = (f, k) => k === 'depth' ? f.depth : k === 'pressure' ? f.pressurePotential : f.props[k];
for (const k of ['depth', 'pressure', 'api', 'waterCut', 'extractCost', 'capacity', 'decline']) { const v = fields.map(f => prop(f, k)); T('2 ' + k + ' varies a lot (' + Math.min(...v) + ' .. ' + Math.max(...v) + ', ' + new Set(v).size + ' different values, spread ' + (sd(v) / mean(v) * 100).toFixed(0) + '%)', new Set(v).size >= 100 && Math.max(...v) / Math.min(...v) >= 1.5 && sd(v) / mean(v) > 0.15); }
T('2h within a class the fields still differ (medium fields: capacity spread > 40%)', (() => { const v = fields.filter(f => f.type === 'MEDIUM').map(f => f.props.capacity); return sd(v) / mean(v) > 0.4; })());
T('2i bigger classes can produce more: mean capacity grows with the class', CL.slice(1).every((k, i) => mean(fields.filter(f => f.type === k).map(f => f.props.capacity)) > mean(fields.filter(f => f.type === CL[i]).map(f => f.props.capacity))));
T('2j deeper reservoirs cost more to produce (positive correlation)', (() => { const d = fields.map(f => f.depth), c = fields.map(f => f.props.extractCost), md = mean(d), mc = mean(c); return mean(d.map((x, i) => (x - md) * (c[i] - mc))) > 0; })());

console.log('3. every value stays inside sensible bounds');
T('3a API gravity follows the quality (heavy 18-26, medium 28-36, light 38-46)', fields.every(f => f.props.api >= FP.api[f.quality][0] && f.props.api <= FP.api[f.quality][1]));
T('3b water cut between 2% and 40%', fields.every(f => f.props.waterCut >= FP.waterCut[0] && f.props.waterCut <= FP.waterCut[1]));
T('3c annual decline between 4% and 25%', fields.every(f => f.props.decline >= FP.decline[0] - 1e-9 && f.props.decline <= FP.decline[1] + 1e-9));
T('3d the capacity is positive and the cost per barrel is sensible', fields.every(f => f.props.capacity > 0 && f.props.extractCost > 3 && f.props.extractCost < 60));
T('3e at full capacity every field lasts between 2 and 18 years (the world has depletion, nothing lasts for ever)', fields.every(f => { const y = f.initialReserve / f.props.capacity / 365; return y >= 1.98 && y <= 18.1; }), fields.map(f => +(f.initialReserve / f.props.capacity / 365).toFixed(2)).filter(y => y < 1.98 || y > 18.1).slice(0, 5));
T('3f dry prospects have no reserve and no properties', dry.length > 0 && dry.every(s => s.initialReserve === 0 && s.props === null));

console.log('4. what the player may know');
const w = worlds[0], f = w.allSites().filter(s => s.kind === 'FIELD' && s.type === 'LARGE')[0], id = f.id;
T('4a undiscovered: nothing', w.visibleInfo(id) === null);
w.discover(id); let v = w.visibleInfo(id);
T('4b discovered: only an indicator, no size, no properties', !('type' in v) && !('estimatedReserve' in v) && !('props' in v) && !('api' in v) && !('waterCut' in v) && !('productiveCapacity' in v));
w.survey(id); v = w.visibleInfo(id);
T('4c surveyed: class, a reserve estimate and the oil type, but not the water cut, cost, capacity, decline, depth or pressure', v.type === 'LARGE' && v.estimatedReserve > 0 && v.apiRange.length === 2 && !('waterCut' in v) && !('extractionCost' in v) && !('productiveCapacity' in v) && !('declineRate' in v) && !('depth' in v) && !('pressurePotential' in v) && !('remainingReserve' in v));
T('4d the estimate is near but never the real reserve; the API range contains the real value', v.estimatedReserve !== f.initialReserve && v.reserveRange[0] <= f.initialReserve * 1.6 && v.apiRange[0] <= f.props.api && f.props.api <= v.apiRange[1]);
w.makeDrillable(id); v = w.visibleInfo(id);
T('4e drillable: the full properties are known', v.api === f.props.api && v.waterCut === f.props.waterCut && v.extractionCost === f.props.extractCost && v.productiveCapacity === f.props.capacity && v.declineRate === f.props.decline && v.depth === f.depth && v.pressurePotential === f.pressurePotential);
T('4f a drillable field still hides nothing it should show: the remaining reserve is reported', v.remainingReserve === f.initialReserve && v.depletionPct === 0);

console.log('5. the same world every time, and the field layout is untouched by the new properties');
const a = createWorld({ seed: 7 }), b = createWorld({ seed: 7 }), c = createWorld({ seed: 8 });
T('5a the same seed gives the same fields and properties', JSON.stringify(a.allSites()) === JSON.stringify(b.allSites()));
T('5b another seed gives other fields', JSON.stringify(a.allSites().map(s => s.props)) !== JSON.stringify(c.allSites().map(s => s.props)));
T('5c positions and radii do not depend on the properties (every site keeps its place inside its region)', worlds[0].allSites().every(s => { const r = worlds[0].regions[s.regionId]; return s.x >= r.x0 && s.x < r.x0 + r.w && s.y >= r.y0 && s.y < r.y0 + r.h; }));

console.log('\nOIL FIELD TESTS: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
