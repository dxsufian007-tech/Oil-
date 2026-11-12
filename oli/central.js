/* Oli - central.js : the CENTRAL HYBRID PIPELINE NETWORK (pure logic, no DOM).
 *
 *  One grey shell, six completely separate channels (CRUDE, WATER, GASOLINE, DIESEL, JET_FUEL, GAS).  Each channel has its own capacity, pressure, flow, direction, quantity, operating state and fault state.
 *  The network is an ADDITIONAL pipe type living next to PipeNet (industry.js keeps every old pipe untouched): the trunk is a graph of STATIONS joined by SEGMENTS (main lines, closed loops, F1 coastal links).
 *  A station is a building ('central_station', six product-locked ports, one per channel); the player's branches are ordinary PipeNet lines from a station port to a facility port.
 *
 *  Flow (one Sim step, per channel, per offer):  a source pushes into a station port  ->  deliver() finds the other stations that have a branch on the same channel, probes what each can take
 *  (path capacity left in this step, pressure after friction and pump boosts, the receiving device's own rule), shares the real quantity out by water-filling, and commits it path by path.
 *  Capacity is a residual per segment per channel per step (the sum of |flows| never exceeds it), a closed/faulted segment is skipped so loops carry the flow when they can, and every unit that
 *  leaves the source arrives at exactly one destination (no double counting, nothing invented, no losses other than the pressure the existing engine already models).
 *  Values come from the existing engine: capacity/max pressure/friction of the 36" class (CFG.PIPES[36]), friction constants CFG.SIM, pump = CFG.PUMP.C. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./building-config.js'));
  else root.OliCentral = factory(root.OliBuildingConfig);
})(typeof self !== 'undefined' ? self : this, function (CFG) {
  'use strict';
  const CHANNELS = ['CRUDE', 'WATER', 'GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS'];
  const CLASS = CFG.PIPES[36], SIM = CFG.SIM, PU = CFG.PUMP.C, TILE_M = CFG.TILE_METERS;
  const PORT = {}, PORTS = {}, CH_OF_PORT = {}; for (const c of CHANNELS) { PORT[c] = c + '_PORT'; PORTS[c] = [c + '_PORT', c + '_PORT2']; for (const p of PORTS[c]) CH_OF_PORT[p] = c; }       // every channel has TWO ports on a station (on different sides), so a trunk arm that blocks one never blocks the channel
  const COLOR = { CRUDE: '#4a3a2c', WATER: CFG.PRODUCT_COLOR.WATER, GASOLINE: CFG.PRODUCT_COLOR.GASOLINE, DIESEL: CFG.PRODUCT_COLOR.DIESEL, JET_FUEL: '#4aa3ff', GAS: CFG.PRODUCT_COLOR.GAS };
  const TILE_COST = CLASS.cost * CHANNELS.length;                    // one tile of shell = one tile of each of the six 36" channels
  const BORE_BBL = Math.PI * Math.pow(36 * 0.0254 / 2, 2) * TILE_M * 6.28981;   // barrels in one tile of a 36" channel (real geometry of the existing pipe class)
  const lerp = (a, b, t) => a + (b - a) * t;
  const hash = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + (c || 0) * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const EPS = 1e-6;
  const H_D = [], H_S = [], H_N = [];      // B5 scratch heap for _pathCore (never held across a call)
  const PH_U = [], PH_P = [];      // B3a scratch for _planHops (never held across a call)
  const NCH = CHANNELS.length, CI = Object.create(null); CHANNELS.forEach((c, i) => { CI[c] = i; });      // perf: a number per channel, so the per-step usage lives in typed arrays instead of string-keyed Maps

  class CentralNet {
    constructor(W) {
      this.W = W; this.st = new Map(); this.seg = new Map(); this.pumps = new Map(); this.at = new Map(); this.cen = new Set(); this.cov = new Set(); this.rev = 0; this.nextSt = 1; this.nextSeg = 1; this.nextPump = 1; this.time = 0;
      this.ch = {}; for (const c of CHANNELS) this.ch[c] = { state: 'OPEN', flow: 0, pressure: 0, qty: 0, moved: 0, dir: 0, fault: false, cap: CLASS.capacity, maxP: CLASS.maxPressure, status: 'READY' };
      this._used = null; this._net = null; this._adj = null; this._adjRev = -1; this._pused = new Map(); this._six = new Map(); this._usedX = null; this._netX = null; this.pcMode = 0; this.pcStats = null; this._pcA = [null, null, null, null, null, null]; this._pcB = [null, null, null, null, null, null]; this._pcX = -1; this._plE = 0; this._plV = [0, 0, 0, 0, 0, 0]; this._plM = [null, null, null, null, null, null]; this._plRev = -1; this.plStats = { calls: 0, hit: 0, miss: 0, bypass: 0, verified: 0, mismatch: 0 }; this._pcRev = -1; this._pcK = -1; this._pcCi = -1; this._pxCh = null; this._pxRev = -1; this._pxN = -1; if (CentralNet.pcDefault) this.pcMode = CentralNet.pcDefault;
    }
    static k(W, x, y) { return y * W + x; }
    key(x, y) { return y * this.W + x; }

    /* ---------------------------------------------------------------- building the graph */
    addStation(o) { const id = o.id || ('T' + this.nextSt++); const s = { id, x: o.x, y: o.y, sec: o.sec || null, b: o.b == null ? null : o.b, tile: o.tile || null, tapped: !!o.tapped }; this.st.set(id, s); this.rev++; return s; }
    addSeg(o) {
      const id = o.id || ('S' + this.nextSeg++); const path = o.path.map(p => [p[0], p[1]]);
      const g = { id, kind: o.kind || 'main', a: o.a, b: o.b, path, fault: {}, f: {} }; for (const c of CHANNELS) g.f[c] = { flow: 0, net: 0, p: 0 };
      if (o.fault) for (const c in o.fault) if (o.fault[c]) g.fault[c] = true; if (this.pcMode) Object.freeze(g.fault);
      this.seg.set(id, g); for (const [x, y] of path) { const k = this.key(x, y); if (this.cov.has(k)) continue; this.cen.add(k); if (!this.at.has(k)) this.at.set(k, id); }       // the tiles under a station footprint are not pipe tiles
      this.rev++; return g;
    }
    /* trim the pipe tiles that lie inside a station footprint (the pipe enters the station there) */
    claimFootprint(stId, cells) { for (const [x, y] of cells) { const k = this.key(x, y); this.cen.delete(k); this.at.delete(k); this.cov.add(k); }       // the tile stays in the segment path (geometry), only the occupancy goes
      const s = this.st.get(stId); if (s) s.cells = cells; this.rev++; }
    addPump(o) {
      const id = o.id || ('P' + this.nextPump++); const st = this.st.get(o.st); const u = hash(st.x, st.y, 7 + CHANNELS.indexOf(o.ch));
      let seg = o.seg; if (!seg || !this.seg.has(seg)) { const cand = this.segsOf(o.st).sort((a, b) => (a.kind === 'main' ? 0 : 1) - (b.kind === 'main' ? 0 : 1)); seg = cand.length ? cand[0].id : null; }      // a pump sits on ONE segment of its station (the pipe it pushes into / pulls from)
      const p = { id, st: o.st, ch: o.ch, seg, dir: o.dir === -1 ? -1 : 1, boost: o.boost != null ? o.boost : Math.round(lerp(PU.boost[0], PU.boost[1], u)), eff: o.eff != null ? o.eff : +lerp(PU.eff[0], PU.eff[1], hash(st.x, st.y, 8 + CHANNELS.indexOf(o.ch))).toFixed(3), fault: !!o.fault, flow: 0, pIn: 0, pOut: 0, lowIn: false };
      this.pumps.set(id, p); this.rev++; return p;
    }
    stOf(buildingId) { if (!this._byB || this._byBRev !== this.rev) { this._byB = new Map(); for (const s of this.st.values()) if (s.b != null) this._byB.set(s.b, s); this._byBRev = this.rev; } return this._byB.get(buildingId) || null; }
    pumpAt(stId, ch) { for (const p of this.pumps.values()) if (p.st === stId && p.ch === ch) return p; return null; }
    segsOf(stId) { const o = []; for (const g of this.seg.values()) if (g.a === stId || g.b === stId) o.push(g); return o; }

    /* ---------------------------------------------------------------- free tap: insert a NEW station into a segment at tile index i (the engine-side mechanical connection) */
    tapPoint(x, y) { const sid = this.at.get(this.key(x, y)); if (!sid) return null; const g = this.seg.get(sid); const i = g.path.findIndex(p => p[0] === x && p[1] === y); if (i <= 0 || i >= g.path.length - 1) return { seg: g, i, atEnd: true }; return { seg: g, i }; }
    tap(x, y, opts) {
      opts = opts || {}; const tp = this.tapPoint(x, y); if (!tp) return { ok: false, reason: 'notOnCentral' };
      if (tp.atEnd) { const sid = tp.i <= 0 ? tp.seg.a : tp.seg.b; return { ok: true, station: this.st.get(sid), existing: true }; }
      const g = tp.seg, i = tp.i; const st = this.addStation({ x, y, b: opts.b == null ? null : opts.b, tapped: true, tile: [x, y], sec: opts.sec });
      const p1 = g.path.slice(0, i + 1), p2 = g.path.slice(i), old = { a: g.a, b: g.b };
      for (const [px, py] of g.path) this.at.delete(this.key(px, py)); this.seg.delete(g.id);
      const A = this.addSeg({ id: g.id + 'a', kind: g.kind, a: old.a, b: st.id, path: p1, fault: g.fault }), Bs = this.addSeg({ id: g.id + 'b', kind: g.kind, a: st.id, b: old.b, path: p2, fault: g.fault });
      for (const p of this.pumps.values()) if (p.seg === g.id) p.seg = p.st === old.a ? A.id : Bs.id;      // a pump stays on the half next to its own station (the orientation a→b of the halves is the old one, so its direction is unchanged)
      // flags of the old segment are inherited by both halves
      return { ok: true, station: st, segs: [A, Bs] };
    }

    /* ---------------------------------------------------------------- faults and states (player / test controls) */
    setFault(segId, ch, on) { const g = this.seg.get(segId); if (!g) return false; const F = this.pcMode ? Object.assign({}, g.fault) : g.fault; if (ch == null) for (const c of CHANNELS) { if (on) F[c] = true; else delete F[c]; } else if (on) F[ch] = true; else delete F[ch]; if (this.pcMode) g.fault = Object.freeze(F); this.rev++; return true; }      // path cache on: a segment's fault object is frozen and only replaced here (with rev++), so a stale cached path cannot come from an in-place write
    /* Forward (+1) pushes product along the pump's segment from its end a to its end b, Reverse (-1) from b to a: suction and discharge swap sides */
    setPumpDir(id, dir) { const p = this.pumps.get(id); if (!p || (dir !== 1 && dir !== -1)) return false; const g = this.seg.get(p.seg); if (!g || (g.a !== p.st && g.b !== p.st)) return false; p.dir = dir; this.rev++; return true; }
    pumpsOn(g, ch) { const o = []; for (const p of this.pumps.values()) if (p.seg === g.id && p.ch === ch) o.push(p); return o; }
    setPumpFault(id, on) { const p = this.pumps.get(id); if (!p) return false; p.fault = !!on; this._plE++; return true; }
    setChannel(ch, state) { const c = this.ch[ch]; if (!c || !['OPEN', 'CLOSED'].includes(state)) return false; c.state = state; return true; }
    setChannelFault(ch, on) { const c = this.ch[ch]; if (!c) return false; c.fault = !!on; return true; }

    /* ---------------------------------------------------------------- routing */
    _graph() {
      if (this._adjRev === this.rev && this._adj) return this._adj;
      const adj = new Map(), nix = new Map(), nid = [], A = []; for (const s of this.st.keys()) { const l = []; adj.set(s, l); nix.set(s, nid.length); nid.push(s); A.push(l); }
      for (const g of this.seg.values()) { if (!adj.has(g.a) || !adj.has(g.b)) continue; const ix = this._ixOf(g.id); adj.get(g.a).push({ g, to: g.b, dir: 1, ix, tn: nix.get(g.b) }); adj.get(g.b).push({ g, to: g.a, dir: -1, ix, tn: nix.get(g.a) }); }
      const N = nid.length; this._nix = nix; this._nid = nid; this._adjA = A; this._pd = new Float64Array(N); this._pe = new Array(N).fill(null); this._pn = new Int32Array(N); this._pdone = new Uint8Array(N);          // perf: station numbers + scratch arrays for path(), rebuilt with the graph
      this._adj = adj; this._adjRev = this.rev; return adj;
    }
    /* perf: a number per segment id, stable for the life of the net (an id keeps its slot even when the segment is removed, as the old string keys kept their values); the usage arrays grow with it */
    _ixOf(gid) {
      let i = this._six.get(gid);
      if (i === undefined) { i = this._six.size; this._six.set(gid, i); const need = (i + 1) * NCH; if (this._used && this._used.length < need) { const grow = a => { const b = new Float64Array(Math.max(need, a.length * 2)); b.set(a); return b; }; this._used = grow(this._used); this._net = grow(this._net); } }
      return i;
    }
    usedOf(over, gid, ch) { const ix = this._six.get(gid), ci = CI[ch]; const u = ci === undefined ? ((this._usedX && this._usedX.get(gid + '|' + ch)) || 0) : ix === undefined ? 0 : (this._used[ix * NCH + ci] || 0); return u + (over && over.size ? (over.get(gid + '|' + ch) || 0) : 0); }      // a channel that is not one of the six (the game never asks for one) keeps the old string-keyed Map, so even that case is identical to before
    pusedOf(over, pid) { return (this._pused.get(pid) || 0) + (over && over.size ? (over.get('P' + pid) || 0) : 0); }
    /* the channel can carry nothing when it is closed or in fault */
    channelUp(ch) { const c = this.ch[ch]; return !!c && c.state === 'OPEN' && !c.fault; }
    segUp(g, ch) { return !g.fault[ch]; }
    /* Dijkstra by tile length over the segments that are up and still have capacity left in this step */
    path(ch, from, to, over, ban, bias) {
      const m = this.pcMode;
      if (m === 0) return this._pathCore(ch, from, to, over, ban, bias);                  // cache off (the default): exactly the B1 path
      if (m === 2) { const got = this._pcLookup(ch, from, to, over, ban, bias); if (got !== undefined) return got; const r = this._pathCore(ch, from, to, over, ban, bias); this._pcStore(r); return r; }      // cache on: a plain call answered from the cache when its entry is still valid
      const res = this._pathCore(ch, from, to, over, ban, bias); this._pcShadow(ch, from, to, over, ban, bias, res); return res;      // shadow: compare only
    }
    /* 0 = off (instant return to the plain computation), 1 = shadow (compare only), 2 = on.  Changing the mode empties the cache and resets its counters. */
    setCacheMode(m) {
      m = m === 2 ? 2 : m === 1 ? 1 : 0; this.pcMode = m; this._plE++; this._plM = [null, null, null, null, null, null]; this.pcStats = null; for (let i = 0; i < NCH; i++) { this._pcA[i] = null; this._pcB[i] = null; } this._pcRev = -1;
      for (const g of this.seg.values()) { if (m) { if (!Object.isFrozen(g.fault)) Object.freeze(g.fault); } else if (Object.isFrozen(g.fault)) g.fault = Object.assign({}, g.fault); }
      return m;
    }
    _pathCore(ch, from, to, over, ban, bias) {
      this._graph(); const nix = this._nix, fi = nix.get(from), ti = nix.get(to); if (fi === undefined || ti === undefined || from === to) return null;
      const A = this._adjA, N = A.length, ci = CI[ch], U = this._used, hasOver = !!(over && over.size), dist = this._pd, prevE = this._pe, prevN = this._pn, done = this._pdone;
      dist.fill(Infinity, 0, N); prevE.fill(null, 0, N); done.fill(0, 0, N); dist[fi] = 0;
      /* B5: binary heap ordered by (distance, insertion number).  The old array queue took the FIRST minimum in insertion order, i.e. the smallest (distance, insertion number) pair, so the pop order, the ties and the stale entries are exactly the same. */
      const HD = H_D, HS = H_S, HN = H_N; let hl = 0, seq = 0;
      HD[0] = 0; HS[0] = seq++; HN[0] = fi; hl = 1;
      while (hl > 0) {
        const d = HD[0], n = HN[0]; hl--;
        if (hl > 0) { const xd = HD[hl], xs = HS[hl], xn = HN[hl]; let i = 0; for (;;) { let c = 2 * i + 1; if (c >= hl) break; const r = c + 1; if (r < hl && (HD[r] < HD[c] || (HD[r] === HD[c] && HS[r] < HS[c]))) c = r; if (HD[c] < xd || (HD[c] === xd && HS[c] < xs)) { HD[i] = HD[c]; HS[i] = HS[c]; HN[i] = HN[c]; i = c; } else break; } HD[i] = xd; HS[i] = xs; HN[i] = xn; }
        if (done[n]) continue; done[n] = 1; if (n === ti) break;
        const es = A[n]; for (let k = 0; k < es.length; k++) { const e = es[k]; if (!this.segUp(e.g, ch) || (ban && ban.has(e.g.id))) continue; let used = ci === undefined ? ((this._usedX && this._usedX.get(e.g.id + '|' + ch)) || 0) : (U[e.ix * NCH + ci] || 0); if (hasOver) used += (over.get(e.g.id + '|' + ch) || 0); if (CLASS.capacity - used <= EPS) continue; const nd = d + e.g.path.length * (bias && this._hopPump({ g: e.g, dir: e.dir }, ch) ? 0.25 : 1); if (nd < dist[e.tn]) { dist[e.tn] = nd; prevE[e.tn] = e; prevN[e.tn] = n; const sq = seq++; let i = hl++; while (i > 0) { const pa = (i - 1) >> 1; if (HD[pa] > nd || (HD[pa] === nd && HS[pa] > sq)) { HD[i] = HD[pa]; HS[i] = HS[pa]; HN[i] = HN[pa]; i = pa; } else break; } HD[i] = nd; HS[i] = sq; HN[i] = e.tn; } }
      }
      if (prevE[ti] === null) return null; const hops = []; let c = ti; while (c !== fi) { const e = prevE[c], pn = prevN[c]; hops.unshift({ g: e.g, dir: e.dir, from: this._nid[pn], to: this._nid[c] }); c = pn; } return hops;
    }
    /* ---- B2 shadow cache (pcMode 1 = compare only; nothing is ever answered from it).
     * A cached path is valid while: the graph is the same (rev: stations, segments, pumps, faults and pump directions all bump it), nothing in this step has made a segment of the channel
     * saturated / free (_apply watches the capacity test of every hop it loads), and the call is the plain one (no ban, no bias, no `over`).  begin() starts a clean step. */
    _pcNewStats() { return { calls: 0, nonChannel: 0, ban: 0, bias: 0, over: 0, cacheable: 0, lookupHit: 0, miss: 0, verified: 0, mismatch: 0, first: [], clears: { begin: 0, rev: 0, fault: 0 }, invalSat: 0, entries: 0, tamper: 0 }; }
    _pcClearAll(why) { for (let i = 0; i < NCH; i++) { this._pcA[i] = null; this._pcB[i] = null; } (this.pcStats || (this.pcStats = this._pcNewStats())).clears[why]++; }
    /* the cached answer for this exact call: undefined = unknown (miss or not cacheable), null = cached "no path", an array = the cached hops */
    _pcLookup(ch, from, to, over, ban, bias) {
      const st = this.pcStats || (this.pcStats = this._pcNewStats()); st.calls++; this._pcK = -1;
      const ci = CI[ch]; if (ci === undefined) return void (st.nonChannel++); this._pcX = -1;
      /* B4: the searches plan() makes when the shortest path cannot carry everything - the route that uses the pumps (bias) and one route per segment of the first path that avoids it (ban, exactly one segment) - are cached too, in their own key space (this._pcB), and an `over` that does not change the capacity predicate of any segment gives the same answer as no `over` (the search only ever asks "is capacity - used <= EPS", never for the value).  Same invalidation as the plain entries. */
      let sub = 0; if (ban) { if (bias || ban.size !== 1) return void (st.ban++); sub = -1; } else if (bias) sub = 1;
      if (over && over.size && !this._overKeepsPredicate(over)) return void (st.over++);
      if (sub !== 0) { this._graph(); const fi = this._nix.get(from), ti = this._nix.get(to); if (fi === undefined || ti === undefined || from === to) return undefined; if (sub === -1) { let id; for (const x of ban) id = x; const bx = this._six.get(id); if (bx === undefined) return void (st.ban++); sub = bx + 2; }
        st.cacheable++; if (this._pcRev !== this.rev) { this._pcClearAll('rev'); this._pcRev = this.rev; } let m = this._pcB[ci]; if (!m) m = this._pcB[ci] = new Map(); const kx = (fi * this._adjA.length + ti) * (this._six.size + 3) + sub; this._pcX = kx; this._pcCi = ci; const e = m.get(kx); if (e === undefined) { st.miss++; return undefined; } st.lookupHit++; return e === 0 ? null : e; }
      this._graph(); const fi = this._nix.get(from), ti = this._nix.get(to); if (fi === undefined || ti === undefined || from === to) return undefined;
      st.cacheable++; if (this._pcRev !== this.rev) { this._pcClearAll('rev'); this._pcRev = this.rev; }
      const N = this._adjA.length; let a = this._pcA[ci]; if (!a) a = this._pcA[ci] = new Array(N * N); const k = fi * N + ti; this._pcCi = ci; this._pcK = k;
      const e = a[k]; if (e === undefined) { st.miss++; return undefined; } st.lookupHit++; return e === 0 ? null : e;
    }
    _pcStore(res) { if (this._pcX >= 0) { const kx = this._pcX; this._pcX = -1; if (this.pcMode === 2 && res) { for (const h of res) Object.freeze(h); Object.freeze(res); } const m = this._pcB[this._pcCi]; if (m && !m.has(kx)) { m.set(kx, res === null ? 0 : res); this.pcStats.entries++; } return; } if (this._pcK < 0) return; if (this.pcMode === 2 && res) { for (const h of res) Object.freeze(h); Object.freeze(res); } const a = this._pcA[this._pcCi]; if (a && a[this._pcK] === undefined) { a[this._pcK] = res === null ? 0 : res; this.pcStats.entries++; } }
    /* B4: true when `over` leaves the capacity predicate (capacity - used <= EPS) of every segment it mentions as it is without `over` (the other segments are not mentioned, so they cannot differ); a pump key ('P' + id, no '|') or a key of a segment that is not indexed / a channel that is not one of the six answers "no" or is skipped exactly as in the old code path */
    _overKeepsPredicate(over) { const U = this._used; for (const [k, v] of over) { const bar = k.lastIndexOf('|'); if (bar < 0) continue; const ix = this._six.get(k.slice(0, bar)), ci = CI[k.slice(bar + 1)]; if (ix === undefined || ci === undefined) return false; const base = U[ix * NCH + ci] || 0; if ((CLASS.capacity - base <= EPS) !== (CLASS.capacity - (base + v) <= EPS)) return false; } return true; }
    _pcShadow(ch, from, to, over, ban, bias, res) {
      const got = this._pcLookup(ch, from, to, over, ban, bias), st = this.pcStats;
      if (got !== undefined) { st.verified++; let same = got === res || (got !== null && res !== null && got.length === res.length); if (same && got !== res) for (let i = 0; i < got.length; i++) { const x = got[i], y = res[i]; if (x.g !== y.g || x.dir !== y.dir || x.from !== y.from || x.to !== y.to) { same = false; break; } } if (!same) { st.mismatch++; if (st.first.length < 5) st.first.push({ ch, from, to, cached: got ? got.map(h => h.g.id).join() : null, real: res ? res.map(h => h.g.id).join() : null }); } }
      else this._pcStore(res);
    }
    /* rate, pressure at the far end: friction per segment (the same law as the old pipes), pump boosts at the stations passed, pump flow limit */
    /* B6 (docs/phaseB/B6-plan-memo.md): plan() is a pure function of (ch, from, to, r, p0), the graph and pump structure (this.rev), the pump faults / begin() (this._plE) and the usage of THIS channel (this._plV[ci], raised by every _apply on it).
     * The answer of the last call of a (channel, from, to) pair is kept with that stamp and returned, frozen, while the stamp and r / p0 (Object.is) are unchanged.  Calls with an `over` that has entries, from === to and non-channel names are never memoised.
     * Same switch as the path cache: pcMode 0 = off, 1 = shadow (always recompute and compare), 2 = on. */
    plan(ch, from, to, r, p0, over) {
      const m = this.pcMode, ci = CI[ch]; if (m === 0 || ci === undefined || from === to || (over && over.size)) { if (m !== 0) this.plStats.bypass++; return this._planCore(ch, from, to, r, p0, over); }
      this._graph(); const nix = this._nix, fi = nix.get(from), ti = nix.get(to), S = this.plStats; if (fi === undefined || ti === undefined) { S.bypass++; return this._planCore(ch, from, to, r, p0, over); }
      let M = this._plM[ci]; if (this._plRev !== this.rev) { for (let i = 0; i < NCH; i++) this._plM[i] = null; this._plRev = this.rev; M = null; } if (!M) M = this._plM[ci] = new Map();
      const k = fi * nix.size + ti; let e = M.get(k); S.calls++;
      const ok = e !== undefined && e.ep === this._plE && e.v === this._plV[ci] && Object.is(e.r, r) && Object.is(e.p, p0);
      if (ok && m === 2) { S.hit++; return e.res; }
      const res = this._planCore(ch, from, to, r, p0, over);
      if (ok) { S.verified++; if (!this._plSame(res, e.res)) S.mismatch++; } else S.miss++;
      if (res) { Object.freeze(res.hops); for (const h of res.hops) Object.freeze(h); for (const t of res.stats) Object.freeze(t); Object.freeze(res.stats); Object.freeze(res.nodes); Object.freeze(res); }
      if (e === undefined) { e = { ep: 0, v: 0, r: 0, p: 0, res: null }; M.set(k, e); } e.ep = this._plE; e.v = this._plV[ci]; e.r = r; e.p = p0; e.res = res; return res;
    }
    _plSame(a, b) {
      if (a === null || b === null) return a === b; if (!Object.is(a.r, b.r) || !Object.is(a.p, b.p) || a.hops.length !== b.hops.length || a.stats.length !== b.stats.length || a.nodes.length !== b.nodes.length) return false;
      for (let i = 0; i < a.hops.length; i++) { const x = a.hops[i], y = b.hops[i]; if (x.g !== y.g || x.dir !== y.dir || x.from !== y.from || x.to !== y.to) return false; }
      for (let i = 0; i < a.stats.length; i++) { const x = a.stats[i], y = b.stats[i]; if (x[0] !== y[0] || !Object.is(x[1], y[1]) || !Object.is(x[2], y[2]) || x[3] !== y[3]) return false; }
      for (let i = 0; i < a.nodes.length; i++) if (a.nodes[i] !== b.nodes[i]) return false; return true;
    }
    _planCore(ch, from, to, r, p0, over) {
      if (from === to) return r > EPS ? { hops: [], r, p: p0, stats: [], nodes: [from] } : null;                         // two branches on the SAME station: the product passes through the station itself (no trunk)
      const first = this.path(ch, from, to, over); if (!first) return null; let best = this._planHops(ch, first, r, p0, over);
      if (!best || best.r < r - 1e-6) {                                                                                  // the shortest path cannot carry it all (capacity, pressure, a pump pushing the other way): try the loop paths that avoid one of its segments
        const seen = new Set([first.map(h => h.g.id).join()]);
        const pb = this.path(ch, from, to, over, null, true); if (pb) { const key = pb.map(h => h.g.id).join(); if (!seen.has(key)) { seen.add(key); const c = this._planHops(ch, pb, r, p0, over); if (c && (!best || c.r > best.r + 1e-6)) best = c; } }          // the route that makes use of the pumps pushing the right way
        for (const h0 of first) { const hops = this.path(ch, from, to, over, new Set([h0.g.id])); if (!hops) continue; const key = hops.map(h => h.g.id).join(); if (seen.has(key)) continue; seen.add(key); const c = this._planHops(ch, hops, r, p0, over); if (c && (!best || c.r > best.r + 1e-6)) best = c; }
      }
      return best;
    }
    /* the pump of a hop that really pushes THIS way (healthy and set to this direction); null = no boost (idle direction, or failed: the product passes the pump unboosted) */
    _hopPump(h, ch) {
      if (this._pxRev !== this.rev || this._pxN !== this.pumps.size || !this._pxCh) { const m = new Map(); for (const p of this.pumps.values()) { let l = m.get(p.ch); if (!l) m.set(p.ch, l = []); l.push(p); } this._pxCh = m; this._pxRev = this.rev; this._pxN = this.pumps.size; }      // perf: only the pumps of this channel, in the same order; seg / fault / dir are still read live
      const l = this._pxCh.get(ch); if (l) for (const p of l) if (p.seg === h.g.id && !p.fault && p.dir === h.dir) return p; return null;
    }
    _planHops(ch, hops, r, p0, over) {
      /* B3a: the same arithmetic in the same order as before (bit-identical); only the bookkeeping changed - the per-hop used value is read once instead of once per iteration, no closure or helper arrays per call, the constants are read once */
      const n = hops.length, CAPC = CLASS.capacity, FPT = SIM.frictionPsiPerTile, FEXP = SIM.frictionExp, FRIC = CLASS.fric, U = PH_U, P = PH_P;
      let cap = Infinity; for (let i = 0; i < n; i++) { const u = this.usedOf(over, hops[i].g.id, ch); U[i] = u; cap = Math.min(cap, CAPC - u); }
      r = Math.min(r, cap);
      for (let i = 0; i < n; i++) { const pu = this._hopPump(hops[i], ch); P[i] = pu; if (pu) r = Math.min(r, Math.max(0, PU.maxFlow - this.pusedOf(over, pu.id))); }
      if (r <= EPS) { for (let i = 0; i < n; i++) P[i] = null; return null; }
      const nodes = new Array(n + 1); nodes[0] = hops[0].from; for (let i = 0; i < n; i++) nodes[i + 1] = hops[i].to;
      const MINP = PU.minInletPsi, MAXP = CLASS.maxPressure; let pEnd = 0, stats = null;
      for (let it = 0; it < 6; it++) {
        let p = p0, ok = true; stats = [];
        for (let i = 0; i < n; i++) {
          const h = hops[i], pu = P[i], atStart = pu && pu.st === h.from;                                              // mounted at the start of the hop: it pushes into the pipe (before the friction); at the end: it pulls from the pipe (after it)
          if (atStart) { if (p >= MINP) { const add = Math.min(pu.boost * pu.eff, Math.max(0, MAXP - p)); stats.push([pu, p, p + add, true]); p += add; } else stats.push([pu, p, p, false]); }
          const ratio = (U[i] + r) / CAPC, loss = h.g.path.length * FPT * Math.pow(ratio, FEXP) * FRIC;
          if (p - loss < 0) { r *= Math.max(0, p / (loss || 1)); ok = false; break; } p -= loss;
          if (pu && !atStart) { if (p >= MINP) { const add = Math.min(pu.boost * pu.eff, Math.max(0, MAXP - p)); stats.push([pu, p, p + add, true]); p += add; } else stats.push([pu, p, p, false]); }
        }
        pEnd = p; if (ok) break; if (r <= EPS) { for (let i = 0; i < n; i++) P[i] = null; return null; }
      }
      for (let i = 0; i < n; i++) P[i] = null;
      if (r <= EPS) return null; return { hops, r, p: pEnd, stats, nodes };
    }
    begin(dt) { this._plE++; this._graph(); const need = Math.max(this._six.size, 1) * NCH; if (this._used && this._used.length >= need) { this._used.fill(0); this._net.fill(0); } else { this._used = new Float64Array(need); this._net = new Float64Array(need); } this._pused = new Map(); this._usedX = new Map(); this._netX = new Map(); if (this.pcMode) { this._pcClearAll('begin'); for (const g of this.seg.values()) if (!Object.isFrozen(g.fault)) { Object.freeze(g.fault); this.pcStats.tamper++; this._pcClearAll('fault'); } } this.dt = dt; this.time += dt; for (const p of this.pumps.values()) { p.flow = 0; p.pIn = 0; p.pOut = 0; p.lowIn = false; } this._chFlow = {}; this._chP = {}; this._chPw = {}; for (const c of CHANNELS) { this._chFlow[c] = 0; this._chP[c] = 0; this._chPw[c] = 0; } }
    _apply(ch, pl, acc) {
      if (CI[ch] !== undefined) this._plV[CI[ch]]++;      // B6: every use of this channel invalidates its memoised plans
      for (const h of pl.hops) { if (CI[ch] === undefined) { const k = h.g.id + '|' + ch; this._usedX.set(k, (this._usedX.get(k) || 0) + acc); this._netX.set(k, (this._netX.get(k) || 0) + acc * h.dir); continue; } const i = this._ixOf(h.g.id) * NCH + CI[ch]; const was = this.pcMode ? CLASS.capacity - (this._used[i] || 0) <= EPS : false; this._used[i] = (this._used[i] || 0) + acc; this._net[i] = (this._net[i] || 0) + acc * h.dir; if (this.pcMode && was !== (CLASS.capacity - this._used[i] <= EPS)) { this._pcA[CI[ch]] = null; this._pcB[CI[ch]] = null; if (this.pcStats) this.pcStats.invalSat++; } }
      for (const [pu, pin, pout, on] of pl.stats) { pu.flow += on ? acc : 0; if (on) { this._pused.set(pu.id, (this._pused.get(pu.id) || 0) + acc); pu.pIn = pin; pu.pOut = pout; } else pu.lowIn = true; }
      this._chFlow[ch] += acc; this._chP[ch] += pl.p * acc; this._chPw[ch] += acc;
    }
    /* the stations that can receive on this channel: they must own a branch (an edge) on the channel port and be operational */
    /* B3b-1 (see docs/phaseB/B3b-receivers-deps.md): what is remembered is ONLY the list of stations that can possibly have an edge on this channel (per channel, valid for one value of sim / sim._eb / this.rev / this.st.size); the building, its state, the exception and the edge test are evaluated live on every call, exactly as in the full scan.
     * A cheap per-call check compares every station's building id (s.b) with the snapshot taken when the lists were built: a station that changes its building without a rev bump (the game never does that) makes the code forget everything and scan. */
    receivers(sim, ch, exceptId, exceptPort) {
      const ports = PORTS[ch]; if (!ports) return this._receiversScan(sim, ch, exceptId, exceptPort);      // not one of the channels: the old code, which fails the same way
      const eb = sim._eb;
      if (this._rcSim !== sim || this._rcEb !== eb || this._rcRev !== this.rev || this._rcN !== this.st.size) { this._rcSim = sim; this._rcEb = eb; this._rcRev = this.rev; this._rcN = this.st.size; this._rcL = Object.create(null); this._rcS = [...this.st.values()]; this._rcB = this._rcS.map(s => s.b); }
      const S = this._rcS, B = this._rcB; for (let i = 0; i < S.length; i++) if (S[i].b !== B[i]) { this._rcRev = -1; return this._receiversScan(sim, ch, exceptId, exceptPort); }
      let L = this._rcL[ch];
      if (!L) { L = this._rcL[ch] = []; for (let i = 0; i < S.length; i++) { const s = S[i]; if (s.b == null) continue; const m = eb && eb.get(s.b); if (!m) continue; for (const port of ports) if (m[port]) { L.push(s); break; } } }
      const out = [];
      for (let i = 0; i < L.length; i++) {
        const s = L[i], b = sim.store.get(s.b); if (!b || !sim.ok(b)) continue;
        for (const port of ports) { if (s.id === exceptId && port === exceptPort) continue; if (sim.edgeOf(b, port)) out.push({ s, b, port }); }
      }
      return out;
    }
    _receiversScan(sim, ch, exceptId, exceptPort) {
      const out = []; for (const s of this.st.values()) { if (s.b == null) continue; const b = sim.store.get(s.b); if (!b || !sim.ok(b)) continue; for (const port of PORTS[ch]) { if (s.id === exceptId && port === exceptPort) continue; if (sim.edgeOf(b, port)) out.push({ s, b, port }); } } return out;
    }
    /* what the receiver at `d` can take of `want` (probe) or really takes (commit) */
    toStation(sim, ch, srcId, d, want, f, commit, vis, over) {
      let got = 0, remaining = want, guard = 0;
      while (remaining > EPS && guard++ < 6) {
        const pl = this.plan(ch, srcId, d.s.id, remaining, f.p, commit ? null : over); if (!pl) break;
        const probeAcc = sim.offer(d.b, d.port, Object.assign({}, f, { r: pl.r, p: pl.p }), commit, vis);
        if (probeAcc <= EPS) break;
        if (commit) this._apply(ch, pl, probeAcc);
        else { for (const h of pl.hops) { const k = h.g.id + '|' + ch; over.set(k, (over.get(k) || 0) + probeAcc); } for (const [pu, , , on] of pl.stats) if (on) over.set('P' + pu.id, (over.get('P' + pu.id) || 0) + probeAcc); }
        got += probeAcc; remaining -= probeAcc; if (probeAcc < pl.r - 1e-6) break;
      }
      return got;
    }
    /* the entry point from the Sim: a flow f (rate r bbl/day, pressure p) arrives at station `src` on channel `ch` */
    deliver(sim, src, ch, f, commit, vis, port) {
      if (!this._used || !this.channelUp(ch)) return 0; const rcv = this.receivers(sim, ch, src.id, port); if (!rcv.length) return 0;
      const probe = rcv.map(d => ({ d, can: this.toStation(sim, ch, src.id, d, f.r, f, false, vis, new Map()) })).filter(o => o.can > EPS).sort((a, b) => a.can - b.can);
      if (!probe.length) return 0; let remain = f.r, left = probe.length, total = 0;
      for (const o of probe) { const take = Math.min(o.can, remain / left); remain -= take; left--; if (take > EPS) total += commit ? this.toStation(sim, ch, src.id, o.d, take, f, true, vis, null) : take; }
      return total;
    }
    end() {
      const dt = this.dt || 0;
      for (const g of this.seg.values()) { const ix = this._six.get(g.id); for (const c of CHANNELS) { const i = ix === undefined ? -1 : ix * NCH + CI[c], u = i < 0 ? 0 : (this._used[i] || 0), n = i < 0 ? 0 : (this._net[i] || 0); g.f[c].flow = u; g.f[c].net = n; } }
      for (const c of CHANNELS) {
        const ch = this.ch[c], fl = this._chFlow[c]; ch.flow = fl; ch.moved += fl * dt; ch.pressure = this._chPw[c] > 0 ? this._chP[c] / this._chPw[c] : 0;
        let tiles = 0, loadQ = 0, netSum = 0, absSum = 0; for (const g of this.seg.values()) { const u = g.f[c].flow, t = g.path.length; tiles += t; loadQ += t * BORE_BBL * Math.min(1, u / CLASS.capacity); netSum += g.f[c].net; absSum += u; }
        ch.qty = loadQ; ch.tiles = tiles; ch.dir = absSum > EPS ? Math.sign(netSum) : 0;
        ch.status = ch.fault ? 'FAULT' : ch.state === 'CLOSED' ? 'CLOSED' : fl > EPS ? 'RUNNING' : 'READY';
        let anyFault = false; for (const g of this.seg.values()) if (g.fault[c]) anyFault = true; ch.hasFault = anyFault;
      }
    }

    /* ---------------------------------------------------------------- numbers for the panel / the books */
    trunkTiles() { let n = 0; for (const g of this.seg.values()) n += g.path.length; return n; }
    cost() { const tiles = this.trunkTiles(); return { tiles, tileCost: TILE_COST, shell: tiles * TILE_COST, stations: this.st.size, stationsValue: this.st.size * TILE_COST, pumps: this.pumps.size, pump: this.pumps.size * PU.cost }; }
    dailyCosts() { let op = 0, maint = 0; for (const p of this.pumps.values()) { op += PU.op; maint += PU.maint; } const J = CFG.JUNCTION; for (const s of this.st.values()) { op += (J.op || 0); maint += (J.maint || 0); } return { op, maint }; }       // pumps = the existing central pump station figures; stations = the existing junction figures (no new rate)
    channelInfo(c) { const ch = this.ch[c]; let flt = 0, segs = 0; for (const g of this.seg.values()) { segs++; if (g.fault[c]) flt++; } let pump = 0, pOk = 0; for (const p of this.pumps.values()) if (p.ch === c) { pump++; if (!p.fault) pOk++; } return Object.assign({ id: c, segs, faultySegs: flt, pumps: pump, pumpsOk: pOk, color: COLOR[c] }, ch); }

    /* ---------------------------------------------------------------- save / load */
    toJSON() {
      const ch = {}; for (const c of CHANNELS) { const x = this.ch[c]; ch[c] = { s: x.state, f: x.fault ? 1 : 0, m: Math.round(x.moved * 100) / 100 }; }
      const stt = [...this.st.values()].map(s => { const o = { id: s.id, x: s.x, y: s.y, sec: s.sec, b: s.b }; if (s.tapped) { o.t = 1; o.tile = s.tile; } if (s.cells) o.cells = s.cells; return o; });
      const seg = [...this.seg.values()].map(g => { const o = { id: g.id, k: g.kind, a: g.a, b: g.b, p: pack(g.path) }; const f = Object.keys(g.fault).filter(c => g.fault[c]); if (f.length) o.f = f; return o; });
      const pu = [...this.pumps.values()].map(p => ({ id: p.id, st: p.st, ch: p.ch, seg: p.seg, dir: p.dir, boost: p.boost, eff: p.eff, fault: p.fault ? 1 : 0 }));
      return { v: 1, ns: this.nextSt, ng: this.nextSeg, np: this.nextPump, ch, st: stt, seg, pu };
    }
    static fromJSON(W, d) {
      const n = new CentralNet(W); if (!d || !Array.isArray(d.st)) return n; n.nextSt = d.ns || 1; n.nextSeg = d.ng || 1; n.nextPump = d.np || 1;
      for (const s of d.st) { const o = n.addStation({ id: s.id, x: s.x, y: s.y, sec: s.sec, b: s.b, tapped: !!s.t, tile: s.tile }); if (s.cells) { o.cells = s.cells; for (const [x, y] of s.cells) n.cov.add(n.key(x, y)); } }
      for (const g of d.seg || []) { const o = { id: g.id, kind: g.k, a: g.a, b: g.b, path: unpack(g.p), fault: {} }; for (const c of g.f || []) o.fault[c] = true; n.addSeg(o); }
      for (const p of d.pu || []) n.addPump({ id: p.id, st: p.st, ch: p.ch, seg: p.seg, dir: p.dir, boost: p.boost, eff: p.eff, fault: !!p.fault });
      for (const c of CHANNELS) { const x = d.ch && d.ch[c]; if (x) { n.ch[c].state = x.s || 'OPEN'; n.ch[c].fault = !!x.f; n.ch[c].moved = x.m || 0; } }
      return n;
    }
  }
  CentralNet.pcDefault = 2;      // the path cache mode a NEW network starts in (2 = on, answers plain path calls from the cache; 0 = off = the B1 path, an instant fallback from the diagnostics panel)
  /* compact path: corner points */
  function pack(path) { const o = [path[0]]; for (let i = 1; i < path.length - 1; i++) { const a = path[i - 1], b = path[i], c = path[i + 1]; if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0) o.push(b); } if (path.length > 1) o.push(path[path.length - 1]); return o; }
  function unpack(c) { const o = [[c[0][0], c[0][1]]]; for (let i = 1; i < c.length; i++) { let [x, y] = o[o.length - 1]; const [X, Y] = c[i]; while (x !== X || y !== Y) { x += Math.sign(X - x); y += Math.sign(Y - y); o.push([x, y]); } } return o; }

  /* ---------------------------------------------------------------- the pre-built network from the plan: stations (+ their buildings), segments, pumps.  `place(x, y)` puts the station building and returns its id (or null for none). */
  function expand(plan) { return { stations: plan.stations.map(s => ({ id: s[0], x: s[1], y: s[2], sec: s[3], r: s[4], px: s[5], py: s[6] })), routes: plan.routes.map(r => ({ id: r[0], kind: r[1], a: r[2], b: r[3], path: unpack(r[4]) })), pumps: plan.pumps || [] }; }


  /* ---------------------------------------------------------------- INSTALL the pre-built network into a store + PipeNet: segments, station buildings (free, operational), pumps.
   * A station keeps its planned anchor when its 2x2 footprint passes the normal building validation; the rotation that leaves the most usable ports is chosen; when the anchor is not valid the footprint
   * is moved to the nearest valid spot (reported in `moved`).  Pipe tiles under a footprint are not pipe tiles any more (the pipe ends inside the station). */
  function install(store, net, plan, opts) {
    opts = opts || {}; const pl = expand(plan || (typeof OliCentralPlan !== 'undefined' ? OliCentralPlan : require('./central-plan.js'))), cn = new CentralNet(store.W); net.central = cn; const res = { stations: 0, moved: [], failed: [], tiles: 0 };
    for (const s of pl.stations) cn.addStation({ id: s.id, x: s.x, y: s.y, sec: s.sec });
    for (const r of pl.routes) cn.addSeg({ id: r.id, kind: r.kind, a: r.a, b: r.b, path: r.path });
    for (const s of pl.stations) {
      const cells = (x, y) => { const o = []; for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) o.push([x + i, y + j]); return o; }, saved = [];
      const trial = (x, y) => { for (const [cx, cy] of cells(x, y)) { const k = cn.key(cx, cy); if (cn.cen.has(k)) { saved.push([k, cn.at.get(k)]); cn.cen.delete(k); cn.at.delete(k); } } let best = null; for (let r = 0; r < 4; r++) { const v = store.validate('central_station', x, y, r, { ignoreCash: true }); if (!v.ok) continue; const n = v.connections.filter(c => c.ok).length; if (!best || n > best.n) best = { r, n }; } for (const [k, id] of saved.splice(0)) { cn.cen.add(k); if (id) cn.at.set(k, id); } return best; };
      let spot = null, mv = null;
      if (s.r != null && s.px != null && !opts.verify) spot = { x: s.px, y: s.py, r: s.r, ports: null, trust: true };      // a baked plan: the spot was chosen and fully validated against the real terrain offline (the browser only has the chunks near the camera)
      if (!spot) for (let d = 0; d <= 4 && !spot; d++) for (let dy = -d; dy <= d && !spot; dy++) for (let dx = -d; dx <= d && !spot; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue; const b = trial(s.x + dx, s.y + dy); if (b) { spot = { x: s.x + dx, y: s.y + dy, r: b.r, ports: b.n }; mv = d ? [dx, dy] : null; } }
      if (!spot) { res.failed.push(s.id); continue; }
      cn.claimFootprint(s.id, cells(spot.x, spot.y)); const p = store.place('central_station', spot.x, spot.y, spot.r, { instant: true, free: true, ignoreCash: true, trust: !!spot.trust });
      if (!p.ok) { res.failed.push(s.id + ':' + p.reason); continue; } const st = cn.st.get(s.id); st.b = p.building.id; st.x = spot.x; st.y = spot.y; st.ports = spot.ports; res.stations++; if (mv) res.moved.push([s.id, mv[0], mv[1]]);
    }
    for (const [id, seg, dir] of pl.pumps) for (const ch of CHANNELS) if (cn.st.has(id)) cn.addPump({ st: id, ch, seg, dir });
    cn.rev++; res.tiles = cn.cen.size; res.cn = cn; return res;
  }


  /* ---------------------------------------------------------------- FREE TAP: a branch from ANY tile of the trunk.  planTap() finds a 3x3 station spot touching the tile (normal building validation, best rotation = most usable ports);
   * commitTap() buys the station (one tile of shell = one tile of each channel) and registers it in the graph (the segment is cut in two at that tile): that registration is the mechanical connection. */
  function planTap(store, net, x, y, opts) {
    opts = opts || {}; const cn = net.central; if (!cn) return { ok: false, reason: 'noNetwork' }; const tp = cn.tapPoint(x, y); if (!tp) return { ok: false, reason: 'notOnCentral' };
    if (tp.atEnd) return { ok: false, reason: 'atStation', station: cn.st.get(tp.i <= 0 ? tp.seg.a : tp.seg.b) };
    const cells = (fx, fy) => { const o = []; for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) o.push([fx + i, fy + j]); return o; }, near = c => Math.abs(c[0] - x) + Math.abs(c[1] - y) === 1; let best = null, why = 'noSpot'; const all = [];
    for (let fy = y - 3; fy <= y + 1; fy++) for (let fx = x - 3; fx <= x + 1; fx++) { const cs = cells(fx, fy); if (!cs.some(near) || cs.some(c => c[0] === x && c[1] === y)) continue;
      for (let r = 0; r < 4; r++) { const v = store.validate('central_station', fx, fy, r, { ignoreCash: true }); if (!v.ok) { why = v.reason || why; continue; } const n = v.connections.filter(q => q.ok).length; all.push({ x: fx, y: fy, r, ports: n, d: Math.abs(fx - x) + Math.abs(fy - y), cost: v.cost, tw: opts.toward ? Math.hypot(fx + 1 - opts.toward[0], fy + 1 - opts.toward[1]) : 0 }); } }
    { const top = all.reduce((m, c) => Math.max(m, c.ports), 0); for (const c of all) if (c.ports >= top - 3 && (!best || (opts.toward ? c.tw < best.tw - 1e-9 || (Math.abs(c.tw - best.tw) < 1e-9 && c.ports > best.ports) : c.ports > best.ports || (c.ports === best.ports && c.d < best.d)))) best = c; }      // the station stands on the side the player taps from (toward = the facility), with almost the most usable ports
    if (!best) return { ok: false, reason: why };
    if (store.cash < best.cost && !opts.ignoreCash) return { ok: false, reason: 'cash', cost: best.cost };
    return { ok: true, x: best.x, y: best.y, r: best.r, ports: best.ports, cost: best.cost, tile: [x, y], seg: tp.seg.id, sec: opts.sec || null };
  }
  function commitTap(store, net, plan, opts) {
    opts = opts || {}; if (!plan || !plan.ok) return plan || { ok: false, reason: 'noPlan' }; const cn = net.central; const p = store.place('central_station', plan.x, plan.y, plan.r, { instant: opts.instant !== false, ignoreCash: !!opts.ignoreCash }); if (!p.ok) return p;
    const t = cn.tap(plan.tile[0], plan.tile[1], { b: p.building.id, sec: plan.sec }); if (!t.ok) { store.demolish(p.building.id, { building: true, pipes: true, force: true }); return t; }
    t.station.cells = null; t.building = p.building; t.cost = p.cost; cn.rev++; return Object.assign({ ok: true }, t);
  }

  return { planTap, commitTap, install, CHANNELS, PORT, PORTS, CH_OF_PORT, COLOR, CLASS, PUMP: PU, TILE_COST, BORE_BBL, CentralNet, expand, pack, unpack };
});
