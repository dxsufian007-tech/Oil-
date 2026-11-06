/* Oli - industry.js  (Phase 2: the oil-industry simulation on top of the Building System; pure logic, no DOM, original code)
 *
 *  PipeNet   explicit pipelines: port -> port, with ProductType, diameter, length, capacity, max pressure, current flow.  No pipe is ever merged with another by touching,
 *            and a crossing never turns into a junction; the Junction building is the only place where lines merge or split.
 *  Sim       the flow solver.  Wells and tanks are SOURCES; pumps, valves, junctions, separators and refineries are pass-through devices; tanks are SINKS.
 *            A source offers a flow {rate, product, composition, pressure} into a port; the pipeline loses pressure by friction and limits the rate to its capacity;
 *            the device on the far side decides how much it accepts (probe first, commit second) so back-pressure travels upstream.
 *  The core.js hydraulics (Phase C) is not touched: this layer works on the registry's instances and a PipeNet (adapter notes in docs/BUILDING_SYSTEM.md).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./buildings.js'), require('./building-config.js'));
  else root.OliIndustry = factory(root.OliBuildings, root.OliBuildingConfig);
})(typeof self !== 'undefined' ? self : this, function (B, CFG) {
  'use strict';
  const { DEFS, key } = B, P = CFG.PRODUCTS, SAFE = CFG.SAFETY, SIM = CFG.SIM, ANY = '*';
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const hash = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + (c || 0) * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const lerp = (a, b, t) => a + (b - a) * t;
  const eco = b => (b.s && b.s.ecoEff != null) ? b.s.ecoEff : 1;       // Phase 3 hook: the economy layer (power, condition, crude quality) writes b.s.ecoEff; 1 = unchanged Phase 2 behaviour

  /* ------------------------------------------------------------ well profile: deterministic from the position, so a saved game and a fresh game agree */
  function wellProfile(x, y) {
    const W = CFG.WELL, u = k => hash(x, y, k), prod = Math.round(lerp(W.production[0], W.production[1], u(1)) / 10) * 10, pres = Math.round(lerp(W.pressure[0], W.pressure[1], u(2)) / 10) * 10,
      res = Math.round(lerp(W.reserve[0], W.reserve[1], Math.pow(u(3), 1.6)) / 1000) * 1000;
    const score = (prod - W.production[0]) / (W.production[1] - W.production[0]) * .5 + (pres - W.pressure[0]) / (W.pressure[1] - W.pressure[0]) * .25 + (res - W.reserve[0]) / (W.reserve[1] - W.reserve[0]) * .25;
    return { production: prod, pressure: pres, reserve: res, cost: Math.round((W.cost[0] + (W.cost[1] - W.cost[0]) * score) / 1000) * 1000 };
  }
  /* a well on a real oil field draws from the field's ONE reserve; its own numbers come from the field. Wells on a field without data (the mock worlds of the tests) keep the old per-well profile. */
  const WORLDCFG = () => (typeof OliWorld !== 'undefined' ? OliWorld.CONFIG : require('./worldmap.js').CONFIG);
  function fieldProfile(store, b) {
    const ts = store.ts; if (!b.field || !ts || !ts.take || !ts.site) return null; const site = ts.site(b.field); if (!site || site.kind !== 'FIELD' || !site.props) return null;
    const pr = wellProfile(b.x, b.y);       // the rate and the pressure of a single well stay what they always were (the economy keeps its balance); the field only adds the shared reserve, the capacity limit and its own water cut
    return { site, nominal: pr.production, p0: pr.pressure };
  }
  const priceOf = (def, x, y) => def.type === 'well' ? wellProfile(x, y).cost : def.cost;

  /* ------------------------------------------------------------ pipelines */
  const pk = (b, port) => b + ':' + port;
  class PipeNet extends Set {                                       // a Set of tile keys (so the Phase 2 link helpers keep working) + the explicit lines
    constructor(W) { super(); this.W = W; this.lines = new Map(); this.at = new Map(); this.nextId = 1; this.nextConn = 1; this.rev = 0; }
    lay(line) { const id = line.id != null && !this.lines.has(line.id) ? line.id : this.nextId++; if (id >= this.nextId) this.nextId = id + 1; const L = Object.assign({ flow: 0 }, line, { id }); this.lines.set(id, L); for (const [x, y] of L.path) { const k = key(this.W, x, y); this.add(k); this.at.set(k, id); } this.rev++; return L; }
    remove(id) { const L = this.lines.get(id); if (!L) return false; for (const [x, y] of L.path) { const k = key(this.W, x, y); this.delete(k); this.at.delete(k); } this.lines.delete(id); this.rev++; return true; }
    lineAt(x, y) { const id = this.at.get(key(this.W, x, y)); return id ? this.lines.get(id) : null; }
    productAt(x, y) { const L = this.lineAt(x, y); return L ? L.product : null; }
    /* backward compatible view: Phase C pipes carry no product, so every legacy tile is CRUDE with the default diameter */
    static legacyView(tiles, W) { const n = new PipeNet(W); for (const k of tiles) { n.add(k); } n.legacy = true; n.legacyProduct = P.CRUDE; return n; }
    toJSON() { return { v: 1, next: this.nextId, nc: this.nextConn, lines: [...this.lines.values()].map(L => { const o = { id: L.id, a: L.a, b: L.b, path: L.path, product: L.product, dia: L.dia }; if (L.conn) o.conn = L.conn; if (L.open === false) o.open = false; return o; }) }; }
    static fromJSON(W, d) { const n = new PipeNet(W); if (!d || !Array.isArray(d.lines)) return n; for (const L of d.lines) { if (!Array.isArray(L.path) || !L.path.length) continue; { const X = { a: L.a, b: L.b, path: L.path, product: L.product || ANY, dia: CFG.PIPES[L.dia] ? L.dia : CFG.PIPE_DEFAULT }; if (L.conn) X.conn = L.conn; if (L.open === false) X.open = false; n.lay(X); } } n.nextConn = Math.max(d.nc | 0, 1, ...[...n.lines.values()].map(L => (L.conn | 0) + 1)); return n; }
  }
  const lineSpec = L => { const s = CFG.PIPES[L.dia] || CFG.PIPES[CFG.PIPE_DEFAULT]; return { length: L.path.length * CFG.TILE_METERS, capacity: s.capacity, maxPressure: s.maxPressure }; };

  /* the product a connected network carries: walk through product-transparent devices (pump, valve, junction) and pipelines, collect the fixed products met */
  function networkProducts(store, net, startKeys, extraEdge) {
    const seen = new Set(), found = new Set(), q = startKeys.slice(); const edges = new Map();
    const addE = (a, b) => { (edges.get(a) || edges.set(a, []).get(a)).push(b); (edges.get(b) || edges.set(b, []).get(b)).push(a); };
    for (const L of net.lines.values()) if (L.a && L.b) addE(pk(L.a.b, L.a.port), pk(L.b.b, L.b.port));
    if (extraEdge) addE(extraEdge[0], extraEdge[1]);
    while (q.length) {
      const k = q.pop(); if (seen.has(k)) continue; seen.add(k); const [bid, port] = k.split(':'), b = store.get(+bid); if (!b) continue; const def = DEFS[b.d], c = def.connections.find(z => z.id === port);
      if (c && c.product && c.product !== ANY) found.add(c.product);
      if (c && c.product === ANY) for (const o of def.connections) if (o.product === ANY) q.push(pk(b.id, o.id));       // transparent device: all its ports share one product
      for (const n of edges.get(k) || []) q.push(n);
    }
    return found;
  }

  /* L-free routing on the tile grid: BFS around buildings, water, other pipes (and their neighbours); returns the path of tiles or null */
  function route(store, net, ts, from, to, opts) {
    opts = opts || {}; const W = store.W, margin = opts.margin || 14, x0 = Math.min(from[0], to[0]) - margin, x1 = Math.max(from[0], to[0]) + margin, y0 = Math.min(from[1], to[1]) - margin, y1 = Math.max(from[1], to[1]) + margin;
    const own = opts.own || new Set(), acc = new Set(); for (const o of store.query(x0, y0, x1, y1)) for (const p of B.worldPoints(o)) if (p.kind === 'pipe' && !p.reserved) acc.add(key(W, p.ax, p.ay)); const okTile = (x, y, end) => {
      if (x < 0 || y < 0 || x >= W || y >= store.H) return false; const t = ts.tile(x, y); if (!t || !ts.terrain[t.terrain].buildable) return false; if (store.at(x, y)) return false;
      { const ln = net.lineAt(x, y); if (ln && ln.id !== opts.ignoreLine) return false; } if (!end && acc.has(key(W, x, y))) return false; return true; };
    if (!okTile(from[0], from[1], true) || !okTile(to[0], to[1], true)) return null;
    const idx = (x, y) => (y - y0) * (x1 - x0 + 1) + (x - x0), prev = new Map(), q = [from], seen = new Set([idx(from[0], from[1])]); let head = 0, guard = 0;
    while (head < q.length && guard++ < 60000) {
      const [x, y] = q[head++]; if (x === to[0] && y === to[1]) { const out = [[x, y]]; let k = idx(x, y); while (prev.has(k)) { const p = prev.get(k); out.push(p); k = idx(p[0], p[1]); } return out.reverse(); }
      for (const [dx, dy] of B.SIDES) { const nx = x + dx, ny = y + dy; if (nx < x0 || ny < y0 || nx > x1 || ny > y1) continue; const k = idx(nx, ny); if (seen.has(k)) continue; if (!okTile(nx, ny, nx === to[0] && ny === to[1])) continue; seen.add(k); prev.set(k, [x, y]); q.push([nx, ny]); }
    }
    return null;
  }

  /* validate + lay a pipeline from port A to port B (each {b: buildingId, port: portId}); returns {ok, reason, line?, cost} -- the same verdict shape as the building validator */
  function planPipe(store, net, ts, A, Bp, dia, opts) {
    opts = opts || {}; dia = CFG.PIPES[dia] ? dia : CFG.PIPE_DEFAULT; const ba = store.get(A.b), bb = store.get(Bp.b), fail = (reason, kind) => ({ ok: false, state: 'INVALID', kind: kind || 'RULE', reason });
    if (!ba || !bb) return fail('noPort'); if (ba.id === bb.id) return fail('sameBuilding');
    const pa = B.worldPoints(ba).find(p => p.id === A.port && p.kind === 'pipe'), pb = B.worldPoints(bb).find(p => p.id === Bp.port && p.kind === 'pipe'); if (!pa || !pb || pa.reserved || pb.reserved) return fail('noPort');
    if (ba.st === 'UNDER_CONSTRUCTION' && !opts.allowConstruction) { /* pipes may be laid to buildings under construction: allowed */ }
    if (!(pa.role === 'out' && pb.role === 'in') && !(pa.role === 'in' && pb.role === 'out') && !(pa.role === 'both' || pb.role === 'both')) return fail('portRoles');
    if (pa.role === pb.role && pa.role !== 'both') return fail('portRoles');
    if (!B.productOk(pa.product, pb.product)) return Object.assign(fail('invalidProduct', 'PRODUCT'), { wants: pa.product, has: pb.product });
    for (const p of [pa, pb]) if (net.lineAtPort && net.lineAtPort(p)) return fail('portTaken');
    for (const L of net.lines.values()) for (const e of [L.a, L.b]) if (e && ((e.b === A.b && e.port === A.port) || (e.b === Bp.b && e.port === Bp.port))) return fail('portTaken');
    const prods = networkProducts(store, net, [pk(A.b, A.port), pk(Bp.b, Bp.port)], [pk(A.b, A.port), pk(Bp.b, Bp.port)]);
    if (prods.size > 1) return Object.assign(fail('invalidProduct', 'PRODUCT'), { products: [...prods] });
    const path = route(store, net, ts, [pa.ax, pa.ay], [pb.ax, pb.ay], opts); if (!path) return fail('noRoute', 'ROUTE');
    const product = prods.size === 1 ? [...prods][0] : ANY, cost = path.length * CFG.PIPES[dia].cost;
    if (store.cash < cost && !opts.ignoreCash) return { ok: false, state: 'UNAFFORDABLE', reason: 'cash', cost, kind: null };
    return { ok: true, state: 'VALID', cost, path, product, dia, a: { b: A.b, port: A.port }, b: { b: Bp.b, port: Bp.port }, length: path.length * CFG.TILE_METERS };
  }
  function layPipe(store, net, ts, A, Bp, dia, opts) {
    const v = planPipe(store, net, ts, A, Bp, dia, opts); if (!v.ok) return v; const L = net.lay({ a: v.a, b: v.b, path: v.path, product: v.product, dia: v.dia }); if (store.cash !== Infinity) store.cash -= v.cost; return Object.assign({}, v, { line: L });
  }


  /* An OPEN pipeline starts at a building port and ends on a free tile (b = null): the player does not have to finish the network while building.
   * It carries nothing ("not connected") until closePipe() joins its free end to a port.  The simulator already ignores lines that lack an end. */
  function portInfo(store, ref) { const b = store.get(ref.b); if (!b) return null; const p = B.worldPoints(b).find(q => q.id === ref.port && q.kind === 'pipe' && !q.reserved); return p ? { b, p } : null; }
  function portTaken(net, ref, exceptId) { for (const L of net.lines.values()) { if (L.id === exceptId) continue; for (const e of [L.a, L.b]) if (e && e.b === ref.b && e.port === ref.port) return true; } return false; }
  function planOpenPipe(store, net, ts, A, end, dia, opts) {
    opts = opts || {}; dia = CFG.PIPES[dia] ? dia : CFG.PIPE_DEFAULT; const fail = (reason, kind) => ({ ok: false, state: 'INVALID', kind: kind || 'RULE', reason }), pa = portInfo(store, A); if (!pa) return fail('noPort');
    if (portTaken(net, A)) return fail('portTaken');
    const path = route(store, net, ts, [pa.p.ax, pa.p.ay], [end[0], end[1]], opts); if (!path) return fail('noRoute', 'ROUTE'); if (path.length < 2) return fail('tooShort');
    const prods = networkProducts(store, net, [pk(A.b, A.port)]), product = prods.size === 1 ? [...prods][0] : ANY, cost = path.length * CFG.PIPES[dia].cost;
    if (store.cash < cost && !opts.ignoreCash) return { ok: false, state: 'UNAFFORDABLE', reason: 'cash', cost, kind: null };
    return { ok: true, state: 'VALID', cost, path, product, dia, a: { b: A.b, port: A.port }, b: null, open: true, length: path.length * CFG.TILE_METERS };
  }
  function layOpenPipe(store, net, ts, A, end, dia, opts) { const v = planOpenPipe(store, net, ts, A, end, dia, opts); if (!v.ok) return v; const L = net.lay({ a: v.a, b: null, path: v.path, product: v.product, dia: v.dia }); if (store.cash !== Infinity) store.cash -= v.cost; return Object.assign({}, v, { line: L }); }
  function planClosePipe(store, net, ts, lineId, Bp, opts) {
    opts = opts || {}; const L = net.lines.get(lineId), fail = (reason, kind) => ({ ok: false, state: 'INVALID', kind: kind || 'RULE', reason }); if (!L || L.b || !L.a) return fail('noPort');
    const pa = portInfo(store, L.a), pb = portInfo(store, Bp); if (!pa || !pb) return fail('noPort'); if (pa.b.id === pb.b.id) return fail('sameBuilding'); if (portTaken(net, Bp, lineId)) return fail('portTaken');
    const ra = pa.p.role, rb = pb.p.role; if (!((ra === 'out' && rb === 'in') || (ra === 'in' && rb === 'out') || ra === 'both' || rb === 'both') || (ra === rb && ra !== 'both')) return fail('portRoles');
    if (!B.productOk(pa.p.product, pb.p.product)) return Object.assign(fail('invalidProduct', 'PRODUCT'), { wants: pa.p.product, has: pb.p.product });
    const prods = networkProducts(store, net, [pk(L.a.b, L.a.port), pk(Bp.b, Bp.port)], [pk(L.a.b, L.a.port), pk(Bp.b, Bp.port)]); if (prods.size > 1) return Object.assign(fail('invalidProduct', 'PRODUCT'), { products: [...prods] });
    const last = L.path[L.path.length - 1], target = [pb.p.ax, pb.p.ay]; let add = [];
    if (!(last[0] === target[0] && last[1] === target[1])) { const r = route(store, net, ts, last, target, Object.assign({}, opts, { ignoreLine: lineId })); if (!r) return fail('noRoute', 'ROUTE'); add = r.slice(1); }
    const cost = add.length * CFG.PIPES[L.dia].cost; if (store.cash < cost && !opts.ignoreCash) return { ok: false, state: 'UNAFFORDABLE', reason: 'cash', cost, kind: null };
    return { ok: true, state: 'VALID', cost, add, product: prods.size === 1 ? [...prods][0] : ANY, b: { b: Bp.b, port: Bp.port }, id: lineId };
  }
  function closePipe(store, net, ts, lineId, Bp, opts) {
    const v = planClosePipe(store, net, ts, lineId, Bp, opts); if (!v.ok) return v; const L = net.lines.get(lineId), path = L.path.concat(v.add), a = L.a, dia = L.dia; net.remove(lineId);
    const NL = net.lay({ a, b: v.b, path, product: v.product, dia }); if (store.cash !== Infinity) store.cash -= v.cost; return Object.assign({}, v, { line: NL });
  }


  /* ------------------------------------------------------------ AUTOMATIC CONNECTION (Stage 5): the player picks two buildings; the game does the rest, with the pieces above (route, planPipe, PipeNet).
   *  A connection is TWO independent lines - A.out -> B.in and B.out -> A.in - each with its own valve, direction and flow (having both does not mean both flow at once).
   *  planConnect() lays nothing: it picks the ports, routes both lines (the second one around the first), checks products / ports / capacity and prices the whole job.
   *  An incomplete connection is never adopted silently: a direction that fails is reported with its reason and cost; only the player can choose to build the rest (opts.allowOneWay).
   *  A direction that no port pair of these two buildings can ever serve (a well receives nothing, a refinery's products cannot enter a crude tank) is a "natural one-way" and is allowed, and said so. */
  const portsOf = b => B.worldPoints(b).filter(p => p.kind === 'pipe' && !p.reserved);
  const canSend = p => p.role === 'out' || p.role === 'both', canTake = p => p.role === 'in' || p.role === 'both';
  function autoDia(def) { const need = def && def.capacity && /day/.test(def.capacity.unit || '') ? def.capacity.value : 0; if (!need) return CFG.PIPE_DEFAULT; const ds = Object.keys(CFG.PIPES).map(Number).sort((a, b) => a - b); return ds.find(d => CFG.PIPES[d].capacity >= need) || ds[ds.length - 1]; }
  const REASON_RANK = { cash: 5, noRoute: 4, portTaken: 3, invalidProduct: 2, portRoles: 1, noPort: 0 };
  function planDirection(store, net, ts, src, dst, o) {
    const pairs = []; for (const pa of portsOf(src)) if (canSend(pa)) for (const pb of portsOf(dst)) if (canTake(pb) && !(pa.role === 'both' && pb.role === 'both' && false) && B.productOk(pa.product, pb.product)) pairs.push({ pa, pb, d: Math.abs(pa.ax - pb.ax) + Math.abs(pa.ay - pb.ay) });
    if (!pairs.length) return { natural: true };
    const sp = (b, free) => q => { if (portTaken(net, { b: b.id, port: q.id })) return 0; const nb = portsOf(b).filter(z => z.id !== q.id && z.side === q.side && z.role === q.role && z.group === q.group && Math.abs(z.ax - q.ax) + Math.abs(z.ay - q.ay) === 1 && !portTaken(net, { b: b.id, port: z.id })); return nb.length >= 2 ? 1 : 0; };    // a port in the MIDDLE of a run of free ports would wall the others in: take the ends of the run first
    const spS = sp(src), spD = sp(dst); for (const q of pairs) q.k = q.d + 1000 * (spS(q.pa) + spD(q.pb)); pairs.sort((x, y) => x.k - y.k); const dia = o.dia || Math.max(autoDia(DEFS[src.d]), autoDia(DEFS[dst.d])); let best = null, worst = null, tried = 0;
    for (const q of pairs) { if (tried >= (o.tries || 10)) break; if (portTaken(net, { b: src.id, port: q.pa.id }) || portTaken(net, { b: dst.id, port: q.pb.id })) { worst = worst || { reason: 'portTaken' }; continue; } tried++;
      const v = planPipe(store, net, ts, { b: src.id, port: q.pa.id }, { b: dst.id, port: q.pb.id }, dia, { ignoreCash: true, margin: o.margin || 22 });
      if (v.ok) { if (!best || v.path.length < best.path.length) best = v; } else if (!worst || (REASON_RANK[v.reason] || 0) > (REASON_RANK[worst.reason] || 0)) worst = { reason: v.reason, wants: v.wants, has: v.has, products: v.products }; }
    if (best) { const cap = CFG.PIPES[best.dia].capacity, flow = DEFS[src.d].capacity && /day/.test(DEFS[src.d].capacity.unit || '') ? DEFS[src.d].capacity.value : 0; return { plan: best, warn: flow > cap ? { reason: 'pipeSmall', capacity: cap, flow } : null }; }
    return { fail: worst || { reason: 'noPort' } };
  }
  /* is dst already fed from src through existing lines (directly, or through junctions / valves / pumps)?  Then another line for that direction would be a duplicate. */
  function reaches(store, net, srcId, dstId) {
    const seen = new Set([srcId]), q = [srcId]; while (q.length) { const cur = q.pop(); for (const L of net.lines.values()) { if (!L.a || !L.b || L.a.b !== cur) continue; const nx = L.b.b; if (nx === dstId) return true; if (seen.has(nx)) continue; const b = store.get(nx); if (b && /^(junction|valve|pump)/.test(DEFS[b.d].type) ) { seen.add(nx); q.push(nx); } } }
    return false;
  }
  /* control after the connection: every line has its own valve (open / closed); the other line of the same connection is not touched */
  function setLineOpen(net, id, open) { const L = net.lines.get(id); if (!L) return false; if (open) delete L.open; else L.open = false; if (!open) L.flow = 0; net.rev++; return true; }
  const partnerOf = (net, L) => L && L.conn ? [...net.lines.values()].find(l => l !== L && l.conn === L.conn) || null : null;
  function removeConnection(store, net, id, full) { const L = net.lines.get(id); if (!L) return { ok: false, refund: 0, ids: [] }; const ls = [L]; const p = partnerOf(net, L); if (p) ls.push(p); let refund = 0; for (const l of ls) { refund += Math.floor(l.path.length * CFG.PIPES[l.dia].cost * (full ? 1 : 0.5)); net.remove(l.id); } if (store.cash !== Infinity) store.cash += refund; return { ok: true, refund, ids: ls.map(l => l.id), ends: ls.map(l => [l.a, l.b]) }; }
  function planDirs(store, net, ts, specs, o) {                                              // specs: [[srcBuilding, dstBuilding, dirName], ...]
    o = o || {}; const res = { ok: false, state: 'INVALID', lines: [], problems: [], notes: [], cost: 0, length: 0 };
    const saveNext = net.nextId, saveRev = net.rev, laid = [];
    try {
      for (const [src, dst, dir] of specs) {
        if (reaches(store, net, src.id, dst.id)) { res.notes.push({ dir, reason: 'exists', from: src.id, to: dst.id }); continue; }      // never a second line for the same direction
        const r = planDirection(store, net, ts, src, dst, o);
        if (r.plan) { const v = r.plan, L = net.lay({ a: v.a, b: v.b, path: v.path, product: v.product, dia: v.dia }); laid.push(L.id); res.lines.push({ dir, from: src.id, to: dst.id, a: v.a, b: v.b, path: v.path, product: v.product, dia: v.dia, cost: v.cost, length: v.length, warn: r.warn }); res.cost += v.cost; res.length += v.length; if (r.warn) res.notes.push(Object.assign({ dir }, r.warn)); }
        else if (r.natural) res.notes.push({ dir, reason: 'oneWay', from: src.id, to: dst.id }); else res.problems.push(Object.assign({ dir, from: src.id, to: dst.id }, r.fail));
      }
    } finally { for (const id of laid) net.remove(id); net.nextId = saveNext; net.rev = saveRev; }
    if (!res.lines.length) { res.reason = (res.problems[0] && res.problems[0].reason) || (res.notes.some(n => n.reason === 'exists') ? 'alreadyConnected' : 'noPort'); return res; }
    res.partial = res.problems.length > 0; res.ok = !res.partial; res.state = res.ok ? 'VALID' : 'INCOMPLETE';
    if (res.ok && store.cash < res.cost && !o.ignoreCash) { res.ok = false; res.state = 'UNAFFORDABLE'; res.reason = 'cash'; }
    return res;
  }
  function planConnect(store, net, ts, idA, idB, o) {
    const A = store.get(idA), Bb = store.get(idB); if (!A || !Bb) return { ok: false, state: 'INVALID', reason: 'noPort', lines: [], problems: [], notes: [], cost: 0 }; if (A.id === Bb.id) return { ok: false, state: 'INVALID', reason: 'sameBuilding', lines: [], problems: [], notes: [], cost: 0 };
    const isP = b => /^pump/.test(DEFS[b.d].type) || DEFS[b.d].family === 'MANIFOLD', free = (b, role) => portsOf(b).some(q => (role === 'out' ? canSend(q) : canTake(q)) && !portTaken(net, { b: b.id, port: q.id }));
    if (isP(A) !== isP(Bb)) {                                                                  // a pump only pushes one way: ONE line, towards its free side (a return line into the pump's own feed is meaningless)
      const P = isP(A) ? A : Bb, O = P === A ? Bb : A; let spec = P === A ? [P, O, 'ab'] : [O, P, 'ab'];
      if (P === A && !free(P, 'out') && free(P, 'in')) spec = [O, P, 'ba']; else if (P === Bb && !free(P, 'in') && free(P, 'out')) spec = [P, O, 'ba'];
      const r = planDirs(store, net, ts, [spec], o); r.notes.push({ dir: spec[2] === 'ab' ? 'ba' : 'ab', reason: 'oneWay', why: 'directionalDevice', from: spec[1].id, to: spec[0].id }); return r;     // the decision is by device kind (a pump / manifold has a feed side and a delivery side) - everything else keeps BOTH lines
    }
    return planDirs(store, net, ts, [[A, Bb, 'ab'], [Bb, A, 'ba']], o);
  }
  function commitPlan(store, net, v, o) {                                                    // lay a plan that planDirs() returned (paths are already routed around each other, in the same order)
    o = o || {}; if (!v.lines.length) return v; if (!v.ok && !(o.allowOneWay && v.partial)) return v; if (store.cash < v.cost && !o.ignoreCash) return Object.assign({}, v, { ok: false, state: 'UNAFFORDABLE', reason: 'cash' });
    const conn = net.nextConn++, made = [], closeBack = v.lines.length === 2 || (v.notes || []).some(n => n.reason === 'exists' && n.dir === 'ab');
    for (const l of v.lines) { const L = net.lay({ a: l.a, b: l.b, path: l.path, product: l.product, dia: l.dia, conn }); if (l.dir === 'ba' && closeBack) L.open = false; made.push(L); }      // two lines are built, ONE runs: the return line is ready but its valve is closed (open both and the oil only sloshes back and forth)
    net.rev++;
    if (store.cash !== Infinity) store.cash -= v.cost; return Object.assign({}, v, { ok: true, state: 'BUILT', conn, made });
  }
  function layConnect(store, net, ts, idA, idB, o) { o = o || {}; return commitPlan(store, net, planConnect(store, net, ts, idA, idB, o), o); }



  /* ---- branching: a building is connected to an EXISTING line by putting a junction on that line (the only place where lines merge or split, as before), then the ordinary two-line connection */
  const lineCopy = L => ({ id: L.id, a: L.a, b: L.b, path: L.path.map(p => p.slice()), product: L.product, dia: L.dia, conn: L.conn, open: L.open });
  function insertJunction(store, net, ts, lineId, idx, o) {
    o = o || {}; const L = net.lines.get(lineId), fail = reason => ({ ok: false, reason }); if (!L || !L.a || !L.b) return fail('noPort'); const n = L.path.length; if (n < 3) return fail('tooShort');
    const cost = CFG.JUNCTION.cost; if (store.cash < cost && !o.ignoreCash) return { ok: false, reason: 'cash', cost };
    const bk = lineCopy(L), cash0 = store.cash, sNext = store.nextId, sRev = store.rev, nNext = net.nextId, nRev = net.rev, before = new Set(net.lines.keys());
    const undo = j => { for (const id of [...net.lines.keys()]) if (!before.has(id)) net.remove(id); if (j) store.demolish(j.id, { building: true, pipes: true, pipeSet: net }); if (!net.lines.has(bk.id)) net.lay(bk); store.cash = cash0; store.nextId = sNext; store.rev = sRev; net.nextId = nNext; net.rev = nRev; };
    idx = Math.max(1, Math.min(n - 2, idx == null ? n >> 1 : idx)); net.remove(L.id); const order = [idx]; for (let k = 1; k <= n - 2; k++) if (k !== idx) order.push(k); order.sort((p, q) => Math.abs(p - idx) - Math.abs(q - idx));
    let T = null; for (const k of order) { const t = bk.path[k]; if (store.validate('junction', t[0], t[1], 0, { ignoreCash: true }).ok) { T = t; break; } } if (!T) { undo(null); return fail('noSpot'); }
    const pr = store.place('junction', T[0], T[1], 0, { instant: true, ignoreCash: true }); if (!pr.ok) { undo(null); return fail('noSpot'); } const j = pr.building, ports = portsOf(j).map(q => q.id);
    const opts = { ignoreCash: true }; let best = null; for (const p of ports) { const v = planPipe(store, net, ts, bk.a, { b: j.id, port: p }, bk.dia, opts); if (v.ok && (!best || v.path.length < best.v.path.length)) best = { p, v }; }
    if (!best) { undo(j); return fail('noRoute'); } const r1 = layPipe(store, net, ts, bk.a, { b: j.id, port: best.p }, bk.dia, opts); if (!r1.ok) { undo(j); return fail('noRoute'); }
    let r2 = null; for (const p of ports) { if (p === best.p) continue; const v = planPipe(store, net, ts, { b: j.id, port: p }, bk.b, bk.dia, opts); if (v.ok) { r2 = layPipe(store, net, ts, { b: j.id, port: p }, bk.b, bk.dia, opts); if (r2.ok) break; r2 = null; } }
    if (!r2) { undo(j); return fail('noRoute'); }
    for (const l of [r1.line, r2.line]) { if (bk.conn) l.conn = bk.conn; if (bk.open === false) l.open = false; }
    store.cash = cash0 - cost; return { ok: true, junction: j, lines: [r1.line, r2.line], cost, undo: () => undo(j) };
  }
  /* connect a building to an existing network.  target = { building: id }  (an ordinary two-line connection to that building)
   *                                                  or { line: id, idx? }  (the junction is put on that line first).  commit=false: nothing stays changed, the verdict and the full cost are returned. */
  function branchTo(store, net, ts, idX, target, o) {
    o = o || {}; const empty = reason => ({ ok: false, state: 'INVALID', reason, lines: [], problems: [], notes: [], cost: 0 }), X = store.get(idX); if (!X) return empty('noPort');
    if (target.building != null) return o.commit === false ? planConnect(store, net, ts, idX, target.building, o) : layConnect(store, net, ts, idX, target.building, o);
    const L = net.lines.get(target.line); if (!L || !L.a || !L.b) return empty('noPort'); if (L.a.b === idX || L.b.b === idX) return empty('alreadyConnected');       // already an end of that line
    const partner0 = L.conn ? [...net.lines.values()].find(l => l !== L && l.conn === L.conn && l.a && l.b) : null;
    const flip = partner0 && L.open === false && partner0.open !== false;                       // the line that carries oil is the one the new building draws from; the other line receives what it sends
    const drawL = flip ? partner0 : L, partner = flip ? L : partner0;
    const run = () => {                                                                       // tap the connection: a junction on the line (and one on its partner), then the two branch lines; everything laid here is undone by undo()
      const js = []; const jr1 = insertJunction(store, net, ts, drawL.id, flip ? null : target.idx, { ignoreCash: true }); if (!jr1.ok) return { err: jr1.reason }; js.push(jr1);
      let jDraw = jr1.junction, jSend = jr1.junction;
      if (partner) { const jr2 = insertJunction(store, net, ts, partner.id, flip ? target.idx : null, { ignoreCash: true }); if (!jr2.ok) { jr1.undo(); return { err: jr2.reason }; } js.push(jr2); jSend = jr2.junction; }
      const undo = () => { for (const j of js.slice().reverse()) j.undo(); }, plan = planDirs(store, net, ts, [[jDraw, X, 'ab'], [X, jSend, 'ba']], Object.assign({}, o, { ignoreCash: true }));
      return { js, plan, undo, jcost: js.reduce((q, j) => q + j.cost, 0) };
    };
    const p = run(); if (p.err) return empty(p.err); const v0 = p.plan, total = v0.cost + p.jcost, jcost = p.jcost; p.undo();
    const res = Object.assign({}, v0, { cost: total, junctionCost: jcost }); if (!v0.lines.length) return res;
    const broke = store.cash < total && !o.ignoreCash; if (v0.ok && broke) { res.ok = false; res.state = 'UNAFFORDABLE'; res.reason = 'cash'; }
    if (o.commit === false || broke || !(v0.ok || (o.allowOneWay && v0.partial))) return res;
    const q = run(); if (q.err) return empty(q.err); const done = commitPlan(store, net, q.plan, { ignoreCash: true, allowOneWay: o.allowOneWay });
    if (!done.made) { q.undo(); return Object.assign(res, { ok: false }); }
    return Object.assign({}, done, { cost: total, junctionCost: jcost, junctions: q.js.map(j => j.junction.id) });
  }

  /* ------------------------------------------------------------ levels, safety helpers */
  const levelOf = b => Object.assign({ level: 1, capacityMultiplier: 1, efficiencyMultiplier: 1, pressureMultiplier: 1, maintenanceMultiplier: 1 }, CFG.LEVELS[b.lv || 1]);
  function tankLevel(fill) { return fill <= 0.0005 ? 'EMPTY' : fill < SAFE.tankLow ? 'LOW' : fill < SAFE.tankHigh ? 'NORMAL' : fill < SAFE.tankNearFull ? 'HIGH' : fill < SAFE.tankFull - 1e-6 ? 'OVERFLOW_RISK' : 'FULL'; }
  function gasSafety(fill, pressureRatio, temp) {
    if (fill >= 1 - 1e-6 || pressureRatio >= 1 || temp > SAFE.gasHighTempC + 15) return 'EMERGENCY'; if (pressureRatio >= SAFE.gasNearLimit || fill >= SAFE.gasNearLimit) return 'NEAR_LIMIT';
    if (temp > SAFE.gasHighTempC) return 'HIGH_TEMPERATURE'; if (pressureRatio >= SAFE.gasHighPressure) return 'HIGH_PRESSURE'; return 'NORMAL';
  }

  /* ------------------------------------------------------------ the simulator */
  class Sim {
    constructor(store, net) { this.store = store; this.net = net; this.edges = new Map(); this._el = []; this.builtRev = -1; this.time = 0; this.dt = 0.05; this.lastStep = 0; store.priceOf = priceOf; store.pipeAt = (x, y) => net.productAt(x, y); }

    /* ---- state per building (kept in b.s, saved with the game) ---- */
    ensure(b) {
      if (b.s) return b.s; const def = DEFS[b.d], t = def.type, L = levelOf(b);
      if (t === 'well') { const fp = fieldProfile(this.store, b), pr = fp ? null : wellProfile(b.x, b.y); b.s = fp ? { reserve: fp.site.remainingReserve, reserve0: fp.site.initialReserve, p0: fp.p0, nominal: fp.nominal, total: 0, shared: 1 } : { reserve: pr.reserve, reserve0: pr.reserve, p0: pr.pressure, nominal: pr.production, total: 0 }; }
      else if (t === 'pump') { const c = def.params, u = hash(b.x, b.y, 7); b.s = { boost: Math.round(lerp(c.boost[0], c.boost[1], u)), eff: +lerp(c.eff[0], c.eff[1], hash(b.x, b.y, 8)).toFixed(3), total: 0 }; }
      else if (t === 'valve') b.s = { mode: 'OPEN', opening: 1 };
      else if (t === 'tank') b.s = { vol: 0, wat: 0, temp: SAFE.ambientC, total: 0 };
      else if (t === 'gas') b.s = { vol: 0, temp: SAFE.ambientC, total: 0 };
      else if (t === 'separator') b.s = { total: 0, slop: 0, flared: 0 };
      else if (t === 'refinery') b.s = { temp: 60, eff: 0, opLimit: 1, made: { GASOLINE: 0, DIESEL: 0, JET_FUEL: 0, GAS: 0, OTHER: 0 }, crude: 0, flared: 0 };
      else b.s = {};
      return b.s;
    }
    /* ---- the graph: pipeline edges + directly docked ports ---- */
    build() {
      const store = this.store, net = this.net, E = new Map(); this.edges = E; const edge = (ka, kb, L) => { const sp = L ? lineSpec(L) : { length: 0, capacity: 1e12, maxPressure: 1e9 }; const ia = ka.indexOf(':'), ib = kb.indexOf(':'), e = { a: ka, b: kb, ab: +ka.slice(0, ia), ap: ka.slice(ia + 1), bb: +kb.slice(0, ib), bp: kb.slice(ib + 1), line: L || null, tiles: L ? L.path.length : 0, cap: sp.capacity, maxP: sp.maxPressure, flow: 0, over: false, lowP: false }; E.set(ka, e); E.set(kb, e); };
      for (const L of net.lines.values()) { if (!L.a || !L.b || L.open === false) continue; if (!store.get(L.a.b) || !store.get(L.b.b)) continue; edge(pk(L.a.b, L.a.port), pk(L.b.b, L.b.port), L); }
      const pts = new Map(); for (const b of store.items.values()) for (const p of B.worldPoints(b)) if (p.kind === 'pipe' && !p.reserved) pts.set(b.id + ':' + p.id, p);
      for (const [k, p] of pts) { if (E.has(k)) continue; const o = store.at(p.ax, p.ay); if (!o || o.id === p.buildingId) continue; for (const q of B.worldPoints(o)) if (q.x === p.ax && q.y === p.ay && q.ax === p.x && q.ay === p.y && B.compatible(p, q) && !E.has(pk(o.id, q.id))) { edge(k, pk(o.id, q.id), null); break; } }
      this._el = [...new Set(E.values())];                                          // each edge once, for the per-step loops
      this.builtRev = (store.rev | 0) * 100000 + net.rev; this._rev = this.builtRev;
    }
    dirty() { return this.builtRev !== (this.store.rev | 0) * 100000 + this.net.rev; }
    edgeOf(b, port) { return this.edges.get(pk(b.id, port)) || null; }
    other(e, b, port) { return e.a === pk(b.id, port) ? { b: this.store.get(e.bb), port: e.bp } : { b: this.store.get(e.ab), port: e.ap }; }

    /* offer a flow into the pipeline attached to (b, port); returns the accepted rate. Pressure falls along the line, capacity limits the rate. */
    offer(b, port, f, commit, vis) {
      if (f.r <= 1e-9) return 0; const e = this.edgeOf(b, port); if (!e) return 0; const far = this.other(e, b, port); if (!far.b) return 0;
      const room = e.cap - e.flow; let r = Math.min(f.r, room); if (f.r > room + 1e-9) e.over = true; if (r <= 1e-9) return 0;
      const ratio = r / e.cap, loss = e.tiles * SIM.frictionPsiPerTile * Math.pow(ratio, SIM.frictionExp) * (e.line && e.line.dia ? 16 / e.line.dia : 1); let p = f.p - loss;
      if (p < 0) { r *= Math.max(0, f.p / (loss || 1)); p = 0; if (commit) e.lowP = true; }
      if (r <= 1e-9) return 0; const acc = this.accept(far.b, far.port, Object.assign({}, f, { r, p }), commit, vis);
      if (commit && acc > 0) { e.flow += acc; e.p = p; e.prod = f.prod; if (e.line) e.line.flow = e.flow; if (p > e.maxP) e.hiP = true; }
      return acc;
    }
    /* split a flow over several output ports (water-fill by what each can take) */
    split(b, ports, f, commit, vis) {
      const outs = ports.filter(pid => this.edgeOf(b, pid)); if (!outs.length) return 0;
      if (outs.length === 1) return this.offer(b, outs[0], f, commit, vis);
      const probe = outs.map(pid => ({ pid, can: this.offer(b, pid, f, false, vis) })).sort((x, y) => x.can - y.can); let remain = f.r, left = probe.length, total = 0;
      for (const o of probe) { const take = Math.min(o.can, remain / left); remain -= take; left--; if (take > 1e-9) total += commit ? this.offer(b, o.pid, Object.assign({}, f, { r: take }), true, vis) : take; }
      return total;
    }
    ok(b) { return b.st === 'OPERATIONAL'; }

    /* the device on the receiving end of a pipeline */
    accept(b, port, f, commit, vis) {
      const def = DEFS[b.d], s = this.ensure(b), dt = this.dt, c = def.connections.find(z => z.id === port); if (!c || (c.role === 'out') || !this.ok(b)) return 0;
      if (c.product !== ANY && c.product !== f.prod) { if (commit) s._badProduct = true; return 0; }
      vis = vis || new Set(); if (vis.has(b.id)) return 0; vis.add(b.id); let acc = 0;
      try {
        switch (def.type) {
          case 'tank': case 'gas': {
            const cap = def.capacity.value * levelOf(b).capacityMultiplier, keep = def.type === 'tank' && f.prod === P.CRUDE ? 1 - (f.gas || 0) : 1, avail = Math.max(0, cap - s.vol - (s._pend || 0)) / dt;
            s._off = Math.max(s._off || 0, f.r); acc = Math.min(f.r, avail / keep); if (acc <= 0) { if (commit) s._blockedIn = true; break; }
            if (commit) { const add = acc * keep * dt; s._pend = (s._pend || 0) + add; s._pbv = (s._pbv || 0) + add * (f.bf || 0); s._pw = (s._pw || 0) + add * (f.wat || 0) / Math.max(1e-9, 1 - (f.gas || 0)); s._in = (s._in || 0) + acc; s._vent = (s._vent || 0) + acc * (1 - keep); }
            break;
          }
          case 'pump': {
            const c0 = def.params, cap = c0.maxFlow * levelOf(b).capacityMultiplier; s._off = Math.max(s._off || 0, f.r); s.pIn = f.p;
            if (f.p < c0.minInletPsi) { if (commit) { s._lowIn = true; } break; }
            const room = Math.max(0, cap - (s._in || 0)); if (f.r > room + 1e-6) s._sat = true; const boost = s.boost * levelOf(b).pressureMultiplier * s.eff * levelOf(b).efficiencyMultiplier * eco(b); const outs = def.connections.filter(z => z.role === 'out').map(z => z.id), ff = Object.assign({}, f, { r: Math.min(f.r, room), p: f.p + boost }); acc = outs.length > 1 ? this.split(b, outs, ff, commit, vis) : this.offer(b, outs[0] || 'OUTPUT', ff, commit, vis);
            if (commit && acc > 0) { s._in = (s._in || 0) + acc; s.pOut = f.p + boost; }
            break;
          }
          case 'valve': {
            const mode = s.mode, open = mode === 'OPEN' ? 1 : mode === 'PARTIAL' ? s.opening : 0; s._off = Math.max(s._off || 0, f.r); if (open <= 0) { if (commit) s._shut = true; break; }
            const lossP = 1 + 80 * Math.pow(1 - open, 2); acc = this.offer(b, 'OUT', Object.assign({}, f, { r: Math.min(f.r, def.params.maxFlow * open), p: f.p - lossP }), commit, vis);
            if (commit && acc > 0) { s._in = (s._in || 0) + acc; }
            break;
          }
          case 'junction': {
            const cap = def.params.maxTotalFlow, room = Math.max(0, cap - (s._in || 0)); if (f.r > room + 1e-6) s._sat = true; s._off = Math.max(s._off || 0, f.r); const outs = def.connections.filter(z => z.role !== 'in').map(z => z.id).filter(id => id !== port);
            acc = this.split(b, outs, Object.assign({}, f, { r: Math.min(f.r, room), p: f.p - 1 }), commit, vis); if (commit && acc > 0) { s._in = (s._in || 0) + acc; if (f.p > def.params.pressureLimit) s._hiP = true; }
            break;
          }
          case 'separator': acc = this.separate(b, s, def, f, commit, vis); break;
          case 'refinery': acc = this.refine(b, s, def, f, commit, vis); break;
        }
      } finally { vis.delete(b.id); }
      return acc;
    }
    portState(b, id) { const e = this.edgeOf(b, id); return e ? 'connected' : 'none'; }
    separate(b, s, def, f, commit, vis) {
      const C = def.params, L = levelOf(b), cap = C.cap * L.capacityMultiplier, room = Math.max(0, cap - (s._in || 0)); if (f.r > room + 1e-6) s._sat = true; s._off = Math.max(s._off || 0, f.r); s.pIn = f.p;
      if (f.p < C.minInletPsi) { if (commit) s._lowIn = true; return 0; }
      const fo = f.oil == null ? 1 : f.oil, fg = f.gas || 0, fw = f.wat || 0, k = L.efficiencyMultiplier * (0.85 + 0.15 * b.c) * eco(b), eO = Math.min(1, C.oilSep * k), eG = Math.min(1, C.gasSep * k), eW = Math.min(1, C.waterSep * k);
      let r = Math.min(f.r, room); if (r <= 1e-9) return 0;
      const oilR = r * (fo * eO + fw * (1 - eW) + fg * (1 - eG)), gasR = r * fg * eG, watR = r * fw * eW, oilStream = { prod: P.CRUDE, bf: f.bf || 0, oil: oilR ? r * fo * eO / oilR : 1, gas: oilR ? r * fg * (1 - eG) / oilR : 0, wat: oilR ? r * fw * (1 - eW) / oilR : 0, p: f.p - 10 };
      const co = this.edgeOf(b, 'OIL_OUT'); if (!co) { if (commit) s._noOut = true; return 0; }
      let th = 1; const t1 = oilR > 0 ? this.offer(b, 'OIL_OUT', Object.assign({}, oilStream, { r: oilR }), false, vis) / oilR : 1; th = Math.min(th, t1);
      if (this.edgeOf(b, 'GAS_OUT') && gasR > 0) th = Math.min(th, this.offer(b, 'GAS_OUT', { prod: P.GAS, r: gasR, p: f.p * .5 }, false, vis) / gasR);
      if (this.edgeOf(b, 'WATER_OUT') && watR > 0) th = Math.min(th, this.offer(b, 'WATER_OUT', { prod: P.WATER, r: watR, p: f.p * .4 }, false, vis) / watR);
      if (th <= 1e-9) { if (commit) s._blocked = true; return 0; }
      if (commit) {
        this.offer(b, 'OIL_OUT', Object.assign({}, oilStream, { r: oilR * th }), true, vis);
        if (this.edgeOf(b, 'GAS_OUT')) this.offer(b, 'GAS_OUT', { prod: P.GAS, r: gasR * th, p: f.p * .5 }, true, vis); else s.flared += gasR * th * this.dt;
        if (this.edgeOf(b, 'WATER_OUT')) this.offer(b, 'WATER_OUT', { prod: P.WATER, r: watR * th, p: f.p * .4 }, true, vis);
        s._in = (s._in || 0) + r * th; s._o = (s._o || 0) + oilR * th; s._g = (s._g || 0) + gasR * th; s._w = (s._w || 0) + watR * th; s.slop += r * fo * (1 - eO) * th * this.dt; s.total += r * th * this.dt;
      }
      return r * th;
    }
    capOf(b) { return DEFS[b.d].params.cap * levelOf(b).capacityMultiplier; }                  // the refinery's throughput ceiling (bbl/day), used by the economy to gate it on materials
    refine(b, s, def, f, commit, vis) {
      const C = def.params, R = CFG.REFINERY, L = levelOf(b), cap = C.cap * L.capacityMultiplier, lim = Math.min(clamp(s.opLimit, 0, 1), s.matLim == null ? 1 : clamp(s.matLim, 0, 1)); s._off = Math.max(s._off || 0, f.r); s.pIn = f.p;   // the player's throttle and the material limit (set by the economy), whichever is lower
      const util = clamp(lim, 0, 1), water = f.wat || 0, gas = f.gas || 0, quality = clamp(1 - .6 * water - .3 * gas, 0.2, 1), temp = lerp(150, R.optimalTempC, clamp(util * 1.4, 0, 1)), tempF = temp > R.maxTempC ? .8 : 1,
        pressF = clamp(.6 + .4 * Math.min(1, f.p / R.minInletPsi), .6, 1), utilF = .85 + .15 * Math.min(1, util / .6), maintF = .7 + .3 * b.c, eff = clamp(R.baseEfficiency * quality * tempF * pressF * utilF * maintF * L.efficiencyMultiplier * eco(b), 0, 1);
      // three separate things: the yield (R.yields, the recipe), the efficiency (eff: the share of nameplate capacity the plant can process in its current state; it limits the crude accepted, the rest stays in the feed/tank) and the physical loss (R.physicalLoss, a separate, calibrated fraction of what is processed). Efficiency is never booked as a loss.
      const room = Math.max(0, cap * lim * eff - (s._in || 0)); if (f.r > room + 1e-6 && lim >= 1) s._sat = true; let thr = Math.min(f.r, room); if (thr <= 1e-9) return 0;
      const passF = 1 - (R.physicalLoss || 0);
      const outs = [['GASOLINE', 'GASOLINE_OUT', P.GASOLINE], ['DIESEL', 'DIESEL_OUT', P.DIESEL], ['JET_FUEL', 'JET_OUT', P.JET_FUEL], ['GAS', 'GAS_OUT', P.GAS]];
      let connected = 0; for (const [, port] of outs) if (this.edgeOf(b, port)) connected++; if (!connected) { if (commit) s._noOut = true; return 0; }
      let th = 1; const pOut = Math.max(20, f.p * .6);
      for (const [y, port, prod] of outs) { if (!this.edgeOf(b, port)) continue; const want = thr * R.yields[y] / 100 * passF; if (want > 0) th = Math.min(th, this.offer(b, port, { prod, r: want, p: pOut }, false, vis) / want); }
      if (th <= 1e-9) { if (commit) s._blocked = true; return 0; }
      thr *= th; const consumed = thr;   // the crude actually taken from the feed (all of it is processed; efficiency limited how much was accepted)
      if (commit) {
        for (const [y, port, prod] of outs) { const rate = thr * R.yields[y] / 100 * passF; if (this.edgeOf(b, port)) { const a = this.offer(b, port, { prod, r: rate, p: pOut }, true, vis); s.made[y] += a * this.dt; (s._p = s._p || {})[y] = (s._p[y] || 0) + a; } else if (y === 'GAS') s.flared += rate * this.dt; }
        const oth = thr * R.yields.OTHER / 100 * passF; for (const [k, sh] of Object.entries(R.otherSplit)) { const a = oth * sh; s.made[k] = (s.made[k] || 0) + a * this.dt; (s._p = s._p || {})[k] = (s._p[k] || 0) + a; }
        s.made.OTHER += oth * this.dt; s._p = s._p || {}; s._p.OTHER = (s._p.OTHER || 0) + oth; s._in = (s._in || 0) + consumed; s._inBuy = (s._inBuy || 0) + consumed * (f.bf || 0); s.crude += consumed * this.dt; s._eff = eff; s._temp = temp; s._quality = quality; s._pressF = pressF;
      }
      return consumed;
    }

    /* ---- one step of dt days ---- */
    step(dt) {
      if (this.dirty()) this.build(); this.dt = dt = Math.max(1e-6, dt); const store = this.store; this.time += dt;
      for (const e of this._el) { e.flow = 0; e.over = false; e.lowP = false; e.hiP = false; }
      const items = store.list(); for (const b of items) { const s = this.ensure(b); for (const k in s) if (k.charCodeAt(0) === 95) delete s[k]; const ty = DEFS[b.d].type; if (ty === 'pump' || ty === 'separator' || ty === 'refinery') { s.pIn = 0; if (ty === 'pump') s.pOut = 0; } }
      const fieldGroups = new Map(), sharedWells = [];
      for (const b of items) { if (!this.ok(b)) continue; const def = DEFS[b.d], s = b.s;
        if (def.type === 'well') {
          const fp = (s.shared || b.field) ? fieldProfile(store, b) : null, site = fp ? fp.site : null;
          if (fp && !s.shared) { s.shared = 1; s.nominal = fp.nominal; s.p0 = fp.p0; s.reserve0 = site.initialReserve; }       // a well of an older save: from now on it draws from its field
          if (site) { s.reserve = site.remainingReserve; s.reserve0 = site.initialReserve; }
          const ratio = s.reserve0 ? s.reserve / s.reserve0 : 0; if (s.reserve <= 0) { s.reserve = 0; s._depleted = true; continue; }
          const prr = site && site.pr != null ? site.pr : ratio;        // the reservoir pressure drives the output of a well on a real field; the old reserve ratio stays for the others
          const W = CFG.WELL, wcStart = site ? lerp(W.waterCutStart, site.props.waterCut, WORLDCFG().WELLS.WATER_CUT_WEIGHT) : 0, target0 = s.nominal * (.4 + .6 * prr) * levelOf(b).capacityMultiplier * eco(b), wc = site ? lerp(wcStart, Math.max(wcStart, W.waterCutEnd), 1 - ratio) : lerp(W.waterCutStart, W.waterCutEnd, 1 - ratio), gas = W.gorStart + .05 * (1 - ratio), pr = s.p0 * (.3 + .7 * prr) * levelOf(b).pressureMultiplier;
          let target = target0;
          if (site) {                                                                                     // the field delivers at most its capacity (weaker as it empties), shared by all its wells: more wells = more capacity until the field is full, never more oil
            let g = fieldGroups.get(site.id); if (!g) { g = { need: 0, cap: site.props.capacity * (.4 + .6 * prr), rate: site.remainingReserve / dt }; fieldGroups.set(site.id, g); for (const o of items) { if (o.field !== site.id || DEFS[o.d].type !== 'well' || !this.ok(o)) continue; const os = this.ensure(o), or = site.pr != null ? site.pr : (site.initialReserve ? site.remainingReserve / site.initialReserve : 0); g.need += os.nominal * (.4 + .6 * or) * levelOf(o).capacityMultiplier * eco(o) * (1 - wc - gas); } }
            const scale = g.need > 0 ? Math.min(1, Math.min(g.cap, g.rate) / g.need) : 1; target = target0 * scale;
          }
          s._target = target; s._wc = wc; s._gas = gas; s._p = pr; const ports = def.connections.map(c => c.id); if (!ports.some(id => this.edgeOf(b, id))) { s._noOut = true; continue; }
          let r = Math.min(target, s.reserve / dt / Math.max(1e-6, 1 - wc - gas)); const acc = this.split(b, ports, { prod: P.CRUDE, r, oil: 1 - wc - gas, gas, wat: wc, p: pr }, true, new Set([b.id]));
          const oil = acc * dt * (1 - wc - gas); s._out = acc; s.total += acc * dt;
          if (site) { const took = store.ts.take(site.id, oil); s.reserve = site.remainingReserve; sharedWells.push([s, site]); if (took < oil - 1e-6) s._shortfall = oil - took; }
          else { s.reserve = Math.max(0, s.reserve - oil); if (s.reserve < 0.5) s.reserve = 0; }
        }
      }
      for (const b of items) { if (!this.ok(b)) continue; const def = DEFS[b.d], s = b.s;
        if (def.type === 'tank' || def.type === 'gas') {
          const hasOut = def.connections.some(c => c.role === 'out' && this.edgeOf(b, c.id)); if (!hasOut || s.vol <= 1e-6) continue;
          if (b.rs && !(s.rel > 0)) continue;                                  // a reserve tank never lets oil out by itself: only a release the player ordered (s.rel, stage 2) opens its outlet
          const gasT = def.type === 'gas', cap = def.capacity.value * levelOf(b).capacityMultiplier;
          const maxOut = cap * .5, r = Math.min(s.vol / dt, maxOut, b.rs ? s.rel / dt : Infinity), fill = s.vol / cap, wf = def.product === P.CRUDE && s.vol > 0 ? s.wat / s.vol : 0, press = gasT ? this.gasPressure(def, fill, b) : SIM.tankHeadPsi;
          const bf = (def.product === P.CRUDE || b.rs) && s.vol > 0 ? clamp((s.bv || 0) / s.vol, 0, 1) : 0;                      // the share of the tank's oil that was bought (not produced)
          const acc = this.split(b, def.connections.filter(c => c.role === 'out').map(c => c.id), { prod: def.product, r, oil: 1 - wf, gas: 0, wat: wf, bf, p: Math.max(press, SIM.tankHeadPsi) }, true, new Set([b.id])); s._out = acc;
          const removed = acc * dt; s.wat = Math.max(0, s.wat - removed * wf); s.vol = Math.max(0, s.vol - removed); if (s.bv) s.bv = Math.max(0, s.bv - removed * bf);
          if (b.rs) { s.rel = Math.max(0, s.rel - removed); if (s.rel < 1e-6) s.rel = 0; s.dep = (s.dep || 0) + removed; s.depBv = (s.depBv || 0) + removed * bf; s.depW = (s.depW || 0) + removed * wf; }       // what really left a reserve tank is recorded for the books (settled once per hour by the company)
        }
      }
      for (const [ws, st] of sharedWells) ws.reserve = st.remainingReserve;   // every well of a field shows the reserve that is left after ALL of them have produced
      for (const b of items) { const def = DEFS[b.d], s = b.s;                                         // apply deliveries, derive display values
        if (def.type === 'tank' || def.type === 'gas') { if (s._pend) { s.vol += s._pend; s.total += s._pend; if (def.type === 'tank') s.wat += s._pw || 0; if (s._pbv) s.bv = (s.bv || 0) + s._pbv; if (b.rs) { s.arr = (s.arr || 0) + s._pend; s.arrBv = (s.arrBv || 0) + (s._pbv || 0); s.arrW = (s.arrW || 0) + (def.type === 'tank' ? s._pw || 0 : 0); } } const cap = def.capacity.value; s.vol = Math.min(s.vol, cap); if (s.bv) s.bv = Math.min(s.bv, s.vol); const fill = s.vol / cap;
          if (def.type === 'gas') { s.press = this.gasPressure(def, fill, b); s.temp = SAFE.ambientC + .08 * s.press + 8 * fill; } else s.temp = SAFE.ambientC + 6 * Math.min(1, (s._in || 0) / cap * 4); }
        if (def.type === 'refinery') { s.eff = s._eff == null ? s.eff * .8 : s._eff; s.temp = s._temp == null ? Math.max(60, s.temp - 40 * dt * 10) : s._temp; }
        if (def.type === 'pump') s.power = (s._in || 0) * (s.boost * s.eff) * 0.01269 / 1000 / Math.max(.01, s.eff);
      }
      for (const e of this._el) if (e.line) { e.line.flow = e.flow; e.line.over = e.over; e.line.lowP = e.lowP; e.line.hiP = e.hiP; e.line.pressure = e.p || 0; }
      this.lastStep = dt;
    }
    run(days, h) { h = h || 0.05; for (let t = 0; t < days - 1e-9; t += h) this.step(Math.min(h, days - t)); }
    gasPressure(def, fill, b) { const mx = def.params.maxPressure * levelOf(b).pressureMultiplier; return 15 + (mx - 15) * Math.pow(clamp(fill, 0, 1.2), 1.3); }

    /* ---- status, warnings, indicators (what the panel shows) ---- */
    /* What a crude tank IS, from where its oil can come from (not from the mere presence of a pipe):
     *   COMMERCIAL  no pipe at all: stores bought or moved oil, never receives well oil
     *   PRODUCTION  at least one well sits upstream of it (through pipes, pumps, junctions, valves, separators or other tanks)
     *   TRADE       connected by pipes, but no well is upstream: it belongs to a transport / trade network (bought oil, moving to a refinery or onward)
     * Product tanks and gas storage have no kind (null). */
    tankKind(b) {
      const def = DEFS[b.d]; if (!def || def.type !== 'tank' || def.product !== P.CRUDE) return null; if (b.rs) return 'RESERVE'; if (this.dirty()) this.build();
      let any = false, hasIn = false; for (const c of def.connections) if (this.edgeOf(b, c.id)) { any = true; if (c.role !== 'out') hasIn = true; }
      if (!any) return 'COMMERCIAL'; if (!hasIn) return 'TRADE';
      return this._wellUpstream(b, null, new Set([b.id])) ? 'PRODUCTION' : 'TRADE';
    }
    _wellUpstream(b, cameBy, seen) {
      const def = DEFS[b.d]; for (const c of def.connections) { if (c.id === cameBy || c.role === 'out') continue; const e = this.edgeOf(b, c.id); if (!e) continue; const far = this.other(e, b, c.id), fb = far.b; if (!fb || seen.has(fb.id)) continue; seen.add(fb.id);
        const t = DEFS[fb.d].type; if (t === 'well') return true; if (t === 'refinery') continue; if (this._wellUpstream(fb, far.port, seen)) return true; }
      return false;
    }
    status(b) {
      if (b.st === 'UNDER_CONSTRUCTION') return 'UNDER_CONSTRUCTION'; if (b.st === 'MAINTENANCE' || b.st === 'DAMAGED') return b.st; const def = DEFS[b.d], s = this.ensure(b), t = def.type; if (this.dirty()) this.build();
      const has = id => !!this.edgeOf(b, id), ins = def.connections.filter(c => c.role !== 'out' && !c.reserved).map(c => c.id), outs = def.connections.filter(c => c.role !== 'in' && !c.reserved).map(c => c.id);
      const hasIn = ins.some(has), hasOut = outs.some(has), cap = def.capacity.value;
      if (t === 'well') { if (s.reserve <= 0) return 'DEPLETED'; if (!hasOut) return 'NO_OUTPUT'; if (s._out > 0) return s._out < s._target * .98 ? 'BLOCKED' : 'RUNNING'; return 'BLOCKED'; }
      if (t === 'pump') { if (!hasIn) return 'NO_INPUT'; if (!hasOut) return 'NO_OUTPUT'; if (s._lowIn) return 'LOW_PRESSURE'; if ((s._in || 0) > 0 && s.pOut > 3000) return 'HIGH_PRESSURE'; if (s._sat) return 'OVER_CAPACITY'; return (s._in || 0) > 0 ? 'RUNNING' : 'READY'; }
      if (t === 'valve') { if (s.mode === 'FAULT') return 'DAMAGED'; if (s.mode === 'CLOSED') return 'OFFLINE'; return (s._in || 0) > 0 ? 'RUNNING' : 'READY'; }
      if (t === 'junction') { if (s._sat) return 'OVER_CAPACITY'; if (s._hiP) return 'HIGH_PRESSURE'; return (s._in || 0) > 0 ? 'RUNNING' : 'READY'; }
      if (t === 'tank' || t === 'gas') { if (s._badProduct) return 'BLOCKED'; return ((s._in || 0) > 0 || (s._out || 0) > 0) ? 'RUNNING' : 'READY'; }
      if (t === 'separator' || t === 'refinery') {
        if (!hasIn) return 'NO_INPUT'; if (t === 'refinery' ? !outs.some(has) : !has('OIL_OUT')) return 'NO_OUTPUT'; if (s._lowIn) return 'LOW_PRESSURE'; if (s._blocked) return 'BLOCKED';
        if (s._sat && (s._in || 0) > 0) return 'OVER_CAPACITY'; if ((s._in || 0) > 0) return (s.pIn != null && s.pIn < CFG.REFINERY.minInletPsi && t === 'refinery') ? 'LOW_PRESSURE' : 'RUNNING'; return (s._off || 0) > 0 ? ((t === 'refinery' && s.matLim != null && s.matLim <= 0 && clamp(s.opLimit, 0, 1) > 0) ? 'NO_MATERIALS' : 'NO_INPUT') : 'READY';   /* oil is offered but none is taken: with no chemicals / operating materials in stock say so, instead of "no oil reaches it" */
      }
      return 'READY';
    }
    warnings(b) {
      const def = DEFS[b.d], s = this.ensure(b), w = [];
      if (def.type === 'tank' || def.type === 'gas') { const fill = s.vol / def.capacity.value; if (fill >= SAFE.tankFull - 1e-6) w.push('FULL'); else if (fill > SAFE.tankNearFull) w.push('NEAR_FULL'); if (s.temp > SAFE.gasHighTempC) w.push('HIGH_TEMPERATURE');
        if (def.type === 'gas') { const pr = (s.press || 15) / def.params.maxPressure; if (pr >= SAFE.gasHighPressure) w.push('HIGH_PRESSURE'); } }
      if (s._sat && (def.type === 'pump' || def.type === 'separator' || def.type === 'junction' || def.type === 'refinery')) w.push('OVER_CAPACITY');
      if (s._hiP || (def.type === 'pump' && s.pOut > 3000)) w.push('HIGH_PRESSURE'); if (s._lowIn) w.push('LOW_PRESSURE'); return [...new Set(w)];
    }
    gasSafetyOf(b) { const def = DEFS[b.d], s = this.ensure(b), fill = s.vol / def.capacity.value; return gasSafety(fill, (s.press || 15) / def.params.maxPressure, s.temp || SAFE.ambientC); }
    levelStateOf(b) { const def = DEFS[b.d], s = this.ensure(b); return tankLevel(s.vol / def.capacity.value); }
    /* indicators: [{k, v, u, warn?}]; `top` = how many (3..6) to show on the compact card */
    indicators(b) {
      const def = DEFS[b.d], s = this.ensure(b), t = def.type, st = this.status(b), r0 = (v, d) => Math.round(v * (d || 1)) / (d || 1), I = (k, v, u, o) => Object.assign({ k, v, u: u || '' }, o || {}), cap = def.capacity.value;
      const common = [I('Status', st.replace(/_/g, ' ').toLowerCase())];
      if (t === 'well') { const ratio = s.reserve0 ? s.reserve / s.reserve0 : 0; return { top: 5, list: [I('Production', r0(s._out || 0), 'bbl/day'), I('Pressure', r0(s._p != null ? s._p : s.p0 * (.3 + .7 * ratio)), 'psi'), I('Reservoir Pressure', r0(((this.store.ts && b.field && this.store.ts.site && this.store.ts.site(b.field) || {}).pr == null ? 1 : this.store.ts.site(b.field).pr) * 100), '%'), I('Remaining Reserve', r0(s.reserve), 'bbl'), I('Water Cut', r0((s._wc != null ? s._wc : CFG.WELL.waterCutStart) * 100, 10), '%'), I('Gas', r0((s._out || 0) * (s._gas || CFG.WELL.gorStart)), 'boe/day'), I('Efficiency', r0(s._target ? (s._out || 0) / s._target * 100 : 0), '%')].concat(common) }; }
      if (t === 'pump') { const util = (s._in || 0) / def.params.maxFlow * 100; return { top: 6, list: [I('Flow In', r0(s._in || 0), 'bbl/day'), I('Flow Out', r0(s._in || 0), 'bbl/day'), I('Pressure In', r0(s.pIn || 0), 'psi'), I('Pressure Out', r0(s.pOut || s.pIn || 0), 'psi'), I('Boost', r0(s.boost * s.eff), 'psi'), I('Power', r0(s.power || 0, 10), 'kW')].concat([I('Efficiency', r0(s.eff * 100), '%'), I('Utilization', r0(util), '%')], common) }; }
      if (t === 'valve') return { top: 4, list: [I('Valve State', s.mode + (s.mode === 'PARTIAL' ? ' ' + Math.round(s.opening * 100) + '%' : '')), I('Opening', Math.round((s.mode === 'OPEN' ? 1 : s.mode === 'PARTIAL' ? s.opening : 0) * 100), '%'), I('Flow', r0(s._in || 0), 'bbl/day'), I('Max Flow', def.params.maxFlow, 'bbl/day'), I('Pressure Rating', def.params.pressureRating, 'psi')].concat(common) };
      if (t === 'junction' && def.family === 'MANIFOLD') { const used = role => def.connections.filter(c => c.role === role && this.edgeOf(b, c.id)).length, fl = def.connections.filter(c => c.role === 'out').map(c => { const e = this.edgeOf(b, c.id); return e ? e.flow : 0; }); return { top: 8, list: [I('Flow', r0(s._in || 0), 'bbl/day'), I('Max Total Flow', def.params.maxTotalFlow, 'bbl/day'), I('Inputs Connected', used('in') + ' / ' + def.params.inputs), I('Outputs Connected', used('out') + ' / ' + def.params.outputs), I('Output 1 Flow', r0(fl[0]), 'bbl/day'), I('Output 2 Flow', r0(fl[1]), 'bbl/day'), I('Output 3 Flow', r0(fl[2]), 'bbl/day'), I('Pressure Limit', def.params.pressureLimit, 'psi')].concat(common) }; }
      if (t === 'junction') return { top: 4, list: [I('Flow', r0(s._in || 0), 'bbl/day'), I('Max Total Flow', def.params.maxTotalFlow, 'bbl/day'), I('Pressure Limit', def.params.pressureLimit, 'psi'), I('Ports', 4)].concat(common) };
      if (t === 'tank') { const fill = s.vol / cap; return { top: 6, list: [I('Level', r0(s.vol), 'bbl'), I('Capacity', cap, 'bbl'), I('Fill', r0(fill * 100, 10), '%'), I('Input Flow', r0(s._in || 0), 'bbl/day'), I('Output Flow', r0(s._out || 0), 'bbl/day'), I('Available Capacity', r0(cap - s.vol), 'bbl')].concat(def.product === P.CRUDE ? [I('Tank Type', TANK_KIND_AR[this.tankKind(b)] || ''), I('Purchased Oil', r0(s.bv || 0), 'bbl'), I('Produced Oil', r0(Math.max(0, s.vol - (s.bv || 0) - (s.wat || 0))), 'bbl')] : []).concat([I('Pressure', 14.7, 'psi'), I('Temperature', r0(s.temp, 10), '°C'), I('Level State', tankLevel(fill).replace(/_/g, ' ').toLowerCase())], common) }; }
      if (t === 'gas') { const fill = s.vol / cap; return { top: 6, list: [I('Current Level', r0(s.vol), 'boe'), I('Gas Capacity', cap, 'boe'), I('Fill', r0(fill * 100, 10), '%'), I('Pressure', r0(s.press || 15), 'psi'), I('Temperature', r0(s.temp, 10), '°C'), I('Safety', this.gasSafetyOf(b).replace(/_/g, ' ').toLowerCase())].concat([I('Max Pressure', def.params.maxPressure, 'psi'), I('Input', r0(s._in || 0), 'boe/day'), I('Output', r0(s._out || 0), 'boe/day')], common) }; }
      if (t === 'separator') return { top: 6, list: [I('Feed In', r0(s._in || 0), 'bbl/day'), I('Oil Out', r0(s._o || 0), 'bbl/day'), I('Gas Out', r0(s._g || 0), 'boe/day'), I('Water Out', r0(s._w || 0), 'bbl/day'), I('Utilization', r0((s._in || 0) / def.params.cap * 100), '%'), I('Capacity', def.params.cap, 'bbl/day')].concat(common) };
      if (t === 'refinery') { const p = s._p || {}; return { top: 6, list: [I('Feed', r0(s._in || 0), 'bbl/day'), I('Throughput', r0(s._in || 0), 'bbl/day'), I('Gasoline', r0(p.GASOLINE || 0), 'bbl/day'), I('Diesel', r0(p.DIESEL || 0), 'bbl/day'), I('Jet Fuel', r0(p.JET_FUEL || 0), 'bbl/day'), I('Efficiency', r0((s.eff || 0) * 100), '%')].concat([I('Gas / LPG', r0(p.GAS || 0), 'boe/day'), I('Other', r0(p.OTHER || 0), 'bbl/day'), I('Utilization', r0((s._in || 0) / def.params.cap * 100), '%'), I('Capacity', def.params.cap, 'bbl/day'), I('Temperature', r0(s.temp || 0), '°C')], common) }; }
      return { top: 3, list: common };
    }
    pipeInfo(x, y) {
      const L = this.net.lineAt(x, y); if (!L) return null; const sp = lineSpec(L); return { id: L.id, product: L.product === ANY ? 'unassigned' : L.product, diameter: L.dia, length: sp.length, capacity: sp.capacity, maxPressure: sp.maxPressure, currentFlow: Math.round(L.flow || 0), pressure: Math.round(L.pressure || 0), status: L.over ? 'OVER_CAPACITY' : L.hiP ? 'HIGH_PRESSURE' : L.lowP ? 'LOW_PRESSURE' : (L.flow || 0) > 0 ? 'RUNNING' : 'READY' };
    }
    /* valve control */
    setValve(b, mode, opening) { const s = this.ensure(b); if (!['OPEN', 'CLOSED', 'PARTIAL', 'FAULT'].includes(mode)) return false; s.mode = mode; if (opening != null) s.opening = clamp(opening, 0, 1); return true; }
  }

  const TANK_KIND_AR = { COMMERCIAL: 'تخزين تجاري (غير موصول)', PRODUCTION: 'مخزن إنتاج (موصول بالآبار)', TRADE: 'مخزن تجارة ونقل' };
  return { TANK_KIND_AR, PipeNet, Sim, wellProfile, priceOf, planPipe, layPipe, planOpenPipe, layOpenPipe, planClosePipe, closePipe, planConnect, layConnect, setLineOpen, partnerOf, removeConnection, reaches, insertJunction, branchTo, autoDia, portsOf, canSend, canTake, route, networkProducts, lineSpec, tankLevel, gasSafety, levelOf, ANY, pk };
});
