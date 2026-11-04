/* Oli — map layers (Phase 6 of the oil system).
 * Eight layers over the world map. Every layer is built from the REAL data of the game (world, building store, pipe net, simulation); nothing here is a picture.
 * The module only produces drawing primitives (tile coordinates) and answers questions; the canvas drawing lives in building-lab.js.
 * What the player may know is decided here with the same rules as everywhere else: undiscovered sites never appear, an unsurveyed site shows only its rough indicator,
 * the true reserve / depth of a field never leaves visibleInfo()/zoneInfo().
 *   Layers: TERRAIN, INFRA, GEOLOGY, EXPLORATION, FIELDS, PRODUCTION, PIPELINES, LAND
 *   API:    create({world, store, pipes, sim, ts}) -> { DEFS, on, toggle, set, features(id, view), inspect(x, y, ids), section(a, b, n), geology(x, y), legend(id), stats }
 */
(function (root) {
  'use strict';
  const OW = typeof require === 'function' && typeof module !== 'undefined' ? require('./worldmap.js') : root.OliWorld;
  const hash = OW.hash, fbm = OW.fbm;

  /* ---- the eight layers: Arabic name, colour and symbol. Colours are chosen to stay apart when several layers are on at once. */
  const DEFS = {
    TERRAIN:     { ar: 'التضاريس',                 color: '#b99a62', icon: '▲', order: 1 },
    INFRA:       { ar: 'المنشآت والبنية التحتية',   color: '#8fb4d9', icon: '▣', order: 2 },
    GEOLOGY:     { ar: 'الطبقة الجيولوجية',         color: '#c79bd9', icon: '≋', order: 3 },
    EXPLORATION: { ar: 'الاستكشاف',                color: '#f0be28', icon: '◎', order: 4 },
    FIELDS:      { ar: 'الحقول والمكامن',           color: '#ff9a3a', icon: '⬭', order: 5 },
    PRODUCTION:  { ar: 'الإنتاج',                  color: '#6dff9a', icon: '⛽', order: 6 },
    PIPELINES:   { ar: 'الأنابيب والنقل',           color: '#4fc3f7', icon: '⇉', order: 7 },
    LAND:        { ar: 'الأراضي والاستثمار',        color: '#ff7aa8', icon: '▦', order: 8 }
  };
  const IDS = Object.keys(DEFS).sort((a, b) => DEFS[a].order - DEFS[b].order);

  /* ---- tuning (one place) */
  const K = {
    MAX_ITEMS: 1500,                 // a hard cap per layer, so several layers together never stall a frame
    GRID_MAX_SPAN: 420,              // terrain / geology cells are drawn only when the view is at most this many tiles wide (chunks are generated lazily)
    GRID_CELLS: 700,                 // about this many cells per view
    ELEV_M: 400,                     // elevation 0..1 -> metres, for the section
    SECTION_MAX_DEPTH: 5200,         // the section shows down to this depth (m)
    FAULTS_PER_REGION: [1, 3], FAULT_LEN: [40, 110], FAULT_THROW: [20, 120],
    HOT: 0.9                         // a pipe above this share of its capacity is a bottleneck
  };

  /* ---- rocks. The outcrop at the surface and the stack underneath. */
  const ROCK = {
    ALLUVIUM:  { ar: 'رواسب رملية وحصى',   color: [226, 205, 150] },
    DUNES:     { ar: 'رمال كثبان',          color: [238, 218, 160] },
    LIMESTONE: { ar: 'حجر جيري',            color: [196, 205, 190] },
    SANDSTONE: { ar: 'حجر رملي',            color: [214, 160, 110] },
    SHALE:     { ar: 'طفل صخري ومارل',      color: [140, 128, 126] },
    VOLCANIC:  { ar: 'صخور نارية (جبلية)',   color: [110, 96, 100] },
    WATER:     { ar: 'رواسب وادٍ ومياه',    color: [90, 140, 160] },
    CAPROCK:   { ar: 'صخر غطاء (طفل)',      color: [120, 110, 112] },
    RESERVOIR: { ar: 'صخر المكمن',          color: [232, 178, 92] },
    SOURCE:    { ar: 'صخر المصدر',          color: [86, 70, 66] },
    BASEMENT:  { ar: 'صخور القاعدة',        color: [150, 70, 76] }
  };
  const OUTCROP_ORDER = ['ALLUVIUM', 'LIMESTONE', 'SANDSTONE', 'SHALE'];

  function create(ctx) {
    const world = ctx.world, store = ctx.store, pipes = ctx.pipes, sim = ctx.sim, ts = ctx.ts || null, CFG = OW.CONFIG;
    const SEED = (world.seed | 0) ^ 0x5eed9e0;
    const on = new Set(), stats = { lastMs: 0, lastItems: 0, byLayer: {} };
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
    const pct = v => Math.round(v * 100);
    const nf = n => Math.round(n).toLocaleString('en-US');

    /* =========================================================================================== geology (deterministic, seed only) */
    const faultCache = new Map();
    function faultsOf(rid) {
      if (faultCache.has(rid)) return faultCache.get(rid); const reg = world.regions[rid], out = [];
      if (reg) {
        const n = K.FAULTS_PER_REGION[0] + Math.floor(hash(SEED, reg.rx + 300, reg.ry + 300) * (K.FAULTS_PER_REGION[1] - K.FAULTS_PER_REGION[0] + 1));
        for (let i = 0; i < n; i++) {
          const h = j => hash(SEED + i * 7919, reg.rx * 13 + j, reg.ry * 17 + j), cx = reg.x0 + (.15 + .7 * h(1)) * reg.w, cy = reg.y0 + (.15 + .7 * h(2)) * reg.h, ang = h(3) * Math.PI, len = lerp(K.FAULT_LEN[0], K.FAULT_LEN[1], h(4));
          const dx = Math.cos(ang) * len / 2, dy = Math.sin(ang) * len / 2;
          out.push({ id: 'F' + rid + '-' + (i + 1), region: rid, x1: cx - dx, y1: cy - dy, x2: cx + dx, y2: cy + dy, throwM: Math.round(lerp(K.FAULT_THROW[0], K.FAULT_THROW[1], h(5))), dir: h(6) < .5 ? -1 : 1 });
        }
      }
      faultCache.set(rid, out); return out;
    }
    const faultsNear = (x, y, rad) => { const out = [], r0 = world.regionIdAt(clamp(x, 0, world.W - 1), clamp(y, 0, world.H - 1)); const seen = new Set(); for (const dx of [-rad, 0, rad]) for (const dy of [-rad, 0, rad]) { const rid = world.regionIdAt(clamp(x + dx, 0, world.W - 1), clamp(y + dy, 0, world.H - 1)); if (rid == null || rid < 0 || seen.has(rid)) continue; seen.add(rid); for (const f of faultsOf(rid)) out.push(f); } return out; };
    /* how far a tile is shifted by the faults (m, positive = the rocks lie deeper); steep step across the line, fading out at the ends */
    function faultShift(x, y) {
      let s = 0; for (const f of faultsNear(x, y, 60)) {
        const vx = f.x2 - f.x1, vy = f.y2 - f.y1, L2 = vx * vx + vy * vy, t = ((x - f.x1) * vx + (y - f.y1) * vy) / L2; if (t < -.05 || t > 1.05) continue;
        const side = (vx * (y - f.y1) - vy * (x - f.x1)) > 0 ? 1 : -1, taper = Math.min(1, Math.min(t + .05, 1.05 - t) * 10); s += side * f.dir * f.throwM * .5 * taper;
      } return s;
    }
    const outcropAt = (x, y) => {
      const t = world.tile(x, y); if (!t) return null; if (t.terrain === 'WATER_WADI') return 'WATER'; if (t.terrain === 'SAND_DUNES') return 'DUNES'; if (t.terrain === 'ROCKY_PLATEAU') return 'VOLCANIC';
      const n = fbm ? fbm(SEED, x / 55, y / 55, 3) : hash(SEED, x >> 4, y >> 4); const v = clamp((n - .3) / .4, 0, .9999); let id = OUTCROP_ORDER[Math.floor(v * OUTCROP_ORDER.length)];
      if (t.terrain === 'VALLEY' && id === 'LIMESTONE') id = 'ALLUVIUM'; return id;
    };
    /* the field the player KNOWS about near a tile (surveyed or better): only those reshape the picture */
    const knownField = (x, y) => { let best = null, bd = 1e9; for (const s of world.sitesNear(Math.round(x), Math.round(y), 40)) { const st = world.stateOf(s.id); if (st === 'UNDISCOVERED' || st === 'DISCOVERED') continue; const d = Math.hypot(s.x - x, s.y - y) / s.radius; if (d < 2 && d < bd) { bd = d; best = s; } } return best ? { s: best, d: bd } : null; };
    function column(x, y) {
      const reg = world.regions[world.regionIdAt(clamp(Math.round(x), 0, world.W - 1), clamp(Math.round(y), 0, world.H - 1))], D = CFG.ZONE_DEPTH[reg.kind] || [500, 3000];
      let rt = lerp(D[0], D[1], clamp(.2 + .6 * (fbm ? fbm(SEED + 1, x / 90, y / 90, 3) : .5), 0, 1)) + faultShift(x, y), thick = lerp(50, 150, hash(SEED + 2, Math.floor(x / 25), Math.floor(y / 25)));
      let field = null; const kf = knownField(x, y);
      if (kf) { const w = kf.d <= 1 ? 1 : 1 - (kf.d - 1), s = kf.s; thick = lerp(thick, clamp(s.initialReserve / (Math.PI * s.radius * s.radius * 520), 35, 190), w); rt = lerp(rt, s.depth - thick * .5 + faultShift(x, y) * .25, w); if (kf.d <= 1) field = s; }
      rt = Math.max(150, rt);
      const out = outcropAt(Math.round(x), Math.round(y)) || 'ALLUVIUM', top = Math.min(rt * .12, 90), cap = Math.min(rt * .22, 260), mid = rt - top - cap;
      const stack = [{ id: out, top: 0, bottom: top }, { id: 'LIMESTONE', top, bottom: top + mid }, { id: 'CAPROCK', top: top + mid, bottom: rt }, { id: 'RESERVOIR', top: rt, bottom: rt + thick }, { id: 'SOURCE', top: rt + thick, bottom: rt + thick + 380 }, { id: 'BASEMENT', top: rt + thick + 380, bottom: Infinity }];
      return { x, y, stack, reservoirTop: rt, reservoirBottom: rt + thick, field };
    }
    const geology = (x, y) => { const c = column(x, y); return { rock: c.stack[0].id, label: ROCK[c.stack[0].id].ar, reservoirTop: Math.round(c.reservoirTop), reservoirBottom: Math.round(c.reservoirBottom), fieldId: c.field ? c.field.id : null, stack: c.stack.map(l => ({ id: l.id, ar: ROCK[l.id].ar, top: Math.round(l.top), bottom: l.bottom === Infinity ? null : Math.round(l.bottom) })) }; };

    /* =========================================================================================== helpers over the live game */
    const DEFSB = (typeof require === 'function' && typeof module !== 'undefined') ? require('./buildings.js').DEFS : root.OliBuildings.DEFS;
    const wellsOnMap = () => store.list().filter(b => DEFSB[b.d] && DEFSB[b.d].type === 'well');
    const siteOfWell = b => b.field ? world.siteById(b.field) : world.oilFieldAt(b.x, b.y);
    const stateCol = { DISCOVERED: '#e6c35a', SURVEYED: '#e69a4a', DRILLABLE: '#ffb030', PRODUCING: '#6dff9a', DEPLETED: '#777777' };
    const stateAr = { UNDISCOVERED: 'غير مكتشف', DISCOVERED: 'مكتشف (لم يُمسح)', SURVEYED: 'تم مسحه', DRILLABLE: 'جاهز للحفر', PRODUCING: 'ينتج', DEPLETED: 'نضب' };
    const classAr = { NON_COMMERCIAL: 'غير اقتصادية', WEAK: 'ضعيفة', MEDIUM: 'متوسطة', PROMISING: 'واعدة', RICH: 'غنية' };
    const classCol = { NON_COMMERCIAL: '#8a8a8a', WEAK: '#c9a24a', MEDIUM: '#e6c35a', PROMISING: '#9be15d', RICH: '#4ade80' };
    const view = (v) => ({ x0: v.x0, y0: v.y0, x1: v.x1, y1: v.y1, z: v.z || 1, span: Math.max(v.x1 - v.x0, v.y1 - v.y0) });
    const regionsIn = v => world.regions.filter(r => !(r.x0 > v.x1 || r.y0 > v.y1 || r.x0 + r.w < v.x0 || r.y0 + r.h < v.y0));
    const inView = (x, y, v, m) => x >= v.x0 - (m || 0) && x <= v.x1 + (m || 0) && y >= v.y0 - (m || 0) && y <= v.y1 + (m || 0);
    /* fields the player may see on the map, each with the numbers it is allowed to know */
    function knownFields(v) {
      const out = []; for (const r of regionsIn(v)) for (const s of world.regionSites(r.id)) { if (!inView(s.x, s.y, v, s.radius)) continue; const st = world.stateOf(s.id), vi = world.visibleInfo(s.id); if (!vi) continue; out.push({ s, st, vi }); } return out;
    }
    /* terrain / geology cells: a grid whose step grows with the view so the count stays bounded */
    function gridCells(v, fn) {
      if (v.span > K.GRID_MAX_SPAN) return false; const step = Math.max(4, Math.pow(2, Math.ceil(Math.log2(Math.max(1, v.span / Math.sqrt(K.GRID_CELLS)))))); const items = [];
      for (let y = Math.floor(v.y0 / step) * step; y <= v.y1; y += step) for (let x = Math.floor(v.x0 / step) * step; x <= v.x1; x += step) { if (!world.inb(x, y)) continue; const c = fn(x + step / 2 | 0, y + step / 2 | 0, step); if (c) { c.x = x; c.y = y; c.s = step; items.push(c); if (items.length >= K.MAX_ITEMS) return items; } }
      return items;
    }
    const KINDCOL = { 'DESERT PLAINS': '#cfac72', 'DUNE SEA': '#e5c284', 'ROCKY BADLANDS': '#a38262', 'MOUNTAIN BELT': '#7a6552', 'VALLEY BASIN': '#a89868', 'HIGH PLATEAU': '#8c735a', 'COASTAL SHELF': '#5b8da3' };
    const KINDAR = { 'DESERT PLAINS': 'سهول صحراوية', 'DUNE SEA': 'بحر كثبان', 'ROCKY BADLANDS': 'أراضٍ صخرية وعرة', 'MOUNTAIN BELT': 'حزام جبلي', 'VALLEY BASIN': 'حوض وادٍ', 'HIGH PLATEAU': 'هضبة مرتفعة', 'COASTAL SHELF': 'سهل ساحلي' };
    const TERCLS = t => t.terrain === 'WATER_WADI' ? ['WATER', 'ماء / وادٍ', '#3a708a'] : t.terrain === 'ROCKY_PLATEAU' || t.level >= 6 ? ['MOUNTAIN', 'جبال وهضاب', '#6b5a4c'] : t.terrain === 'VALLEY' ? ['VALLEY', 'وادٍ منخفض', '#a89868'] : t.level >= 4 || t.slope > 14 ? ['HILLS', 'تلال وارتفاعات', '#a38262'] : t.terrain === 'SAND_DUNES' ? ['DUNES', 'كثبان رملية', '#e5c284'] : ['PLAIN', 'سهل مستوٍ', '#cfac72'];

    /* =========================================================================================== the layers: each returns { items, note } */
    const L = {};
    L.TERRAIN = v => {
      const cells = gridCells(v, (x, y) => { const t = world.tile(x, y); if (!t) return null; const c = TERCLS(t); return { k: 'cell', c: c[2], a: .42, cls: c[0] }; });
      if (cells) return { items: cells };
      return { items: regionsIn(v).map(r => ({ k: 'rect', x: r.x0, y: r.y0, w: r.w, h: r.h, fill: KINDCOL[r.kind] || '#999', a: .38, stroke: 'rgba(255,255,255,.25)', label: KINDAR[r.kind] || r.kind })), note: 'قرّب لعرض الارتفاعات والتفاصيل' };
    };
    L.INFRA = v => {
      const items = [], TC = { well: '#d9962b', pump: '#7cc4ff', refinery: '#b08be6', separator: '#6faa7d', junction: '#cfd8e3', valve: '#ff8a80' };
      for (const r of regionsIn(v)) for (const t of world.tracks(r.id)) { if (items.length >= K.MAX_ITEMS) break; items.push({ k: 'line', pts: t.pts, c: 'rgba(196,164,112,.9)', w: 2, dash: [6, 5], road: true }); }
      for (const b of store.list()) { if (!inView(b.x, b.y, v, 6)) continue; const def = DEFSB[b.d]; if (!def) continue; const [w, h] = def.footprint || [1, 1]; items.push({ k: 'bld', id: b.id, x: b.x, y: b.y, w, h, c: TC[def.type] || (def.category === 'PROCESSING' ? '#6faa7d' : '#8f9aa6'), type: def.type, label: def.name }); if (items.length >= K.MAX_ITEMS) break; }
      for (const ln of pipes.lines.values()) { if (!ln.path.length || items.length >= K.MAX_ITEMS) continue; const p0 = ln.path[0], p1 = ln.path[ln.path.length - 1]; if (!inView(p0[0], p0[1], v, 80) && !inView(p1[0], p1[1], v, 80)) continue; items.push({ k: 'line', pts: ln.path.map(p => [p[0] + .5, p[1] + .5]), c: 'rgba(120,170,215,.85)', w: 2 + (ln.dia >= 24 ? 1 : 0) }); }
      return { items };
    };
    L.GEOLOGY = v => {
      const items = [], cells = gridCells(v, (x, y) => { const o = outcropAt(x, y); return o ? { k: 'cell', c: 'rgb(' + ROCK[o].color.join(',') + ')', a: .55, cls: o } : null; });
      if (cells) items.push(...cells);
      for (const r of regionsIn(v)) for (const f of faultsOf(r.id)) { if (!(inView(f.x1, f.y1, v, 120) || inView(f.x2, f.y2, v, 120))) continue; items.push({ k: 'line', pts: [[f.x1, f.y1], [f.x2, f.y2]], c: '#ff5c5c', w: 2.4, id: f.id, fault: true, label: 'صدع ' + f.throwM + ' م' }); }
      for (const q of knownFields(v)) { const s = q.s; if (q.vi.dry) continue; items.push({ k: 'ell', x: s.x, y: s.y, r: s.radius * 1.25, fill: 'rgba(255,190,80,.10)', stroke: '#ffc05a', dash: [3, 3], w: 1.3, label: 'تركيب مكمن' + (q.vi.depth ? ' · ' + nf(q.vi.depth) + ' م' : '') }); }
      return { items, note: cells ? null : 'قرّب لعرض الصخور السطحية (الصدوع والتراكيب ظاهرة)' };
    };
    L.EXPLORATION = v => {
      const items = [];
      for (const r of regionsIn(v)) {
        const z = world.zoneInfo(r.id); if (!z) continue; const ev = z.evaluated, cls = z.potentialClass, col = ev ? classCol[z.commercial === false ? 'NON_COMMERCIAL' : cls] : '#9aa4ae';
        items.push({ k: 'rect', x: r.x0, y: r.y0, w: r.w, h: r.h, fill: col, a: ev ? .20 : .07, stroke: col, dash: ev ? null : [6, 6], w2: 1.5, rid: r.id, label: r.name + ' · ' + (ev ? (z.commercial === false ? 'غير اقتصادية' : classAr[cls]) + ' · احتمال ' + pct(z.discoveryProbability) + '%' : 'لم تُقيَّم (تقدير أولي: ' + classAr[cls] + ')'), unlocked: z.unlocked });
      }
      for (const r of regionsIn(v)) for (const s of world.regionSites(r.id)) {
        const vi = world.visibleInfo(s.id); if (!vi || !inView(s.x, s.y, v, s.radius)) continue;
        if (vi.state === 'DISCOVERED') items.push({ k: 'ell', x: vi.indicator.x, y: vi.indicator.y, r: vi.indicator.r, fill: 'rgba(230,195,90,.12)', stroke: stateCol.DISCOVERED, dash: [5, 4], w: 1.4, label: 'واعد · لم يُمسح', sid: s.id });
        else if (vi.dry) items.push({ k: 'dot', x: s.x, y: s.y, c: '#888', sym: '✕', label: 'غير اقتصادي', sid: s.id });
        else items.push({ k: 'ell', x: s.x, y: s.y, r: s.radius, fill: 'rgba(230,150,60,.10)', stroke: stateCol[vi.state] || '#e69a4a', dash: vi.state === 'SURVEYED' ? [6, 3] : null, w: 1.6, label: stateAr[vi.state] + ' · نجاح ' + pct(vi.probability) + '%', sid: s.id });
        if (items.length >= K.MAX_ITEMS) break;
      }
      return { items };
    };
    L.FIELDS = v => {
      const items = [];
      for (const q of knownFields(v)) {
        const { s, vi } = q; if (vi.dry || vi.state === 'DISCOVERED') continue; const own = vi.state === 'DRILLABLE' || vi.state === 'PRODUCING' || vi.state === 'DEPLETED'; const pr = own ? world.pressureOf(s.id) : null;
        const lab = [stateAr[vi.state], own ? 'متبقٍ ' + nf(vi.remainingReserve) + ' برميل' : 'تقدير ' + nf(vi.estimatedReserve) + ' برميل', pr != null ? 'ضغط ' + pct(pr) + '%' : null, own ? 'عمق ' + nf(vi.depth) + ' م' : null].filter(Boolean).join(' · ');
        items.push({ k: 'ell', x: s.x, y: s.y, r: s.radius, fill: 'rgba(255,154,58,.14)', stroke: stateCol[vi.state] || '#ff9a3a', dash: vi.state === 'SURVEYED' ? [6, 3] : null, w: 2, label: lab, sid: s.id, pr, ratio: own ? s.remainingReserve / Math.max(1, s.initialReserve) : null, gauge: own });
      }
      return { items };
    };
    L.PRODUCTION = v => {
      const items = [], byField = new Map();
      for (const b of wellsOnMap()) {
        if (!inView(b.x, b.y, v, 4)) continue; const st = sim.status(b), s = b.s || {}, site = siteOfWell(b), running = st === 'RUNNING' || st === 'OVER_CAPACITY' || st === 'LOW_PRESSURE', out = s._out || 0, oil = out * (1 - (s._wc || 0) - (s._gas || 0));
        items.push({ k: 'dot', id: b.id, x: b.x + .5, y: b.y + .5, c: running && out > 0 ? '#6dff9a' : st === 'DEPLETED' ? '#777' : '#ff8a80', r: 5 + Math.min(8, Math.sqrt(out) / 3), producing: running && out > 0, status: st, out: Math.round(out), oil: Math.round(oil), wc: s._wc || 0, label: Math.round(oil) + ' برميل/يوم', field: site ? site.id : null });
        if (site) { const a = byField.get(site.id) || { site, n: 0, on: 0, oil: 0, wc: 0 }; a.n++; if (out > 0) { a.on++; a.wc += (s._wc || 0) * out; a.oil += oil; a.out = (a.out || 0) + out; } byField.set(site.id, a); }
        if (items.length >= K.MAX_ITEMS) break;
      }
      for (const a of byField.values()) { const s = a.site, pr = world.pressureOf(s.id); items.push({ k: 'ell', x: s.x, y: s.y, r: s.radius, fill: 'rgba(80,200,120,.07)', stroke: 'rgba(109,255,154,.55)', dash: [4, 4], w: 1.2, sid: s.id, label: 'ضغط ' + pct(pr == null ? 1 : pr) + '% · نضوب ' + (s.props.decline * 100).toFixed(0) + '%/سنة · مياه ' + pct(a.out ? a.wc / a.out : s.props.waterCut) + '% · ' + a.on + '/' + a.n + ' آبار تعمل' }); }
      return { items };
    };
    L.PIPELINES = v => {
      const items = [], CAPS = CFG && require_pipes();
      for (const ln of pipes.lines.values()) {
        if (!ln.path.length || items.length >= K.MAX_ITEMS) continue; const p0 = ln.path[0], p1 = ln.path[ln.path.length - 1]; if (!inView(p0[0], p0[1], v, 120) && !inView(p1[0], p1[1], v, 120) && !inView((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, v, 60)) continue;
        const cap = (CAPS[ln.dia] || CAPS[24] || { capacity: 1 }).capacity, flow = ln.flow || 0, use = cap ? flow / cap : 0, jam = ln.over || use >= K.HOT, cut = flow <= 1e-6 && endpointOutputs(ln);
        items.push({ k: 'line', pts: ln.path.map(p => [p[0] + .5, p[1] + .5]), c: jam ? '#ff5c5c' : cut ? '#ffb347' : flow > 0 ? '#4fc3f7' : 'rgba(150,170,190,.7)', w: 2.5 + Math.min(3, (ln.dia || 12) / 14), dash: cut ? [4, 4] : null, arrow: flow > 0, lid: ln.id, flow: Math.round(flow), cap, use, jam, cut, label: nf(flow) + ' / ' + nf(cap) + ' برميل/يوم' });
      }
      for (const b of store.list()) { const def = DEFSB[b.d]; if (!def || def.type !== 'pump' || !inView(b.x, b.y, v, 4)) continue; const st = sim.status(b); items.push({ k: 'dot', id: b.id, x: b.x + 1, y: b.y + 1, c: st === 'RUNNING' ? '#4fc3f7' : '#ff8a80', r: 7, sym: 'P', label: def.name + ' · ' + (STATUS_AR[st] || st), status: st }); }
      return { items };
    };
    L.LAND = v => {
      const items = [];
      for (const r of regionsIn(v)) {
        const z = world.zoneInfo(r.id); if (!z) continue; const owned = z.unlocked, nearOpen = !owned && world.regions.some(q => q.unlocked && Math.abs(q.rx - r.rx) + Math.abs(q.ry - r.ry) === 1);
        const col = owned ? '#4ade80' : nearOpen ? '#f0be28' : '#7d8794';
        items.push({ k: 'rect', x: r.x0, y: r.y0, w: r.w, h: r.h, fill: col, a: owned ? .13 : nearOpen ? .08 : .05, stroke: col, w2: owned ? 2.5 : 1.4, dash: owned ? null : [8, 6], rid: r.id, owned, available: nearOpen, label: r.name + ' · ' + (owned ? 'ضمن امتيازك' : nearOpen ? 'متاحة للاستكشاف · $' + nf(z.exploreCost) : 'غير متاحة بعد') });
      }
      return { items, note: 'عروض البيع والاستثمار: لا توجد حاليًا (تُضاف في المرحلة السابعة)' };
    };
    const STATUS_AR = { RUNNING: 'يعمل', READY: 'جاهز', OFFLINE: 'متوقف', NO_INPUT: 'لا يصله نفط', BLOCKED: 'مسدود', DAMAGED: 'معطل', LOW_PRESSURE: 'ضغط منخفض', OVER_CAPACITY: 'فوق السعة', NO_OUTPUT: 'غير متصل', DEPLETED: 'نضب الحقل', UNDER_CONSTRUCTION: 'قيد البناء' };
    function require_pipes() { return (typeof require === 'function' && typeof module !== 'undefined') ? require('./building-config.js').PIPES : root.OliBuildingConfig.PIPES; }
    /* a pipe whose source end produces something but delivers nothing: broken or cut */
    function endpointOutputs(ln) { for (const e of [ln.a, ln.b]) { if (!e || !e.b) continue; const b = store.get(e.b); if (!b || !b.s) continue; if ((b.s._out || 0) > 0) return true; if (b.st === 'DAMAGED') return true; } return false; }

    /* =========================================================================================== answers to a tap */
    function inspect(x, y, ids) {
      const act = ids && ids.length ? ids : [...on], has = k => act.includes(k), out = [];
      const b = store.at(Math.floor(x), Math.floor(y)), ln = pipes.lineAt(Math.floor(x), Math.floor(y));
      if (b && DEFSB[b.d] && DEFSB[b.d].type === 'well' && (has('PRODUCTION') || has('FIELDS') || has('INFRA'))) {
        const s = b.s || {}, site = siteOfWell(b), oil = (s._out || 0) * (1 - (s._wc || 0) - (s._gas || 0));
        out.push({ kind: 'well', id: b.id, title: 'بئر نفط', rows: [['الحالة', STATUS_AR[sim.status(b)] || sim.status(b)], ['الإنتاج اليومي (نفط)', nf(oil) + ' برميل'], ['الإنتاج الكلي (سائل)', nf(s._out || 0) + ' برميل/يوم'], ['نسبة المياه', pct(s._wc || 0) + '%'], ['ضغط رأس البئر', nf(s._p || 0) + ' psi']].concat(site ? [['ضغط المكمن', pct(world.pressureOf(site.id)) + '%'], ['الاحتياطي المتبقي للحقل', nf(site.remainingReserve) + ' برميل'], ['عمق المكمن', nf(site.depth) + ' م']] : []) });
      }
      if (ln && (has('PIPELINES') || has('INFRA'))) {
        const cap = (require_pipes()[ln.dia] || {}).capacity || 0, flow = ln.flow || 0;
        out.push({ kind: 'pipe', id: ln.id, title: 'خط أنابيب', rows: [['القطر', ln.dia + '"'], ['الطول', ln.path.length * CFG.SCALE.TILE_M + ' م'], ['التدفق', nf(flow) + ' برميل/يوم'], ['السعة', nf(cap) + ' برميل/يوم'], ['الاستخدام', cap ? pct(flow / cap) + '%' : '-'], ['الحالة', ln.over || (cap && flow / cap >= K.HOT) ? 'اختناق' : flow > 0 ? 'يعمل' : endpointOutputs(ln) ? 'منقطع (المصدر ينتج ولا يصل شيء)' : 'لا تدفق'], ['الضغط', nf(ln.pressure || 0) + ' psi']] });
      }
      if (b && !(DEFSB[b.d] && DEFSB[b.d].type === 'well') && (has('INFRA') || has('PIPELINES'))) out.push({ kind: 'building', id: b.id, title: DEFSB[b.d].name, rows: [['الحالة', STATUS_AR[sim.status(b)] || sim.status(b)], ['السلامة', pct(b.c) + '%']] });
      const f = world.sitesNear(Math.floor(x), Math.floor(y), 3).find(s => { const vi = world.visibleInfo(s.id); const ind = vi && vi.indicator; return vi && Math.hypot((ind ? ind.x : s.x) - x, (ind ? ind.y : s.y) - y) <= (ind ? ind.r : s.radius); });
      if (f && (has('FIELDS') || has('EXPLORATION') || has('PRODUCTION') || has('GEOLOGY'))) {
        const vi = world.visibleInfo(f.id), st = world.stateOf(f.id); const rows = [['الحالة', stateAr[st]]];
        if (st === 'DISCOVERED') rows.push(['المعلومات', 'جيولوجيا واعدة — الحجم والعمق غير معروفين']);
        else if (vi.dry) rows.push(['نتيجة المسح', 'لا نفط تجاري']);
        else { rows.push(['الاحتياطي المقدّر', nf(vi.estimatedReserve) + ' برميل (من ' + nf(vi.reserveRange[0]) + ' إلى ' + nf(vi.reserveRange[1]) + ')'], ['نوع النفط', vi.quality], ['احتمال النجاح', pct(vi.probability) + '%']);
          if (vi.depth != null) rows.push(['عمق المكمن', nf(vi.depth) + ' م'], ['الاحتياطي المتبقي', nf(vi.remainingReserve) + ' برميل'], ['الاستنزاف', vi.depletionPct + '%'], ['ضغط المكمن', pct(world.pressureOf(f.id)) + '%'], ['آبار الحقن', (f.injectors || 0) + ''], ['تكلفة الرفع', '$' + (vi.extractionCost * world.liftFactor(f.id) / (f.props.extractCost / CFG.PRODUCTION.EXTRACT_REF || 1)).toFixed(1) + '/برميل']); }
        out.push({ kind: 'field', id: f.id, title: vi && vi.dry ? 'موقع غير اقتصادي' : 'حقل نفط', rows });
      }
      const rid = world.regionIdAt(clamp(Math.floor(x), 0, world.W - 1), clamp(Math.floor(y), 0, world.H - 1));
      if (!out.length && rid != null && rid >= 0) {
        const z = world.zoneInfo(rid);
        if (z && (has('EXPLORATION') || has('LAND'))) out.push({ kind: 'region', id: rid, title: 'منطقة ' + z.name, rows: [['النوع', KINDAR[z.kind] || z.kind], ['الحالة', z.unlocked ? 'ضمن امتيازك' : 'غير مفتوحة'], ['التقييم', z.evaluated ? (z.commercial === false ? 'غير اقتصادية' : classAr[z.potentialClass]) : 'لم تُقيَّم (تقدير أولي: ' + classAr[z.potentialClass] + ')'], ['الاحتياطي المتوقع', nf(z.reserveRange[0]) + ' – ' + nf(z.reserveRange[1]) + ' برميل'], ['عمق الآبار', nf(z.depthRange[0]) + ' – ' + nf(z.depthRange[1]) + ' م'], ['التكوين', z.geology.formation], ['تكلفة الاستكشاف', '$' + nf(z.exploreCost)]] });
      }
      if (has('GEOLOGY')) { const g = geology(Math.floor(x), Math.floor(y)); out.push({ kind: 'geology', title: 'جيولوجيا الموقع', rows: [['الصخر السطحي', g.label], ['أعلى المكمن', nf(g.reservoirTop) + ' م'], ['أسفل المكمن', nf(g.reservoirBottom) + ' م']] }); }
      if (has('TERRAIN')) { const t = world.tile(Math.floor(x), Math.floor(y)); if (t) { const c = TERCLS(t); out.push({ kind: 'terrain', title: 'التضاريس', rows: [['النوع', c[1]], ['مستوى الارتفاع', t.level + ' من 7'], ['الانحدار', Math.round(t.slope)]] }); } }
      return out;
    }

    /* =========================================================================================== geological section between two tiles */
    function section(a, b, n) {
      n = n || 48; const len = Math.hypot(b.x - a.x, b.y - a.y); if (len < 1) return null; const pts = [];
      for (let i = 0; i <= n; i++) { const t = i / n, x = lerp(a.x, b.x, t), y = lerp(a.y, b.y, t), tl = world.tile(Math.round(x), Math.round(y)), col = column(x, y); pts.push({ t, dist: t * len * CFG.SCALE.TILE_M, x, y, surface: tl ? tl.elevation * K.ELEV_M : 0, stack: col.stack.map(l => [l.top, l.bottom === Infinity ? K.SECTION_MAX_DEPTH : Math.min(l.bottom, K.SECTION_MAX_DEPTH)]), terrain: tl ? tl.terrain : null }); }
      const along = (x, y) => { const vx = b.x - a.x, vy = b.y - a.y, t = ((x - a.x) * vx + (y - a.y) * vy) / (len * len), px = a.x + t * vx, py = a.y + t * vy; return { t, off: Math.hypot(x - px, y - py) }; };
      const faults = [], seen = new Set(); for (const p of pts) for (const f of faultsNear(p.x, p.y, 60)) { if (seen.has(f.id)) continue; seen.add(f.id); const d1x = b.x - a.x, d1y = b.y - a.y, d2x = f.x2 - f.x1, d2y = f.y2 - f.y1, den = d1x * d2y - d1y * d2x; if (Math.abs(den) < 1e-9) continue; const t = ((f.x1 - a.x) * d2y - (f.y1 - a.y) * d2x) / den, u = ((f.x1 - a.x) * d1y - (f.y1 - a.y) * d1x) / den; if (t >= 0 && t <= 1 && u >= 0 && u <= 1) faults.push({ id: f.id, t, dist: t * len * CFG.SCALE.TILE_M, throwM: f.throwM }); }
      const fields = []; for (const q of knownFields({ x0: Math.min(a.x, b.x) - 40, y0: Math.min(a.y, b.y) - 40, x1: Math.max(a.x, b.x) + 40, y1: Math.max(a.y, b.y) + 40 })) { const { s, vi } = q; const al = along(s.x, s.y); if (al.t < -.02 || al.t > 1.02 || al.off > s.radius || vi.dry) continue; const c = column(s.x, s.y); fields.push({ id: s.id, t: al.t, dist: al.t * len * CFG.SCALE.TILE_M, halfWidth: Math.sqrt(Math.max(0, s.radius * s.radius - al.off * al.off)) * CFG.SCALE.TILE_M, top: c.reservoirTop, bottom: c.reservoirBottom, state: q.st, fill: vi.remainingReserve != null ? clamp(s.remainingReserve / Math.max(1, s.initialReserve), 0, 1) : null, depth: vi.depth != null ? vi.depth : null }); }
      const wells = []; for (const w of wellsOnMap()) { const al = along(w.x + .5, w.y + .5); if (al.t < 0 || al.t > 1 || al.off > 5) continue; const site = siteOfWell(w); wells.push({ id: w.id, t: al.t, dist: al.t * len * CFG.SCALE.TILE_M, depth: site ? site.depth : null, status: sim.status(w), out: Math.round((w.s && w.s._out) || 0) }); }
      return { a, b, lengthM: Math.round(len * CFG.SCALE.TILE_M), maxDepth: K.SECTION_MAX_DEPTH, points: pts, faults, fields, wells, rocks: Object.fromEntries(Object.keys(ROCK).map(k => [k, { ar: ROCK[k].ar, color: ROCK[k].color }])) };
    }

    /* =========================================================================================== legends, switches, the one entry point used by the renderer */
    const LEGEND = {
      TERRAIN: [['#cfac72', 'سهل مستوٍ'], ['#e5c284', 'كثبان رملية'], ['#a89868', 'وادٍ منخفض'], ['#a38262', 'تلال وارتفاعات'], ['#6b5a4c', 'جبال وهضاب'], ['#3a708a', 'ماء / وادٍ']],
      INFRA: [['#d9962b', 'بئر'], ['#7cc4ff', 'محطة ضخ'], ['#b08be6', 'مصفاة'], ['#6faa7d', 'معالجة'], ['#8f9aa6', 'خزان'], ['rgba(196,164,112,.9)', 'طريق']],
      GEOLOGY: [['rgb(226,205,150)', 'رواسب'], ['rgb(196,205,190)', 'حجر جيري'], ['rgb(214,160,110)', 'حجر رملي'], ['rgb(140,128,126)', 'طفل'], ['#ff5c5c', 'صدع'], ['#ffc05a', 'تركيب مكمن']],
      EXPLORATION: [['#4ade80', 'غنية'], ['#9be15d', 'واعدة'], ['#e6c35a', 'متوسطة'], ['#c9a24a', 'ضعيفة'], ['#8a8a8a', 'غير اقتصادية'], ['#9aa4ae', 'لم تُقيَّم']],
      FIELDS: [['#e6c35a', 'مكتشف'], ['#e69a4a', 'تم مسحه'], ['#ffb030', 'جاهز للحفر'], ['#6dff9a', 'ينتج'], ['#777777', 'نضب']],
      PRODUCTION: [['#6dff9a', 'بئر منتج'], ['#ff8a80', 'بئر متوقف'], ['#777', 'منضب']],
      PIPELINES: [['#4fc3f7', 'تدفق طبيعي'], ['#ff5c5c', 'اختناق'], ['#ffb347', 'انقطاع'], ['rgba(150,170,190,.7)', 'بلا تدفق']],
      LAND: [['#4ade80', 'ضمن امتيازك'], ['#f0be28', 'متاحة للاستكشاف'], ['#7d8794', 'غير متاحة']]
    };
    const set = (id, v) => { if (!DEFS[id]) return false; if (v) on.add(id); else on.delete(id); return true; };
    function features(id, vw) {
      if (!L[id]) return { items: [] }; const t0 = (typeof performance !== 'undefined' ? performance : Date).now(), r = L[id](view(vw)); const ms = (typeof performance !== 'undefined' ? performance : Date).now() - t0;
      stats.byLayer[id] = { ms: +ms.toFixed(2), items: r.items.length }; stats.lastMs = ms; stats.lastItems = r.items.length; return r;
    }
    function all(vw) { const out = {}, t0 = Date.now(); let n = 0; for (const id of IDS) if (on.has(id)) { out[id] = features(id, vw); n += out[id].items.length; } stats.totalMs = Date.now() - t0; stats.totalItems = n; return out; }
    return { DEFS, IDS, K, ROCK, on, set, toggle: id => { set(id, !on.has(id)); return on.has(id); }, features, all, inspect, section, geology, column, faultsOf, legend: id => LEGEND[id] || [], stats, STATUS_AR, stateAr, classAr };
  }
  const api = { create, DEFS, IDS, ROCK, K };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OliMapLayers = api;
})(typeof window !== 'undefined' ? window : globalThis);
