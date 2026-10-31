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
      zone: d.zone || null, requires: Object.freeze(d.requires || {}), clearance: d.clearance || 0, rotatable: d.rotatable !== false, status: d.status || STATUS.UNDER_CONSTRUCTION,
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
  for (const k of ['S', 'L']) {
    const c = CFG.PUMP[k]; define({ id: c.id, name: c.name, category: 'EXTRACTION', section: 'EXTRACTION', family: 'PUMP', type: 'pump', size: k, footprint: [c.w, c.h], cost: c.cost, maintenanceCost: c.maint, operatingCost: c.op, buildTime: k === 'S' ? 30 : 60, visual: 'pump_station',
      allowedTerrain: SOLID, maxSlope: 5, capacity: { value: c.maxFlow, unit: 'bbl/day' }, params: c,
      connections: [pt('INPUT', 'pipe', 'in', [0, 0], 1, { product: '*' }), pt('OUTPUT', 'pipe', 'out', [c.w - 1, 0], 0, { product: '*' })] });
  }
  define({ id: 'valve', name: 'Valve', category: 'PIPELINE', section: 'PIPELINE', family: 'VALVE', type: 'valve', footprint: [1, 1], cost: CFG.VALVE.cost, maintenanceCost: CFG.VALVE.maint, operatingCost: CFG.VALVE.op, buildTime: 10, visual: 'valve_station',
    allowedTerrain: SOLID.concat(['VALLEY']), maxSlope: 6, capacity: { value: CFG.VALVE.maxFlow, unit: 'bbl/day' }, params: CFG.VALVE,
    connections: [pt('IN', 'pipe', 'in', [0, 0], 1, { product: '*' }), pt('OUT', 'pipe', 'out', [0, 0], 0, { product: '*' })] });
  define({ id: 'junction', name: 'Junction', category: 'PIPELINE', section: 'PIPELINE', family: 'JUNCTION', type: 'junction', footprint: [1, 1], cost: CFG.JUNCTION.cost, maintenanceCost: CFG.JUNCTION.maint, operatingCost: CFG.JUNCTION.op, buildTime: 8, visual: 'junction',
    allowedTerrain: SOLID.concat(['VALLEY']), maxSlope: 8, capacity: { value: CFG.JUNCTION.maxTotalFlow, unit: 'bbl/day' }, rotatable: false, params: CFG.JUNCTION,
    connections: [0, 1, 2, 3].map(s => pt('PORT_' + SIDE_NAME[s], 'pipe', 'both', [0, 0], s, { group: 'JUNCTION', required: false, product: '*' })) });
  // tanks (crude + three products + gas): ports INPUT on west / north, OUTPUT on east / south
  const tankPorts = (w, h, prod, gas) => [pt('INPUT_W', 'pipe', 'in', [0, mid(h)], 1, { group: 'INPUT', product: prod }), pt('INPUT_N', 'pipe', 'in', [mid(w), 0], 3, { group: 'INPUT', product: prod }),
    pt('OUTPUT_E', 'pipe', 'out', [w - 1, mid(h)], 0, { group: 'OUTPUT', required: false, product: prod }), pt('OUTPUT_S', 'pipe', 'out', [mid(w), h - 1], 2, { group: 'OUTPUT', required: false, product: prod })];
  const VIS = { CRUDE: 'crude_tank', GASOLINE: 'gasoline_tank', DIESEL: 'diesel_tank', JET_FUEL: 'jet_tank', GAS: 'gas_sphere' };
  for (const fam of Object.keys(CFG.TANK)) { const F = CFG.TANK[fam];
    for (const k of ['S', 'M', 'L']) { const z = F.sizes[k], gas = fam === 'GAS';
      define({ id: F.prefix + '_' + k.toLowerCase(), name: F.name + ' (' + { S: 'small', M: 'medium', L: 'large' }[k] + ')', category: gas ? 'PRODUCT_STORAGE' : fam === 'CRUDE' ? 'CRUDE_STORAGE' : 'PRODUCT_STORAGE', section: fam === 'CRUDE' ? 'CRUDE STORAGE' : 'PRODUCT STORAGE', family: gas ? 'GAS_STORAGE' : 'TANK', type: gas ? 'gas' : 'tank', product: P[fam], size: k,
        footprint: [z.w, z.h], cost: z.base + z.cap * F.perBbl, baseCost: z.base, costPerBarrel: F.perBbl, maintenanceCost: z.maint, operatingCost: z.op, buildTime: 25 + z.w * 8, visual: VIS[fam], clearance: gas || k === 'L' ? 1 : 0,
        allowedTerrain: STABLE, maxSlope: gas ? 3 : 4, capacity: { value: z.cap, unit: gas ? 'boe' : 'bbl' }, params: Object.assign({ maxPressure: gas ? F.maxPressure[k] : 0 }, z), connections: tankPorts(z.w, z.h, P[fam]) }); } }
  define({ id: 'separator', name: 'Separator', category: 'PROCESSING', section: 'PROCESSING', family: 'SEPARATOR', type: 'separator', footprint: [CFG.SEPARATOR.w, CFG.SEPARATOR.h], cost: CFG.SEPARATOR.cost, maintenanceCost: CFG.SEPARATOR.maint, operatingCost: CFG.SEPARATOR.op, buildTime: 60, visual: 'separator',
    allowedTerrain: SOLID, maxSlope: 3, capacity: { value: CFG.SEPARATOR.cap, unit: 'bbl/day' }, params: CFG.SEPARATOR,
    connections: [pt('MIXTURE_IN', 'pipe', 'in', [0, 1], 1, { product: P.CRUDE }), pt('OIL_OUT', 'pipe', 'out', [CFG.SEPARATOR.w - 1, 1], 0, { product: P.CRUDE }), pt('GAS_OUT', 'pipe', 'out', [2, 0], 3, { required: false, product: P.GAS }), pt('WATER_OUT', 'pipe', 'out', [2, CFG.SEPARATOR.h - 1], 2, { required: false, product: P.WATER })] });
  for (const k of ['S', 'M', 'L', 'X']) { const z = CFG.REFINERY.sizes[k];
    define({ id: z.id, name: z.name, category: 'PROCESSING', section: 'PROCESSING', family: 'REFINERY', type: 'refinery', size: k, footprint: [z.w, z.h], cost: z.cost, maintenanceCost: z.maint, operatingCost: z.op, buildTime: 120 + z.w * 20, visual: 'refinery',
      allowedTerrain: FLAT, maxSlope: 2, capacity: { value: z.cap, unit: 'bbl/day' }, zone: 'REFINERY', clearance: 1, params: z,
      connections: [pt('CRUDE_IN', 'pipe', 'in', [0, mid(z.h)], 1, { product: P.CRUDE }), pt('GASOLINE_OUT', 'pipe', 'out', [z.w - 1, 1], 0, { required: false, product: P.GASOLINE }), pt('DIESEL_OUT', 'pipe', 'out', [z.w - 1, 2], 0, { required: false, product: P.DIESEL }),
        pt('JET_OUT', 'pipe', 'out', [z.w - 1, 3], 0, { required: false, product: P.JET_FUEL }), pt('GAS_OUT', 'pipe', 'out', [z.w - 2, 0], 3, { required: false, product: P.GAS })] }); }
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
    const def = DEFS[b.d]; return connectionsOf(def, b.r).map(c => ({ buildingId: b.id, def: b.d, id: c.id, kind: c.kind, role: c.role, side: c.side, group: c.group || null, required: c.required, reserved: !!c.reserved, product: c.product || null,
      x: b.x + c.cell[0], y: b.y + c.cell[1], ax: b.x + c.ax, ay: b.y + c.ay }));
  }
  const productOk = (a, b) => !a || !b || a === '*' || b === '*' || a === b;
  const compatible = (a, b) => a.kind === b.kind && (a.role === 'both' || b.role === 'both' || a.role !== b.role) && productOk(a.product, b.product);

  /* ---------------------------------------------------------------- terrain source (the interface to Phase 1) */
  // TerrainSource = { W, H, tile(x,y) -> {terrain, slope} | null (not loaded), terrain: { NAME: { buildable, buildCost, maxSlope } }, slopeK,
  //                   oilFieldAt(x,y) -> site | null, stateOf(siteId), zoneAt(kind,x,y,w,h) -> zone | null }
  function fromWorld(world, CFG) {
    CFG = CFG || (typeof OliWorld !== 'undefined' ? OliWorld.CONFIG : require('./worldmap.js').CONFIG);
    return { W: world.W, H: world.H, tile: (x, y) => world.tile(x, y), terrain: CFG.TERRAIN, slopeK: CFG.SLOPE_K, oilFieldAt: (x, y) => world.oilFieldAt(x, y), stateOf: id => world.stateOf(id),
      zoneAt: (kind, x, y, w, h) => { if (kind !== 'REFINERY') return null; for (const z of world.refineryZones(world.regionIdAt(x, y))) if (x >= z.x && y >= z.y && x + w <= z.x + z.w && y + h <= z.y + z.h) return z; return null; }, site: id => world.siteById(id) };
  }

  /* ---------------------------------------------------------------- the store (instances + occupancy) */
  const key = (W, x, y) => y * W + x;
  class BuildingStore {
    constructor(ts, opts) {
      this.ts = ts; this.W = ts.W; this.H = ts.H; this.items = new Map(); this.occ = new Map(); this.bucket = new Map(); this.nextId = 1; this.time = 0; this.cash = (opts && opts.cash != null) ? opts.cash : Infinity;
      this.B = 16;                                                  // spatial bucket size (tiles) for viewport queries on the big world
    }
    get(id) { return this.items.get(id) || null; }
    list() { return [...this.items.values()]; }
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
      let mult = 0, worst = 0;
      for (const [cx, cy] of cells) {                                                // terrain, slope
        const t = ts.tile(cx, cy); if (!t) { res.state = 'LOADING'; return fail('LOADING', 'notLoaded'); }
        const td = ts.terrain[t.terrain]; if (!td.buildable) return fail('TERRAIN', 'water', { at: [cx, cy] });
        if (!def.allowedTerrain.includes(t.terrain)) return fail('TERRAIN', 'terrain', { at: [cx, cy], terrain: t.terrain });
        if (t.slope > Math.min(def.maxSlope, td.maxSlope) * ts.slopeK) return fail('TERRAIN', 'slope', { at: [cx, cy] });
        mult += td.buildCost; worst = Math.max(worst, t.slope);
      }
      res.termMult = mult / cells.length;
      for (const [cx, cy] of cells) { const o = this.occ.get(key(this.W, cx, cy)); if (o && o !== opts.ignoreId) return fail('OVERLAP', 'overlap', { at: [cx, cy], with: o }); }
      if (def.clearance) {                                                           // breathing room around big / dangerous plant: no other FOOTPRINT within `clearance` tiles
        const c = def.clearance; for (let j = -c; j < h + c; j++) for (let i = -c; i < w + c; i++) { if (i >= 0 && j >= 0 && i < w && j < h) continue; const o = this.occ.get(key(this.W, x + i, y + j)); if (o && o !== opts.ignoreId) return fail('CLEARANCE', 'tooClose', { at: [x + i, y + j], with: o }); }
      }
      for (const o of this.query(x - 4, y - 4, x + w + 3, y + h + 3)) {            // the other way round: an existing plant needs room too (spatial query, not a scan of every building)
        if (o.id === opts.ignoreId) continue; const od = DEFS[o.d]; if (!od.clearance) continue; const [ow, oh] = dimsOf(od, o.r), c = od.clearance;
        if (x < o.x + ow + c && x + w > o.x - c && y < o.y + oh + c && y + h > o.y - c) return fail('CLEARANCE', 'tooClose', { with: o.id });
      }
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
        else { const t = ts.tile(ax, ay); if (!t) { st.ok = true; st.reason = 'notLoaded'; } else if (!ts.terrain[t.terrain].buildable) { st.ok = false; st.reason = 'water'; }
          else { const o = this.at(ax, ay);
            if (o && o.id !== opts.ignoreId) { const facing = worldPoints(o).filter(p => p.x === ax && p.y === ay && p.side === OPPOSITE[c.side]); const ok2 = facing.some(p => compatible({ kind: c.kind, role: c.role, product: c.product }, p)); st.ok = ok2; st.reason = ok2 ? 'docked' : 'blocked';
              if (!ok2 && !c.reserved && facing.some(p => compatible({ kind: c.kind, role: c.role }, p))) { st.reason = 'product'; res.badProduct = { port: c.id, wants: c.product, has: facing[0].product }; } }
            else if (this.pipeAt && !c.reserved && c.kind === 'pipe') { const pp = this.pipeAt(ax, ay); if (pp && !productOk(c.product, pp)) { st.ok = false; st.reason = 'product'; res.badProduct = { port: c.id, wants: c.product, has: pp }; } } } }
        res.connections.push(st);
        if (st.required) { if (c.group) { const g = groups.get(c.group) || { any: false, n: 0 }; g.n++; g.any = g.any || st.ok; groups.set(c.group, g); } else if (!st.ok) allOk = false; }
      }
      for (const [, g] of groups) if (!g.any) allOk = false;
      if (res.badProduct) return fail('PRODUCT', 'invalidProduct');
      if (!allOk) return fail('CONNECTION', 'connectionBlocked');
      res.cost = Math.round((this.priceOf ? this.priceOf(def, x, y) : def.cost) * (res.termMult || 1)); if (def.zone === null && worst > 0) res.cost = Math.round(res.cost * (1 + worst / 40));
      if (this.cash < res.cost && !opts.ignoreCash) { res.state = 'UNAFFORDABLE'; res.reason = 'cash'; res.ok = false; res.kind = null; return res; }
      res.ok = true; res.state = 'VALID'; return res;
    }

    place(defId, x, y, r, opts) {
      opts = opts || {}; const v = this.validate(defId, x, y, r, opts); if (!v.ok) return v;
      const def = DEFS[defId], b = { id: this.nextId++, d: defId, x, y, r: v.r, st: STATUS.UNDER_CONSTRUCTION, c: 1, t0: this.time };
      if (v.linkTo) b.link = v.linkTo; if (v.field) b.field = v.field;
      if (opts.instant) b.st = STATUS.OPERATIONAL;
      this.items.set(b.id, b); this._index(b, true); if (this.cash !== Infinity) this.cash -= v.cost; return { ok: true, building: b, cost: v.cost, verdict: v };
    }
    tick(dt) {                                                                       // construction finishes by game time; nothing else changes (operation belongs to Phase 3/4)
      this.time += dt; for (const b of this.items.values()) if (b.st === STATUS.UNDER_CONSTRUCTION && this.time - b.t0 >= DEFS[b.d].buildTime) b.st = STATUS.OPERATIONAL;
    }
    move(id, x, y, r) {                                                              // drag an existing building: validated against everything except itself
      const b = this.items.get(id); if (!b) return { ok: false, reason: 'nothing' }; const v = this.validate(b.d, x, y, r == null ? b.r : r, { ignoreId: id, ignoreCash: true }); if (!v.ok) return v;
      this._index(b, false); b.x = x; b.y = y; b.r = v.r; this._index(b, true); return { ok: true, building: b };
    }

    /* ---- demolish: a plan first (what would be touched), then a confirmed removal that never leaves a broken link behind */
    demolishPlan(id, pipes) {
      const b = this.items.get(id); if (!b) return null; const def = DEFS[b.d], pts = worldPoints(b), pipeTiles = [];
      if (pipes) for (const p of pts) if (p.kind === 'pipe' && pipes.has(key(this.W, p.ax, p.ay))) pipeTiles.push([p.ax, p.ay]);
      const jacks = this.list().filter(o => o.link === id).map(o => o.id);
      return { id, name: def.name, refund: Math.floor(def.cost * 0.5), connectedPipes: pipeTiles, dependents: jacks, needsConfirm: true, needsPipeConfirm: pipeTiles.length > 0 };
    }
    demolish(id, confirm) {                                                         // confirm = { building: true, pipes: true } ; a missing flag refuses, nothing changes
      const plan = this.demolishPlan(id, confirm && confirm.pipeSet); if (!plan) return { ok: false, reason: 'nothing' };
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
    toJSON() { return { v: 2, next: this.nextId, time: this.time, b: this.list().map(b => [b.id, b.d, b.x, b.y, b.r, b.st, +b.c.toFixed(4), b.t0, b.link || 0, b.field || 0, b.s ? JSON.parse(JSON.stringify(b.s)) : null, b.lv || 1]) }; }
    static fromJSON(ts, data, opts) {
      const s = new BuildingStore(ts, opts), rep = { loaded: 0, dropped: [] }; if (!data || (data.v !== 1 && data.v !== 2) || !Array.isArray(data.b)) return { store: s, report: { loaded: 0, dropped: ['badFormat'] } };
      s.time = data.time || 0; let maxId = 0;
      for (const a of data.b) { const [id, d, x, y, r, st, c, t0, link, field, dyn, lv] = a; const def = DEFS[d];
        if (!def || !s.inb(x, y) || s.at(x, y)) { rep.dropped.push(id + ':' + (def ? 'overlap' : 'unknownType')); continue; }
        const b = { id, d, x, y, r: def.rotatable ? r & 3 : 0, st: STATUS[st] ? st : STATUS.OPERATIONAL, c: Math.min(1, Math.max(0, c)), t0: t0 || 0 }; if (link) b.link = link; if (field) b.field = field; if (dyn && typeof dyn === 'object') b.s = dyn; b.lv = lv || 1;
        const cells = cellsOf(def, x, y, b.r); if (cells.some(([cx, cy]) => !s.inb(cx, cy) || s.occ.has(key(s.W, cx, cy)))) { rep.dropped.push(id + ':overlap'); continue; }
        s.items.set(id, b); s._index(b, true); maxId = Math.max(maxId, id); rep.loaded++; }
      s.nextId = Math.max(data.next || 1, maxId + 1); return { store: s, report: rep };
    }
  }

  return { DEFS, ORDER, productOk, CFG, STATUS, SIDES, OPPOSITE, SIDE_NAME, define, dimsOf, rotCell, connectionsOf, cellsOf, worldPoints, compatible, fromWorld, BuildingStore, key };
});
