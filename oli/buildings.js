/* Oli - buildings.js  (Phase 2: building system, pure logic, no DOM, original code)
 *
 *  Building Definitions (one shared object per type)  +  Building Instances (a tiny record per placed building)
 *
 *  def:       id, name, category, footprint [w,h] (tiles, unrotated, x = east, y = south), cost, maintenanceCost (per day), buildTime (s),
 *             connections[], allowedTerrain[], maxSlope, capacity {value,unit}, visual (art id), zone?, requires?, clearance
 *  instance:  { id, d (def id), x, y, r (0..3 = 0/90/180/270 degrees), st (status), c (condition 0..1), t0 (placed at), link? }
 *
 *  Rotation turns the footprint AND the connection points together (one function, tested for all 4 rotations), so a pipe snap never
 *  sees an unrotated port.  Terrain comes through a TerrainSource interface (fromWorld(world) wraps the Phase 1 map), so this file never
 *  touches map generation.  Validation returns ONE verdict (state, kind, reason, cells, cost, per-connection status) used by the
 *  ghost preview, the confirm step and place() itself.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OliBuildings = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];                 // 0 east, 1 west, 2 south, 3 north (same numbering as core.js DIRV)
  const ROT_SIDE = [2, 3, 1, 0];                                    // a quarter turn clockwise (y is down): east->south->west->north->east
  const OPPOSITE = [1, 0, 3, 2];
  const SIDE_NAME = ['E', 'W', 'S', 'N'];
  const STATUS = { UNDER_CONSTRUCTION: 'UNDER_CONSTRUCTION', OPERATIONAL: 'OPERATIONAL', IDLE: 'IDLE', DAMAGED: 'DAMAGED' };
  const ALL_LAND = ['FLAT_DESERT', 'SAND_DUNES', 'ROCKY_GROUND', 'ROCKY_PLATEAU', 'VALLEY'];
  const FLAT = ['FLAT_DESERT'], STABLE = ['FLAT_DESERT', 'ROCKY_GROUND'], SOLID = ['FLAT_DESERT', 'SAND_DUNES', 'ROCKY_GROUND'];

  /* ---------------------------------------------------------------- definitions */
  // connection: { id, kind: 'pipe'|'link'|'power'|'service', role: 'in'|'out'|'both', cell [cx,cy] (inside the footprint), side 0..3 (the edge it leaves through),
  //               required, group (any member of a group satisfies it), reserved (later phases; shown but never required) }
  const pt = (id, kind, role, cell, side, o) => Object.assign({ id, kind, role, cell, side, required: true }, o || {});
  const DEFS = {};
  function define(d) {
    if (!d.id || !Array.isArray(d.footprint)) throw new Error('definition needs id + footprint');
    const f = Object.freeze({
      id: d.id, name: d.name, category: d.category, footprint: Object.freeze(d.footprint.slice()), cost: d.cost, maintenanceCost: d.maintenanceCost, buildTime: d.buildTime,
      connections: Object.freeze((d.connections || []).map(c => Object.freeze(Object.assign({ kind: 'pipe', required: true }, c)))),
      allowedTerrain: Object.freeze(d.allowedTerrain.slice()), maxSlope: d.maxSlope, capacity: Object.freeze(d.capacity), visual: d.visual,
      zone: d.zone || null, reserveOnly: !!d.reserveOnly, noUpgrade: !!d.noUpgrade, requires: Object.freeze(d.requires || {}), clearance: d.clearance || 0, rotatable: d.rotatable !== false, status: d.status || STATUS.UNDER_CONSTRUCTION,
      section: d.section || d.category, family: d.family || null, type: d.type || null, size: d.size || null, product: d.product || null, params: d.params || null, operatingCost: d.operatingCost || 0, baseCost: d.baseCost || null, costPerBarrel: d.costPerBarrel || null, costRange: d.costRange || null,
      safetyZone: d.clearance || 0, level: Object.freeze({ level: 1, capacityMultiplier: 1, efficiencyMultiplier: 1, pressureMultiplier: 1, maintenanceMultiplier: 1 })
    });
    for (const c of f.connections) {                                  // a definition error must never reach a player: every port sits on a real edge cell
      const [cx, cy] = c.cell, [w, h] = f.footprint, onEdge = (c.side === 0 && cx === w - 1) || (c.side === 1 && cx === 0) || (c.side === 2 && cy === h - 1) || (c.side === 3 && cy === 0);
      if (!onEdge || cx < 0 || cy < 0 || cx >= w || cy >= h) throw new Error('connection ' + c.id + ' of ' + f.id + ' is not on an edge cell');
    }
    DEFS[f.id] = f; return f;
  }
  const anySide = (kind, role, group, w, h) => { const o = []; for (let s = 0; s < 4; s++) o.push(pt(group + '_' + SIDE_NAME[s], kind, role, [s === 0 ? w - 1 : 0, s === 2 ? h - 1 : 0], s, { group, required: true })); return o; };

  /* The 13 Phase 2 buildings (25 definitions with size variants). Every number comes from OliBuildingConfig (building-config.js); nothing is typed into UI code.
   * product on a port: a ProductType, or '*' = takes whatever the line carries (pumps, valves, junctions are product-transparent: one pipe network = one product). */
  const CFG = (typeof OliBuildingConfig !== 'undefined') ? OliBuildingConfig : require('./building-config.js');
  const P = CFG.PRODUCTS, mid = n => (n - 1) >> 1;
  // oil well: reserve / pressure / production are a deterministic profile of the well's position (see industry.js wellProfile); price follows it.
  define({ id: 'oil_well', name: 'Oil Well', category: 'EXTRACTION', section: 'EXTRACTION', family: 'WELL', type: 'well', footprint: [1, 1], cost: CFG.WELL.cost[0], costRange: CFG.WELL.cost, maintenanceCost: CFG.WELL.maint, operatingCost: CFG.WELL.op, buildTime: 20, visual: 'oil_well',
    allowedTerrain: SOLID.concat(['VALLEY']), maxSlope: 8, capacity: { value: CFG.WELL.production[1], unit: 'bbl/day' }, requires: { oilField: true }, rotatable: false,
    connections: anySide('pipe', 'out', 'OIL_OUT', 1, 1).map(c => Object.assign(c, { product: P.CRUDE })) });
  for (const k of ['S', 'L', 'C']) {
    const c = CFG.PUMP[k]; define({ id: c.id, name: c.name, category: 'EXTRACTION', section: 'EXTRACTION', family: 'PUMP', type: 'pump', size: k, footprint: [c.w, c.h], cost: c.cost, maintenanceCost: c.maint, operatingCost: c.op, buildTime: k === 'S' ? 30 : 60, visual: 'pump_station',
      allowedTerrain: SOLID, maxSlope: 5, capacity: { value: c.maxFlow, unit: 'bbl/day' }, params: c,
      connections: c.inputs ? [].concat(Array.from({ length: c.inputs }, (_, i) => pt('INPUT_' + (i + 1), 'pipe', 'in', [0, i], 1, { group: 'INPUT', product: '*', excl: [P.WATER] })), Array.from({ length: c.outputs }, (_, i) => pt('OUTPUT_' + (i + 1), 'pipe', 'out', [c.w - 1, i], 0, { group: 'OUTPUT', required: false, product: '*', excl: [P.WATER] }))) : [pt('INPUT', 'pipe', 'in', [0, 0], 1, { product: '*', excl: [P.WATER] }), pt('OUTPUT', 'pipe', 'out', [c.w - 1, 0], 0, { product: '*', excl: [P.WATER] })] });
  }
  for (const k of ['S', 'L']) {                                       // water pumps: one in, one out, WATER only (product-specific ports keep water and oil networks apart)
    const c = CFG.WATER_PUMP[k]; define({ id: c.id, name: c.name, category: 'WATER', section: 'WATER', family: 'WATER_PUMP', type: 'pump', size: k, footprint: [c.w, c.h], cost: c.cost, maintenanceCost: c.maint, operatingCost: c.op, buildTime: k === 'S' ? 25 : 50, visual: 'water_pump', product: P.WATER,
      allowedTerrain: SOLID, maxSlope: 5, capacity: { value: c.maxFlow, unit: 'bbl/day' }, params: c, connections: [pt('INPUT', 'pipe', 'in', [0, 0], 1, { product: P.WATER }), pt('OUTPUT', 'pipe', 'out', [c.w - 1, 0], 0, { required: false, product: P.WATER })] }); }
  define({ id: 'valve', name: 'Valve', category: 'PIPELINE', section: 'PIPELINE', family: 'VALVE', type: 'valve', footprint: [1, 1], cost: CFG.VALVE.cost, maintenanceCost: CFG.VALVE.maint, operatingCost: CFG.VALVE.op, buildTime: 10, visual: 'valve_station',
    allowedTerrain: SOLID.concat(['VALLEY']), maxSlope: 6, capacity: { value: CFG.VALVE.maxFlow, unit: 'bbl/day' }, params: CFG.VALVE,
    connections: [pt('IN', 'pipe', 'in', [0, 0], 1, { product: '*' }), pt('OUT', 'pipe', 'out', [0, 0], 0, { product: '*' })] });
  define({ id: 'junction', name: 'Junction', category: 'PIPELINE', section: 'PIPELINE', family: 'JUNCTION', type: 'junction', footprint: [1, 1], cost: CFG.JUNCTION.cost, maintenanceCost: CFG.JUNCTION.maint, operatingCost: CFG.JUNCTION.op, buildTime: 8, visual: 'junction',
    allowedTerrain: SOLID.concat(['VALLEY']), maxSlope: 8, capacity: { value: CFG.JUNCTION.maxTotalFlow, unit: 'bbl/day' }, rotatable: false, params: CFG.JUNCTION,
    connections: [0, 1, 2, 3].map(s => pt('PORT_' + SIDE_NAME[s], 'pipe', 'both', [0, 0], s, { group: 'JUNCTION', required: false, product: '*' })) });
  { const M = CFG.MANIFOLD, rows = [1, 4, 7]; define({ id: M.id, name: M.name, category: 'PIPELINE', section: 'PIPELINE', family: 'MANIFOLD', type: 'junction', footprint: [M.w, M.h], cost: M.cost, maintenanceCost: M.maint, operatingCost: M.op, buildTime: 40, visual: 'main_manifold',
    allowedTerrain: SOLID, maxSlope: 5, capacity: { value: M.maxTotalFlow, unit: 'bbl/day' }, params: M,
    connections: [].concat(Array.from({ length: M.inputs }, (_, i) => pt('INPUT_' + (i + 1), 'pipe', 'in', [0, i], 1, { group: 'INPUT', product: '*' })), Array.from({ length: M.outputs }, (_, i) => pt('OUTPUT_' + (i + 1), 'pipe', 'out', [M.w - 1, rows[i]], 0, { group: 'OUTPUT', required: false, product: '*' }))) }); }   // Stage 5: nine inputs on the west side, three independent outputs on the east side; the junction simulation (capacity-aware split) is reused
  // tanks (crude + three products + gas): every side (north, south, east, west) has an INPUT and an OUTPUT.  The four original ports keep their ids and cells
  // (INPUT_W, INPUT_N, OUTPUT_E, OUTPUT_S), so every saved pipeline still ends where it did; the four new ones (INPUT_E, INPUT_S, OUTPUT_W, OUTPUT_N) use the other cell of the same side.
  const other = n => { const m = mid(n); return m > 0 ? m - 1 : Math.min(1, n - 1); };
  const tankPorts = (w, h, prod, gas) => [pt('INPUT_W', 'pipe', 'in', [0, mid(h)], 1, { group: 'INPUT', product: prod }), pt('INPUT_N', 'pipe', 'in', [mid(w), 0], 3, { group: 'INPUT', product: prod }),
    pt('OUTPUT_E', 'pipe', 'out', [w - 1, mid(h)], 0, { group: 'OUTPUT', required: false, product: prod }), pt('OUTPUT_S', 'pipe', 'out', [mid(w), h - 1], 2, { group: 'OUTPUT', required: false, product: prod }),
    pt('INPUT_E', 'pipe', 'in', [w - 1, other(h)], 0, { group: 'INPUT', product: prod }), pt('INPUT_S', 'pipe', 'in', [other(w), h - 1], 2, { group: 'INPUT', product: prod }),
    pt('OUTPUT_W', 'pipe', 'out', [0, other(h)], 1, { group: 'OUTPUT', required: false, product: prod }), pt('OUTPUT_N', 'pipe', 'out', [other(w), 0], 3, { group: 'OUTPUT', required: false, product: prod })];
  /* the GIANT store: 4 ports per side at cells 3, 8, 13, 18 (in, out, in, out) = 8 inputs + 8 outputs; ids INPUT_<side><n> / OUTPUT_<side><n> */
  const giantPorts = (w, h, prod) => { const o = [], at = [3, 8, 13, 18], sd = [['E', 0, i => [w - 1, i]], ['W', 1, i => [0, i]], ['S', 2, i => [i, h - 1]], ['N', 3, i => [i, 0]]];
    for (const [nm, side, cell] of sd) for (let n = 0; n < 4; n++) { const inn = n % 2 === 0, k = (n >> 1) + 1; o.push(pt((inn ? 'INPUT_' : 'OUTPUT_') + nm + k, 'pipe', inn ? 'in' : 'out', cell(at[n]), side, inn ? { group: 'INPUT', product: prod } : { group: 'OUTPUT', required: false, product: prod })); } return o; };
  const VIS = { WATER: 'water_tank', CRUDE: 'crude_tank', GASOLINE: 'gasoline_tank', DIESEL: 'diesel_tank', JET_FUEL: 'jet_tank', GAS: 'gas_sphere' };
  for (const fam of Object.keys(CFG.TANK)) { const F = CFG.TANK[fam];
    for (const k of ['S', 'M', 'L', 'C', 'G']) { const z = F.sizes[k], gas = fam === 'GAS'; if (!z) continue;
      define({ id: F.prefix + '_' + k.toLowerCase(), name: F.name + ' (' + { S: 'small', M: 'medium', L: 'large', C: 'central', G: 'giant' }[k] + ')', category: gas ? 'PRODUCT_STORAGE' : fam === 'CRUDE' ? 'CRUDE_STORAGE' : fam === 'WATER' ? 'WATER' : 'PRODUCT_STORAGE', section: fam === 'CRUDE' ? 'CRUDE STORAGE' : fam === 'WATER' ? 'WATER' : 'PRODUCT STORAGE', family: gas ? 'GAS_STORAGE' : 'TANK', type: gas ? 'gas' : 'tank', product: P[fam], size: k,
        footprint: [z.w, z.h], cost: z.base + z.cap * (z.perBbl == null ? F.perBbl : z.perBbl), baseCost: z.base, costPerBarrel: z.perBbl == null ? F.perBbl : z.perBbl, reserveOnly: !!z.reserveOnly, noUpgrade: !!z.reserveOnly, maintenanceCost: z.maint, operatingCost: z.op, buildTime: 25 + z.w * 8, visual: VIS[fam], clearance: gas || k === 'L' || k === 'C' || k === 'G' ? 1 : 0,
        allowedTerrain: STABLE, maxSlope: gas ? 3 : 4, capacity: { value: z.cap, unit: gas ? 'boe' : 'bbl' }, params: Object.assign({ maxPressure: gas ? F.maxPressure[k] : 0 }, z), connections: (k === 'G' ? giantPorts(z.w, z.h, P[fam]) : tankPorts(z.w, z.h, P[fam])).concat(fam === 'CRUDE' && k !== 'S' ? [pt('WATER_OUT', 'pipe', 'out', [z.w - 1, z.h - 1], 0, { group: 'WATER', required: false, product: P.WATER })] : []) }); } }   // the bottom outlet of an oil tank (M / L / C): only the water that settled at the bottom can leave through it
  define({ id: 'separator', name: 'Separator', category: 'PROCESSING', section: 'PROCESSING', family: 'SEPARATOR', type: 'separator', footprint: [CFG.SEPARATOR.w, CFG.SEPARATOR.h], cost: CFG.SEPARATOR.cost, maintenanceCost: CFG.SEPARATOR.maint, operatingCost: CFG.SEPARATOR.op, buildTime: 60, visual: 'separator',
    allowedTerrain: SOLID, maxSlope: 3, capacity: { value: CFG.SEPARATOR.cap, unit: 'bbl/day' }, params: CFG.SEPARATOR,
    connections: [pt('MIXTURE_IN', 'pipe', 'in', [0, 1], 1, { product: P.CRUDE }), pt('OIL_OUT', 'pipe', 'out', [CFG.SEPARATOR.w - 1, 1], 0, { product: P.CRUDE }), pt('GAS_OUT', 'pipe', 'out', [2, 0], 3, { required: false, product: P.GAS }), pt('WATER_OUT', 'pipe', 'out', [2, CFG.SEPARATOR.h - 1], 2, { required: false, product: P.WATER })] });
  for (const k of ['S', 'M', 'L', 'X']) { const z = CFG.REFINERY.sizes[k];
    define({ id: z.id, name: z.name, category: 'PROCESSING', section: 'PROCESSING', family: 'REFINERY', type: 'refinery', size: k, footprint: [z.w, z.h], cost: z.cost, maintenanceCost: z.maint, operatingCost: z.op, buildTime: 120 + z.w * 20, visual: 'refinery',
      allowedTerrain: FLAT, maxSlope: 2, capacity: { value: z.cap, unit: 'bbl/day' }, zone: 'REFINERY', clearance: 1, params: z,
      connections: [pt('CRUDE_IN', 'pipe', 'in', [0, mid(z.h)], 1, { product: P.CRUDE }), pt('GASOLINE_OUT', 'pipe', 'out', [z.w - 1, 1], 0, { required: false, product: P.GASOLINE }), pt('DIESEL_OUT', 'pipe', 'out', [z.w - 1, 2], 0, { required: false, product: P.DIESEL }),
        pt('JET_OUT', 'pipe', 'out', [z.w - 1, 3], 0, { required: false, product: P.JET_FUEL }), pt('GAS_OUT', 'pipe', 'out', [z.w - 2, 0], 3, { required: false, product: P.GAS })] }); }
  /* Central Hybrid Network station (central.js): one 3x3 node of the grey trunk with TWELVE product-locked ports - TWO for each of the six channels, on different sides (role 'both': a branch carries product into the trunk or out of it).
   * A trunk arm that blocks one access tile never blocks a channel.  Pre-built stations cost nothing; a station the player taps in on the trunk costs one tile of shell = one tile of each 36" channel. */
  { const CN = (typeof OliCentral !== 'undefined') ? OliCentral : require('./central.js');
    const cp = (id, ch, cell, side) => pt(id, 'pipe', 'both', cell, side, { required: false, product: P[ch] });
    const slots = { N0: [[0, 0], 3], N1: [[1, 0], 3], N2: [[2, 0], 3], E0: [[2, 0], 0], E1: [[2, 1], 0], E2: [[2, 2], 0], S0: [[0, 2], 2], S1: [[1, 2], 2], S2: [[2, 2], 2], W0: [[0, 0], 1], W1: [[0, 1], 1], W2: [[0, 2], 1] };
    const asg = { CRUDE: ['N0', 'S2'], WATER: ['N1', 'S1'], GASOLINE: ['N2', 'S0'], DIESEL: ['E0', 'W2'], JET_FUEL: ['E1', 'W0'], GAS: ['E2', 'W1'] };
    define({ id: 'central_station', name: 'Central Network Station', category: 'PIPELINE', section: 'PIPELINE', family: 'CENTRAL', type: 'central', footprint: [3, 3], cost: CN.TILE_COST, maintenanceCost: 0, operatingCost: 0, buildTime: CFG.JUNCTION.buildTime || 8, visual: 'junction',
      allowedTerrain: ALL_LAND, maxSlope: 12, capacity: { value: CFG.PIPES[36].capacity, unit: 'bbl/day' }, rotatable: true, params: { channels: CN.CHANNELS },
      connections: [].concat(...CN.CHANNELS.map(ch => CN.PORTS[ch].map((id, k) => cp(id, ch, slots[asg[ch][k]][0], slots[asg[ch][k]][1])))) }); }
  const ORDER = Object.keys(DEFS);

  /* ---------------------------------------------------------------- rotation (footprint + connections together) */
  const dimsOf = (def, r) => (r & 1) ? [def.footprint[1], def.footprint[0]] : def.footprint;
  function rotCell(cx, cy, w, h, r) {                                // rotate a cell of a w x h footprint r quarter turns clockwise, returns [x, y, w', h']
    for (let i = 0; i < (r & 3); i++) { const nx = h - 1 - cy, ny = cx; cx = nx; cy = ny; const t = w; w = h; h = t; }
    return [cx, cy, w, h];
  }
  // the rotated connection list: cell/side already turned, plus dx,dy of the free access tile (just outside the footprint)
  const rotCache = new Map();
  function connectionsOf(def, r) {
    r &= 3; const key = def.id + ':' + r; let v = rotCache.get(key); if (v) return v;
    v = def.connections.map(c => {
      const [cx, cy] = rotCell(c.cell[0], c.cell[1], def.footprint[0], def.footprint[1], r); let s = c.side; for (let i = 0; i < r; i++) s = ROT_SIDE[s];
      return Object.assign({}, c, { cell: [cx, cy], side: s, ax: cx + SIDES[s][0], ay: cy + SIDES[s][1] });
    });
    rotCache.set(key, v); return v;
  }
  function cellsOf(def, x, y, r) { const [w, h] = dimsOf(def, r), o = []; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) o.push([x + i, y + j]); return o; }
  // world coordinates of the connection points of an instance (the point = the footprint cell + side; access = the tile outside)
  function worldPoints(b) {
    const def = DEFS[b.d]; return connectionsOf(def, b.r).map(c => ({ buildingId: b.id, def: b.d, id: c.id, kind: c.kind, role: c.role, side: c.side, group: c.group || null, required: c.required, reserved: !!c.reserved, product: c.product || null, excl: c.excl || null,
      x: b.x + c.cell[0], y: b.y + c.cell[1], ax: b.x + c.ax, ay: b.y + c.ay }));
  }
  const productOk = (a, b) => !a || !b || a === '*' || b === '*' || a === b;
  const refuses = (x, y) => !!(x.excl && y.product && x.excl.indexOf(y.product) >= 0);        // a port can refuse a product outright (oil pumps refuse WATER: water never enters an oil pump)
  const compatible = (a, b) => a.kind === b.kind && (a.role === 'both' || b.role === 'both' || a.role !== b.role) && productOk(a.product, b.product) && !refuses(a, b) && !refuses(b, a);

  /* ---------------------------------------------------------------- SECTOR RULES: what may be built where (the 17 functional sectors of the world). ONE table, checked by validate() like terrain and zones.
   * Every building id is allowed in some sector kinds only; the pipe / valve / junction family is shared. A refusal names the sector and where the building belongs. mult = a build-cost advantage of the sector (NOT enabled: every table is empty until the owner approves any figure). */
  const IDS = Object.keys(DEFS), pick = re => IDS.filter(k => re.test(k)), SHARED = ['valve', 'junction', 'central_station'];
  const OFFSHORE_FAMILY = ['offshore_platform', 'offshore_support', 'subsea_pipe', 'coastal_link'];   // reserved ids for the future sea buildings
  const SECTOR_RULES = {
    A: { allow: SHARED.concat(['oil_well', 'pump_station_s', 'pump_station_l', 'pump_station_c', 'water_pump_s', 'water_pump_l', 'main_manifold', 'separator', 'crude_tank_s', 'crude_tank_m']), mult: {},
      perks: ['حقول نفط كثيفة داخل القطاع فقط', 'مساحة للتوسع في الحفر ومحطات التجميع', 'احتياطي وعمق وضغط وجودة تختلف من قطاع لآخر'], needs: ['البئر داخل حقل نفط مكتشف وقابل للحفر', 'خزانات التجميع الصغيرة والمتوسطة فقط (الكبيرة في B)'] },
    B: { allow: SHARED.concat(pick(/^crude_tank_/), pick(/^(gasoline|diesel|jet)_tank_/), pick(/^gas_sphere_/), pick(/^pump_station_/), ['main_manifold']), mult: {},
      perks: ['مزارع خزانات بكل أنواعها ومحطات ضخ وتوزيع', 'استقبال النفط الخام والمنتجات', 'مساحة مناسبة للتوسع'], needs: ['لا آبار ولا مصافٍ في هذا القطاع'] },
    C: { allow: SHARED.concat(pick(/^pump_station_/), pick(/^crude_tank_/), pick(/^(gasoline|diesel|jet)_tank_/), pick(/^gas_sphere_/)), mult: {},
      perks: ['خزانات استراتيجية مستقلة عن التخزين التجاري', 'لا بيع تلقائي: السحب والإيداع بقرارك', 'مخزونه منفصل محاسبياً'], needs: ['الخزانات داخل منطقة الاحتياطي المفتوحة فقط'] },
    D: { allow: SHARED.concat(pick(/^refinery_/), ['separator', 'main_manifold'], pick(/^pump_station_/), pick(/^water_pump_/), pick(/^(gasoline|diesel|jet)_tank_[sm]$/), pick(/^gas_sphere_[sm]$/)), mult: {},
      perks: ['مصافٍ ووحدات فصل ومعالجة', 'مساحة مسوّاة للمرافق الصناعية', 'موقع مخصص للصناعة والتكرير'], needs: ['المصفاة داخل منطقة المصافي المسوّاة (المستطيل البنفسجي)', 'تحتاج نفطاً خاماً وماءً ومواد تشغيل لتعمل', 'خزانات المنتجات الصغيرة والمتوسطة بجوار المصفاة (الكبيرة في B)'] },
    E: { allow: SHARED.concat(pick(/^water_pump_/), pick(/^water_tank_/), pick(/^pump_station_/), ['separator']), mult: {},
      perks: ['محطات سحب وضخ وتخزين ومعالجة المياه', 'تزويد القطاعات المحتاجة للمياه', 'معالجة المياه المصاحبة وإعادة تدوير مياه الصناعة'], needs: ['مضخات الماء على مياه أو أرض مناسبة'] },
    /* F1 is prepared, not filled: the OFFSHORE family below is reserved for the sea buildings of a later phase (none exists yet, so nothing can be built here today). A def with domain:'sea' is built on sea tiles ONLY and the sector F alone lists it; land buildings are refused here. No extraction or sea economy is implemented. */
    F: { allow: OFFSHORE_FAMILY, mult: {}, perks: ['منصات استخراج بحرية', 'منشآت مساندة بحرية', 'أنابيب بحرية ومحطات ربط ساحلية', 'قواعد بناء بحرية منفصلة عن اليابسة'], needs: ['للمنشآت البحرية فقط (على الماء)', 'المباني البرية غير مسموحة هنا', 'تصميم المنشآت البحرية في مرحلة لاحقة'] }
  };
  const SECTOR_HOME = k => { const o = []; for (const q in SECTOR_RULES) if (SECTOR_RULES[q].allow.indexOf(k) >= 0 && SHARED.indexOf(k) < 0) o.push(q); return o; };
  const sectorsOfFootprint = (world, x, y, w, h) => { const set = new Set(); for (const [i, j] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1], [(w - 1) >> 1, (h - 1) >> 1]]) set.add(world.sectorAt(x + i, y + j)); return [...set]; };

  /* ---------------------------------------------------------------- terrain source (the interface to Phase 1) */
  // TerrainSource = { W, H, tile(x,y) -> {terrain, slope} | null (not loaded), terrain: { NAME: { buildable, buildCost, maxSlope } }, slopeK,
  //                   oilFieldAt(x,y) -> site | null, stateOf(siteId), zoneAt(kind,x,y,w,h) -> zone | null }
  function fromWorld(world, CFG) {
    CFG = CFG || (typeof OliWorld !== 'undefined' ? OliWorld.CONFIG : require('./worldmap.js').CONFIG);
    return { W: world.W, H: world.H, tile: (x, y) => { const t = world.tile(x, y); if (!t || t.terrain === 'WATER_WADI' || t.terrain === 'ROCKY_PLATEAU' || !world.reserveZoneOfWorld) return t; const z = world.reserveZoneOfWorld();
        return z && x >= z.x && y >= z.y && x < z.x + z.w && y < z.y + z.h && (t.slope > 0 || t.terrain === 'VALLEY' || t.terrain === 'SAND_DUNES') ? Object.assign({}, t, { terrain: 'FLAT_DESERT', slope: 0 }) : t; },   // the reserve land is graded level: slopes, valley floor and dunes inside it count as flat desert for building
      terrain: CFG.TERRAIN, slopeK: CFG.SLOPE_K, oilFieldAt: (x, y) => world.oilFieldAt(x, y), stateOf: id => world.stateOf(id),
      /* the Strategic Reserve zone: a storage-only place. Tanks fully inside the AREA OPEN SO FAR become reserve tanks (b.rs = 1); other plant is refused inside it; ground outside it is untouched */
      reserve: () => (world.reserveZoneOfWorld ? world.reserveZoneOfWorld() : null), reserveLevel: () => 0, region: () => (world.reserveRegionOfWorld ? world.reserveRegionOfWorld() : null),
      /* the reserve LAND is the whole reserve region when the world has one (C3), else the fixed zone. Inside it only reserve tanks (in the OPEN area of the zone), pumps, valves and junctions may be built; wells, refineries and every commercial building are refused. Checked at placement only: what is already built stays. */
      reserveRule: function (def, x, y, w, h) { const z = this.reserve(), R = this.region && this.region(), land = R || z; if (!land || !(x < land.x + land.w && x + w > land.x && y < land.y + land.h && y + h > land.y)) return null;
        if (def.product === P.WATER && def.type === 'tank') return { ok: false, reason: 'reserveOnly' };       // water tanks are commercial: outside the reserve land (water PUMPS may stand inside to draw the settled water of reserve tanks)
        if (def.type === 'tank' || def.type === 'gas') { if (!z) return { ok: false, reason: 'reserveBounds' }; const L = z.levels[Math.max(0, Math.min(z.levels.length - 1, this.reserveLevel() | 0))]; return x >= L.x && y >= L.y && x + w <= L.x + L.w && y + h <= L.y + L.h ? { ok: true } : { ok: false, reason: 'reserveBounds' }; }
        return def.type === 'pump' || def.type === 'valve' || def.type === 'junction' || def.type === 'central' ? { ok: true, infra: true } : { ok: false, reason: 'reserveOnly' }; },
      sectorInfo: (x, y) => { const c = world.sectorAt ? world.sectorAt(x, y) : null, z = c && world.sector(c); return z ? { code: c, kind: z.kind, name: z.name, desc: z.desc, perks: SECTOR_RULES[z.kind].perks, needs: SECTOR_RULES[z.kind].needs } : null; },
      /* the sector rule: every sector the footprint touches must allow the building (the pipe / valve / junction family is shared). Inside the reserve region the reserve rule has the last word. */
      sectorRule: world.sectors && world.sectors.length ? function (def, defId, x, y, w, h) {
        const codes = sectorsOfFootprint(world, x, y, w, h), z0 = world.sector(codes[0]); if (!z0) return null; const info = this.sectorInfo(x, y);
        for (const c of codes) { const z = world.sector(c); if (!z) return null; const rule = SECTOR_RULES[z.kind];
          if (rule.allow.indexOf(defId) < 0) { const R = this.region && this.region(); if (z.kind === 'C' && R && x >= R.x && y >= R.y && x + w <= R.x + R.w && y + h <= R.y + R.h) continue; return { ok: false, reason: 'sectorForbidden', sector: Object.assign({}, info, { code: c, kind: z.kind, name: z.name }), allowedIn: SECTOR_HOME(defId) }; }
          if (z.kind === 'C' && (def.type === 'tank' || def.type === 'gas')) { const R = this.region && this.region(); if (!(R && x >= R.x && y >= R.y && x + w <= R.x + R.w && y + h <= R.y + R.h)) return { ok: false, reason: 'sectorReserveOnly', sector: Object.assign({}, info, { code: c, kind: z.kind, name: z.name }), allowedIn: ['C'] }; } }
        if (codes.length > 1 && new Set(codes.map(c => world.sector(c).kind)).size > 1 && SHARED.indexOf(defId) < 0) return { ok: false, reason: 'sectorStraddle', sector: info, allowedIn: SECTOR_HOME(defId) };
        const m = SECTOR_RULES[z0.kind].mult[defId]; return { ok: true, sector: info, mult: m || 1 }; } : undefined,
      zoneAt: (kind, x, y, w, h) => { if (kind !== 'REFINERY') return null; for (const z of world.refineryZones(world.regionIdAt(x, y))) if (x >= z.x && y >= z.y && x + w <= z.x + z.w && y + h <= z.y + z.h) return z; return null; }, site: id => world.siteById(id), take: (id, bbl) => world.take(id, bbl), fieldState: id => world.stateOf(id), liftFactor: id => world.liftFactor(id), injectionCostDay: () => world.injectorsTotal() * CFG.PRODUCTION.INJ_OP_DAY };
  }

  /* ---------------------------------------------------------------- the store (instances + occupancy) */
  const key = (W, x, y) => y * W + x;
  class BuildingStore {
    constructor(ts, opts) {
      this.ts = ts; this.W = ts.W; this.H = ts.H; this.items = new Map(); this.occ = new Map(); this.bucket = new Map(); this.nextId = 1; this.time = 0; this.cash = (opts && opts.cash != null) ? opts.cash : Infinity;
      this.B = 16;                                                  // spatial bucket size (tiles) for viewport queries on the big world
    }
    get(id) { return this.items.get(id) || null; }
    /* the building list is shared by every reader of a tick: it is rebuilt only when the set of buildings changes (not on a state change) */
    list() { const c = this._lc; if (c && c.map === this.items && c.rev === this.rev && c.n === this.items.size) return c.arr; const arr = [...this.items.values()]; this._lc = { map: this.items, rev: this.rev, n: this.items.size, arr }; return arr; }
    at(x, y) { const id = this.occ.get(key(this.W, x, y)); return id ? this.items.get(id) : null; }
    inb(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H; }
    query(x0, y0, x1, y1) {                                        // buildings whose footprint touches the rectangle
      const B = this.B, out = new Set();
      for (let by = Math.floor(y0 / B); by <= Math.floor(y1 / B); by++) for (let bx = Math.floor(x0 / B); bx <= Math.floor(x1 / B); bx++) { const l = this.bucket.get(by * 4096 + bx); if (l) for (const id of l) out.add(id); }
      return [...out].map(id => this.items.get(id)).filter(b => { const [w, h] = dimsOf(DEFS[b.d], b.r); return b.x <= x1 && b.y <= y1 && b.x + w > x0 && b.y + h > y0; });
    }
    _index(b, add) {
      this.rev = (this.rev | 0) + 1; const def = DEFS[b.d], B = this.B;
      for (const [cx, cy] of cellsOf(def, b.x, b.y, b.r)) { const k = key(this.W, cx, cy); if (add) this.occ.set(k, b.id); else this.occ.delete(k); }
      const [w, h] = dimsOf(def, b.r);
      for (let by = Math.floor(b.y / B); by <= Math.floor((b.y + h - 1) / B); by++) for (let bx = Math.floor(b.x / B); bx <= Math.floor((b.x + w - 1) / B); bx++) {
        const k = by * 4096 + bx; let l = this.bucket.get(k); if (add) { if (!l) this.bucket.set(k, l = new Set()); l.add(b.id); } else if (l) { l.delete(b.id); if (!l.size) this.bucket.delete(k); }
      }
    }

    /* ONE verdict. state VALID | INVALID | UNAFFORDABLE | LOADING. kind groups the reason for the ghost colours and messages. */
    validate(defId, x, y, r, opts) {
      const def = DEFS[defId]; opts = opts || {}; r = def && def.rotatable ? (r | 0) & 3 : 0;
      if (!def) return { ok: false, state: 'INVALID', kind: 'RULE', reason: 'unknownBuilding', cells: [], cost: 0, connections: [] };
      const ts = this.ts, [w, h] = dimsOf(def, r), cells = cellsOf(def, x, y, r), conns = connectionsOf(def, r), res = { ok: false, state: 'INVALID', kind: null, reason: null, cells, cost: 0, w, h, r, def: defId, connections: [], termMult: 1 };
      const fail = (kind, reason, extra) => Object.assign(res, { kind, reason }, extra || {});
      for (const [cx, cy] of cells) if (!this.inb(cx, cy)) return fail('OUT_OF_BOUNDS', 'outside');
      if (ts.sectorRule) { const sr = ts.sectorRule(def, defId, x, y, w, h); if (sr) { if (!sr.ok) return fail('SECTOR', sr.reason, { sector: sr.sector, allowedIn: sr.allowedIn }); res.sector = sr.sector; if (sr.mult && sr.mult !== 1) res.sectorMult = sr.mult; } }
      let mult = 0, worst = 0;
      for (const [cx, cy] of cells) {                                                // terrain, slope
        const t = ts.tile(cx, cy); if (!t) { res.state = 'LOADING'; return fail('LOADING', 'notLoaded'); }
        const td = ts.terrain[t.terrain], sea = def.domain === 'sea'; if (sea ? td.buildable : !td.buildable) return fail('TERRAIN', sea ? 'landForSea' : 'water', { at: [cx, cy] });      // a sea building stands on water only (the sea is the WATER_WADI terrain of this world), every land building on land only
        if (!sea && !def.allowedTerrain.includes(t.terrain)) return fail('TERRAIN', 'terrain', { at: [cx, cy], terrain: t.terrain });
        if (!sea && t.slope > Math.min(def.maxSlope, td.maxSlope) * ts.slopeK) return fail('TERRAIN', 'slope', { at: [cx, cy] });
        mult += td.buildCost; worst = Math.max(worst, t.slope);
      }
      res.termMult = mult / cells.length;
      for (const [cx, cy] of cells) { const o = this.occ.get(key(this.W, cx, cy)); if (o && o !== opts.ignoreId) return fail('OVERLAP', 'overlap', { at: [cx, cy], with: o }); if (this.cenAt && !opts.ignoreCentral && this.cenAt(cx, cy)) return fail('OVERLAP', 'centralPipe', { at: [cx, cy] }); }
      if (def.clearance) {                                                           // breathing room around big / dangerous plant: no other FOOTPRINT within `clearance` tiles
        const c = def.clearance; for (let j = -c; j < h + c; j++) for (let i = -c; i < w + c; i++) { if (i >= 0 && j >= 0 && i < w && j < h) continue; const o = this.occ.get(key(this.W, x + i, y + j)); if (o && o !== opts.ignoreId) return fail('CLEARANCE', 'tooClose', { at: [x + i, y + j], with: o }); }
      }
      for (const o of this.query(x - 4, y - 4, x + w + 3, y + h + 3)) {            // the other way round: an existing plant needs room too (spatial query, not a scan of every building)
        if (o.id === opts.ignoreId) continue; const od = DEFS[o.d]; if (!od.clearance) continue; const [ow, oh] = dimsOf(od, o.r), c = od.clearance;
        if (x < o.x + ow + c && x + w > o.x - c && y < o.y + oh + c && y + h > o.y - c) return fail('CLEARANCE', 'tooClose', { with: o.id });
      }
      if (ts.reserveRule) { const rr = ts.reserveRule(def, x, y, w, h); if (rr) { if (!rr.ok) return fail('ZONE', rr.reason, { zone: 'RESERVE' }); if (!rr.infra) res.reserve = true; } }
      if (def.reserveOnly && !res.reserve) return fail('ZONE', 'giantReserveOnly', { zone: 'RESERVE' });      // the giant store exists in the Strategic Reserve only (inside the open area), never as commercial storage
      if (def.zone) { const z = ts.zoneAt(def.zone, x, y, w, h); if (!z) return fail('ZONE', 'needsZone', { zone: def.zone }); res.zoneId = z.id || null; }
      if (def.requires.oilField) {
        const s = ts.oilFieldAt(x, y); if (!s || s.kind !== 'FIELD') return fail('OIL', 'noOilField');
        const st = ts.stateOf(s.id); if (st !== 'DRILLABLE' && st !== 'PRODUCING') return fail('OIL', st === 'DEPLETED' ? 'depleted' : 'notDrillable', { field: s.id, fieldState: st });
        res.field = s.id; res.fieldState = st;
      }
      if (def.requires.unique) for (const o of this.items.values()) if (o.d === defId && o.id !== opts.ignoreId) return fail('RULE', 'alreadyBuilt', { with: o.id });
      if (def.requires.adjacentTo) {                                                 // pump jack: its LINK port must face the footprint of a free oil well
        const L = conns.find(c => c.kind === 'link'); const wb = L && this.at(x + L.ax, y + L.ay);
        if (!wb || wb.d !== def.requires.adjacentTo) return fail('RULE', 'needsWell');
        for (const o of this.items.values()) if (o.d === defId && o.link === wb.id && o.id !== opts.ignoreId) return fail('RULE', 'wellHasJack', { with: o.id });
        res.linkTo = wb.id;
      }
      // connection clearance: the free tile outside each required port must be usable (in bounds, buildable, free or a docking partner)
      const groups = new Map(); let allOk = true;
      for (const c of conns) {
        const ax = x + c.ax, ay = y + c.ay, st = { id: c.id, kind: c.kind, role: c.role, side: c.side, x: x + c.cell[0], y: y + c.cell[1], ax, ay, ok: true, reason: null, required: c.required && !c.reserved, group: c.group || null, reserved: !!c.reserved };
        if (c.kind === 'link') { st.ok = !!res.linkTo; } else if (!this.inb(ax, ay)) { st.ok = false; st.reason = 'outside'; }
        else { const t = ts.tile(ax, ay); if (!t) { st.ok = true; st.reason = 'notLoaded'; } else if (def.domain === 'sea' ? ts.terrain[t.terrain].buildable : !ts.terrain[t.terrain].buildable) { st.ok = false; st.reason = def.domain === 'sea' ? 'landForSea' : 'water'; }
          else { const o = this.at(ax, ay);
            if (o && o.id !== opts.ignoreId) { const facing = worldPoints(o).filter(p => p.x === ax && p.y === ay && p.side === OPPOSITE[c.side]); const ok2 = facing.some(p => compatible({ kind: c.kind, role: c.role, product: c.product }, p)); st.ok = ok2; st.reason = ok2 ? 'docked' : 'blocked';
              if (!ok2 && !c.reserved && facing.some(p => compatible({ kind: c.kind, role: c.role }, p))) { st.reason = 'product'; res.badProduct = { port: c.id, wants: c.product, has: facing[0].product }; } }
            else if (this.pipeAt && !c.reserved && c.kind === 'pipe') { const pp = this.pipeAt(ax, ay); if (pp === 'CENTRAL') { st.ok = false; st.reason = 'centralPipe'; } else if (pp && !productOk(c.product, pp)) { st.ok = false; st.reason = 'product'; res.badProduct = { port: c.id, wants: c.product, has: pp }; } } } }
        res.connections.push(st);
        if (st.required) { if (c.group) { const g = groups.get(c.group) || { any: false, n: 0 }; g.n++; g.any = g.any || st.ok; groups.set(c.group, g); } else if (!st.ok) allOk = false; }
      }
      for (const [, g] of groups) if (!g.any) allOk = false;
      if (res.badProduct) return fail('PRODUCT', 'invalidProduct');
      if (!allOk) return fail('CONNECTION', 'connectionBlocked');
      res.cost = Math.round((this.priceOf ? this.priceOf(def, x, y) : def.cost) * (res.termMult || 1) * (res.sectorMult || 1)); if (def.zone === null && worst > 0) res.cost = Math.round(res.cost * (1 + worst / 40));
      if (this.cash < res.cost && !opts.ignoreCash) { res.state = 'UNAFFORDABLE'; res.reason = 'cash'; res.ok = false; res.kind = null; return res; }
      res.ok = true; res.state = 'VALID'; return res;
    }

    place(defId, x, y, r, opts) {
      opts = opts || {}; const v = opts.trust && opts.free && DEFS[defId] && DEFS[defId].type === 'central' ? { ok: true, r: DEFS[defId].rotatable ? (r | 0) & 3 : 0, cost: 0 } : this.validate(defId, x, y, r, opts); if (!v.ok) return v;      // trust: only the free, pre-validated start-of-game stations of the central network (their spots were checked offline)
      const def = DEFS[defId], b = { id: this.nextId++, d: defId, x, y, r: v.r, st: STATUS.UNDER_CONSTRUCTION, c: 1, t0: this.time };
      if (v.linkTo) b.link = v.linkTo; if (v.field) b.field = v.field; if (v.reserve) b.rs = 1;
      if (opts.instant) b.st = STATUS.OPERATIONAL;
      this.items.set(b.id, b); this._index(b, true); if (this.cash !== Infinity && !opts.free) this.cash -= v.cost; return { ok: true, building: b, cost: opts.free ? 0 : v.cost, verdict: v };
    }
    tick(dt) {                                                                       // construction finishes by game time; nothing else changes (operation belongs to Phase 3/4)
      this.time += dt; for (const b of this.items.values()) if (b.st === STATUS.UNDER_CONSTRUCTION && this.time - b.t0 >= DEFS[b.d].buildTime) b.st = STATUS.OPERATIONAL;
    }
    move(id, x, y, r) {                                                              // drag an existing building: validated against everything except itself
      const b = this.items.get(id); if (!b) return { ok: false, reason: 'nothing' }; if (DEFS[b.d].family === 'CENTRAL') return { ok: false, reason: 'centralStation' }; const v = this.validate(b.d, x, y, r == null ? b.r : r, { ignoreId: id, ignoreCash: true }); if (!v.ok) return v;
      if (!!v.reserve !== !!b.rs) return { ok: false, state: 'INVALID', kind: 'ZONE', reason: 'reserveMove' };      // a tank never changes system by being dragged: its stock would silently change owner
      this._index(b, false); b.x = x; b.y = y; b.r = v.r; this._index(b, true); return { ok: true, building: b };
    }

    /* ---- demolish: a plan first (what would be touched), then a confirmed removal that never leaves a broken link behind */
    demolishPlan(id, pipes) {
      const b = this.items.get(id); if (!b) return null; if (DEFS[b.d].family === 'CENTRAL') return { id, name: DEFS[b.d].name, locked: true, refund: 0, connectedPipes: [], dependents: [], needsConfirm: true, needsPipeConfirm: false }; const def = DEFS[b.d], pts = worldPoints(b), pipeTiles = [];
      if (pipes) for (const p of pts) if (p.kind === 'pipe' && pipes.has(key(this.W, p.ax, p.ay))) pipeTiles.push([p.ax, p.ay]);
      const jacks = this.list().filter(o => o.link === id).map(o => o.id);
      return { id, name: def.name, refund: Math.floor(def.cost * 0.5), connectedPipes: pipeTiles, dependents: jacks, needsConfirm: true, needsPipeConfirm: pipeTiles.length > 0 };
    }
    demolish(id, confirm) {                                                         // confirm = { building: true, pipes: true } ; a missing flag refuses, nothing changes
      const plan = this.demolishPlan(id, confirm && confirm.pipeSet); if (!plan) return { ok: false, reason: 'nothing' };
      if (plan.locked && !(confirm && confirm.force)) return { ok: false, reason: 'centralStation', plan };      // a station of the Central Network is infrastructure: it is never demolished (the graph would break)
      { const t = this.items.get(id); if (t && t.rs && t.s && t.s.vol > 1) return { ok: false, reason: 'reserveNotEmpty', plan }; }      // a reserve tank holding oil is never demolished (its stock and its book value would vanish)
      if (!confirm || !confirm.building) return { ok: false, reason: 'needsConfirm', plan };
      if (plan.needsPipeConfirm && !confirm.pipes) return { ok: false, reason: 'needsPipeConfirm', plan };
      const b = this.items.get(id); this._index(b, false); this.items.delete(id);
      for (const j of plan.dependents) { const o = this.items.get(j); if (o) delete o.link; }                  // the jack stays, it just loses its well (shown as DAMAGED/IDLE by the host)
      if (this.cash !== Infinity) this.cash += plan.refund; return { ok: true, refund: plan.refund, plan };
    }

    /* ---- information panel data (no management system here, only what the player needs to read) */
    info(id, pipes) {
      const b = this.items.get(id); if (!b) return null; const def = DEFS[b.d], pts = worldPoints(b);
      const ins = pts.filter(p => p.kind === 'pipe' && (p.role === 'in' || p.role === 'both') && !p.reserved).length, outs = pts.filter(p => p.kind === 'pipe' && (p.role === 'out' || p.role === 'both') && !p.reserved).length;
      const linked = pipes ? pts.filter(p => p.kind === 'pipe' && pipes.has(key(this.W, p.ax, p.ay))).length : 0;
      return { id, name: def.name, status: b.st, capacity: def.capacity.value + ' ' + def.capacity.unit, input: ins ? ins + ' pipe inlet' + (ins > 1 ? 's' : '') : (def.category === 'EXTRACTION' ? 'oil field' : '-'), output: outs ? outs + ' pipe outlet' + (outs > 1 ? 's' : '') : '-',
        condition: Math.round(b.c * 100) + ' %', maintenance: def.maintenanceCost + ' / day', connectedPipes: linked, category: def.category, field: b.field || null, link: b.link || null, rotation: b.r * 90 };
    }

    /* ---- smart snap: the nearest VALID position, preferring spots where ports line up with an existing port (one pipe tile between, or docked) */
    snap(defId, x, y, r, opts) {
      opts = opts || {}; const def = DEFS[defId], R = opts.radius == null ? 3 : opts.radius, rots = def.rotatable ? (opts.autoRotate ? [0, 1, 2, 3] : [r & 3]) : [0], cand = [];
      const consider = (cx, cy, rr, bonus) => { if (!this.inb(cx, cy)) return; const raw = Math.hypot(cx - x, cy - y), d = raw - bonus; if (raw <= R + (bonus ? 3 : 0)) cand.push({ x: cx, y: cy, r: rr, d, aligned: bonus > 0 }); };
      for (const rr of rots) {
        for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) consider(x + i, y + j, rr, 0);
        const mine = connectionsOf(def, rr).filter(c => c.kind === 'pipe' && !c.reserved);
        for (const o of this.query(x - R - 10, y - R - 10, x + R + 10, y + R + 10)) for (const p of worldPoints(o)) { if (p.kind !== 'pipe' || p.reserved) continue;
          for (const c of mine) { if (c.side !== OPPOSITE[p.side] || !compatible(c, p)) continue;
            for (const gap of [1, 0]) { const tx = p.x + SIDES[p.side][0] * (1 + gap), ty = p.y + SIDES[p.side][1] * (1 + gap); consider(tx - c.cell[0], ty - c.cell[1], rr, 3.2 - gap * 0.4); } } }
      }
      cand.sort((a, b) => a.d - b.d);
      for (const c of cand) { const v = this.validate(defId, c.x, c.y, c.r, { ignoreCash: true }); if (v.ok || (opts.ignoreCash === false && v.state === 'UNAFFORDABLE')) return { x: c.x, y: c.y, r: c.r, aligned: c.aligned, verdict: v }; }
      return null;
    }

    /* ---- pipes: a host layer owns the pipe tiles (Set of key(W,x,y)); this reads it, it never changes it */
    links(pipes) {
      const W = this.W, pts = []; for (const b of this.items.values()) for (const p of worldPoints(b)) if (p.kind === 'pipe') pts.push(p);
      const seen = new Map(), comps = [];
      for (const p of pts) {                                                                      // each point starts from its access tile; pipe tiles connect 4-ways
        const k = key(W, p.ax, p.ay); if (!pipes.has(k)) continue; let comp = seen.get(k);
        if (comp == null) { comp = comps.length; const q = [k]; seen.set(k, comp); comps.push({ tiles: 0, points: [] });
          while (q.length) { const c = q.pop(); comps[comp].tiles++; const cx = c % W, cy = (c / W) | 0; for (const [dx, dy] of SIDES) { const nx = cx + dx, ny = cy + dy; if (!this.inb(nx, ny)) continue; const nk = key(W, nx, ny); if (pipes.has(nk) && !seen.has(nk)) { seen.set(nk, comp); q.push(nk); } } } }
        comps[comp].points.push(p);
      }
      const out = [];
      for (let ci = 0; ci < comps.length; ci++) { const C = comps[ci]; const src = C.points.filter(p => p.role === 'out' || p.role === 'both'), dst = C.points.filter(p => p.role === 'in' || p.role === 'both');
        for (const a of src) for (const b of dst) if (a.buildingId !== b.buildingId && !(a.role === 'both' && b.role === 'both' && a.buildingId > b.buildingId)) out.push({ from: a.buildingId, fromPort: a.id, to: b.buildingId, toPort: b.id, via: 'pipe', component: ci, tiles: C.tiles }); }
      for (const a of pts) for (const b of pts) if (a.buildingId < b.buildingId && a.ax === b.x && a.ay === b.y && b.ax === a.x && b.ay === a.y && compatible(a, b)) {   // docked face to face, no pipe between
        const [f, t] = a.role === 'in' ? [b, a] : [a, b]; out.push({ from: f.buildingId, fromPort: f.id, to: t.buildingId, toPort: t.id, via: 'direct', component: -1, tiles: 0 }); }
      return out;
    }

    /* ---- save / load: compact, versioned, validated on load (nothing is trusted) */
    toJSON(o) { const live = o && o.live; return { v: 2, next: this.nextId, time: this.time, b: this.list().map(b => [b.id, b.d, b.x, b.y, b.r, b.st, b.c, b.t0, b.link || 0, b.field || 0, b.s ? (live ? b.s : JSON.parse(JSON.stringify(b.s))) : null, b.lv || 1].concat(b.rs ? [1] : [])) }; }   // rows stay 12 long; only a reserve tank carries a 13th field
    /* toJSON({ live: true }): the building states by reference, for a caller that turns it into text at once (the autosave) - the same text, without copying every state twice first */
    static fromJSON(ts, data, opts) {
      const s = new BuildingStore(ts, opts), rep = { loaded: 0, dropped: [] }; if (!data || (data.v !== 1 && data.v !== 2) || !Array.isArray(data.b)) return { store: s, report: { loaded: 0, dropped: ['badFormat'] } };
      s.time = data.time || 0; let maxId = 0;
      for (const a of data.b) { const [id, d, x, y, r, st, c, t0, link, field, dyn, lv, rs] = a; const def = DEFS[d];
        if (!def || !s.inb(x, y) || s.at(x, y)) { rep.dropped.push(id + ':' + (def ? 'overlap' : 'unknownType')); continue; }
        const b = { id, d, x, y, r: def.rotatable ? r & 3 : 0, st: STATUS[st] ? st : STATUS.OPERATIONAL, c: Math.min(1, Math.max(0, c)), t0: t0 || 0 }; if (link) b.link = link; if (field) b.field = field; if (dyn && typeof dyn === 'object') b.s = dyn; b.lv = lv || 1; if (rs) b.rs = 1;
        const cells = cellsOf(def, x, y, b.r); if (cells.some(([cx, cy]) => !s.inb(cx, cy) || s.occ.has(key(s.W, cx, cy)))) { rep.dropped.push(id + ':overlap'); continue; }
        s.items.set(id, b); s._index(b, true); maxId = Math.max(maxId, id); rep.loaded++; }
      s.nextId = Math.max(data.next || 1, maxId + 1); return { store: s, report: rep };
    }
  }

  return { DEFS, ORDER, productOk, CFG, STATUS, SIDES, OPPOSITE, SIDE_NAME, define, dimsOf, rotCell, connectionsOf, cellsOf, worldPoints, compatible, refuses, fromWorld, BuildingStore, key, SECTOR_RULES, SECTOR_HOME };
});
