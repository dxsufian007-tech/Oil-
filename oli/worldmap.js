/* Oli - WORLD MAP / OIL FIELDS (isolated module, branch feature/map-oil-fields).
   Nothing here imports or changes core.js, v2.js, the camera, placement, pipes, hydraulics, economy, market or save/load.
   It is a pure, seeded, lazy world model: the same seed gives the same world, chunk by chunk, so a ~200x world (1920 x 1280 tiles = 199.5x the
   140 x 88 game map) is never held in memory at once.

   Architecture
     World  ->  Region (5 x 5 chunks, 320 x 320 tiles)  ->  Chunk (64 x 64 tiles: terrain, elevation, slope)
     Terrain   FLAT_DESERT | SAND_DUNES | ROCKY_GROUND | ROCKY_RIDGE | LOW_VALLEY | WATER   (type, visual, buildability, cost modifier, oil modifier, elevation)
     Sites     OilField (SMALL | MEDIUM | LARGE | MAJOR) and DRY prospects; each region has them, generated from a region seed (so they never depend on other regions)
     Discovery UNDISCOVERED -> DISCOVERED -> SURVEYED -> DRILLABLE -> DEPLETED   (what the player may see is decided by visibleInfo(), never by the renderer)
     Zones     BuildingZone (what can be built where: footprint, ports, terrain compatibility, slope, cost modifier) and refinery zones (large flat, with room to grow)
     Layers    NORMAL (implemented) + OIL / PRESSURE / FLOW / TERRAIN (interfaces only)
     Adapter   toLegacyWindow() gives a 140 x 88 window in the arrays the current Game uses; WellLink binds a well to a field (data only, not called by the game).
   Every number in CONFIG is meant to be tuned later. Elevation is a value used for shading / gameplay data; tiles are NOT lifted on screen, so the existing
   isometric picking (toTile) stays exact. */
(function (root) {
  'use strict';
  const CONFIG = {
    CHUNK: 64, REGION_CHUNKS: 5, CHUNKS_X: 30, CHUNKS_Y: 20,                    // 1920 x 1280 tiles
    LEGACY: { W: 140, H: 88 },                                                  // the current game map, for the scale statement and the adapter
    TERRAIN: {                                                                  // id order is the id stored in chunks
      FLAT_DESERT: { id: 0, label: 'Flat desert', buildable: true,  buildCost: 1.0, oilMod: 1.0,  maxSlope: 6,  color: [217, 185, 122] },
      SAND_DUNES:  { id: 1, label: 'Sand / dunes', buildable: true, buildCost: 1.1, oilMod: 0.9,  maxSlope: 8,  color: [230, 200, 138] },
      ROCKY_GROUND:{ id: 2, label: 'Rocky ground', buildable: true, buildCost: 1.2, oilMod: 1.15, maxSlope: 10, color: [168, 136, 100] },
      ROCKY_RIDGE: { id: 3, label: 'Rocky ridge', buildable: true,  buildCost: 1.4, oilMod: 0.4,  maxSlope: 14, color: [124, 96, 72] },
      LOW_VALLEY:  { id: 4, label: 'Low valley', buildable: true,   buildCost: 1.1, oilMod: 1.5,  maxSlope: 6,  color: [168, 164, 104], special: 'valley: may flood later, best oil odds' },
      WATER:       { id: 5, label: 'Water', buildable: false,       buildCost: 0,   oilMod: 0,    maxSlope: 0,  color: [47, 111, 143] }
    },
    SLOPE_K: 3,                                                                     // slope units per "maxSlope" step (slope values are 0..~45, 90% below 20)
    ELEV_LEVELS: 8,                                                             // elevation is also reported as a coarse level 0..7 (the "height" concept)
    OILFIELD: {                                                                 // reserve in barrels, radius in tiles, pressure in bar, depth in metres
      SMALL:  { weight: 0.52, reserve: [0.5e6, 3e6],    radius: [3, 5],   pressure: [40, 90],   depth: [300, 1200],  prod: 'low' },
      MEDIUM: { weight: 0.30, reserve: [3e6, 15e6],     radius: [5, 8],   pressure: [60, 130],  depth: [600, 2200],  prod: 'normal' },
      LARGE:  { weight: 0.14, reserve: [15e6, 80e6],    radius: [8, 12],  pressure: [90, 170],  depth: [1200, 3600], prod: 'high' },
      MAJOR:  { weight: 0.04, reserve: [80e6, 400e6],   radius: [12, 18], pressure: [130, 220], depth: [2000, 5000], prod: 'very high' }
    },
    RICHNESS: { POOR: { mult: 0.55, fields: [3, 5] }, MEDIUM: { mult: 1.0, fields: [6, 9] }, RICH: { mult: 1.6, fields: [10, 14] } },
    DRY_RATIO: 0.6,                                                             // dry "promising" zones per real field
    MIN_GAP: 3,                                                                 // tiles between two oil sites
    DRILL: { baseCostPer100m: 1500, preview: true },                            // estimated cost = depth/100 x base x terrain cost; PREVIEW ONLY, never charged
    ZONES: { REFINERY: { w: 24, h: 16, maxSlope: 3, margin: 8 } },
    FACILITIES: {                                                               // footprint [w,h], terrain compatibility, ports (side: in / out) - ports are data for the later systems
      well:      { fp: [1, 1],  maxSlope: 8,  ports: { all: 'out' } },
      pump:      { fp: [1, 1],  maxSlope: 6,  ports: { axis: ['in', 'out'] } },
      valve:     { fp: [1, 1],  maxSlope: 6,  ports: { axis: ['in', 'out'] } },
      junction:  { fp: [1, 1],  maxSlope: 8,  ports: { all: 'both' } },
      tank:      { fp: [2, 2],  maxSlope: 5,  ports: { all: 'in' } },
      gasStorage:      { fp: [3, 3], maxSlope: 3, ports: { all: 'in' } },
      dieselStorage:   { fp: [3, 3], maxSlope: 3, ports: { all: 'in' } },
      gasolineStorage: { fp: [3, 3], maxSlope: 3, ports: { all: 'in' } },
      productStorage:  { fp: [3, 3], maxSlope: 3, ports: { all: 'both' } },
      power:     { fp: [4, 4],  maxSlope: 3,  ports: { all: 'out' }, terrains: ['FLAT_DESERT', 'SAND_DUNES', 'ROCKY_GROUND'] },
      export:    { fp: [5, 4],  maxSlope: 2,  ports: { all: 'out' }, terrains: ['FLAT_DESERT', 'SAND_DUNES'] },
      refinery:  { fp: [6, 5],  maxSlope: 2,  ports: { all: 'both' }, terrains: ['FLAT_DESERT', 'SAND_DUNES'], needsZone: 'REFINERY' }
    },
    ZOOM: { MIN: 0.0038, MAX: 2.0, FAR: { max: 0.2 }, MEDIUM: { min: 0.2, max: 0.6 }, CLOSE: { min: 0.6 } }   // camera zoom -> level (the preview uses the same table)
  };
  const T = CONFIG.TERRAIN, TNAME = Object.keys(T), TBYID = []; for (const k of TNAME) TBYID[T[k].id] = k;
  const STATES = ['UNDISCOVERED', 'DISCOVERED', 'SURVEYED', 'DRILLABLE', 'DEPLETED'];
  const LAYERS = { NORMAL: { implemented: true }, OIL: { implemented: false }, PRESSURE: { implemented: false }, FLOW: { implemented: false }, TERRAIN: { implemented: false } };

  // ---------------------------------------------------------------- noise (pure functions of seed + coordinates)
  const imul = Math.imul;
  function hash(seed, x, y) { let h = imul(x | 0, 374761393) + imul(y | 0, 668265263) + imul(seed | 0, 1442695041) | 0; h = imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  const fade = t => t * t * (3 - 2 * t);
  function vnoise(seed, x, y) { const x0 = Math.floor(x), y0 = Math.floor(y), fx = fade(x - x0), fy = fade(y - y0); const a = hash(seed, x0, y0), b = hash(seed, x0 + 1, y0), c = hash(seed, x0, y0 + 1), d = hash(seed, x0 + 1, y0 + 1); return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; }
  function fbm(seed, x, y, oct) { let v = 0, amp = .5, f = 1, n = 0; for (let i = 0; i < oct; i++) { v += amp * vnoise(seed + i * 101, x * f, y * f); n += amp; amp *= .5; f *= 2; } return v / n; }
  function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = imul(a ^ a >>> 15, 1 | a); t = t + imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v, clamp01 = v => clamp(v, 0, 1);

  function createWorld(opts) {
    opts = opts || {}; const seed = (opts.seed == null ? 20260101 : opts.seed) | 0, C = CONFIG.CHUNK, RC = CONFIG.REGION_CHUNKS;
    const W = CONFIG.CHUNKS_X * C, H = CONFIG.CHUNKS_Y * C, RX = CONFIG.CHUNKS_X / RC, RY = CONFIG.CHUNKS_Y / RC;
    const S = { elev: seed ^ 0x1111, elev2: seed ^ 0x2222, mount: seed ^ 0x3333, ridge: seed ^ 0x4444, sand: seed ^ 0x5555, rock: seed ^ 0x6666, coast: seed ^ 0x7777, basin: seed ^ 0x8888, struct: seed ^ 0x9999, rich: seed ^ 0xaaaa, kind: seed ^ 0xbbbb };
    const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

    // ---- raw continuous fields at one tile
    const coastLine = y => 70 + 55 * vnoise(S.coast, y / 140, 0) + 25 * vnoise(S.coast + 1, y / 40, 3);          // water lies west of this x
    function elevAt(x, y) {
      const base = .52 * fbm(S.elev, x / 300, y / 300, 3) + .30 * fbm(S.elev2, x / 95, y / 95, 3) + .18 * fbm(S.elev2 + 7, x / 28, y / 28, 2);
      const mask = clamp01((fbm(S.mount, x / 420, y / 420, 2) - .42) * 4.2);                                          // where mountain belts are
      const ridge = 1 - Math.abs(2 * fbm(S.ridge, x / 150, y / 150, 3) - 1);
      let e = (base - .26) / .5 + .42 * mask * ridge * ridge;
      const cl = coastLine(y); if (x < cl + 40) e -= (1 - clamp01((x - cl + 6) / 46)) * .35;                      // the land slopes into the sea
      return clamp01(e);
    }
    function classify(x, y, e) {
      if (x < coastLine(y)) return T.WATER.id;
      if (e > .80) return T.ROCKY_RIDGE.id;
      if (e > .66 || (e > .42 && fbm(S.rock, x / 22, y / 22, 2) > .68)) return T.ROCKY_GROUND.id;
      if (e < .34) return T.LOW_VALLEY.id;
      if (fbm(S.sand, x / 70, y / 70, 2) > .60) return T.SAND_DUNES.id;
      return T.FLAT_DESERT.id;
    }

    // ---- chunks (lazy, cached; a 1-tile margin of elevation gives the slope without touching neighbours)
    const chunks = new Map(); let chunkGen = 0;
    function chunk(cx, cy) {
      if (cx < 0 || cy < 0 || cx >= CONFIG.CHUNKS_X || cy >= CONFIG.CHUNKS_Y) return null;
      const key = cy * CONFIG.CHUNKS_X + cx; let ch = chunks.get(key); if (ch) return ch;
      const m = C + 2, el = new Float32Array(m * m); for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) el[j * m + i] = elevAt(cx * C + i - 1, cy * C + j - 1);
      const ter = new Uint8Array(C * C), elv = new Uint8Array(C * C), slope = new Uint8Array(C * C);
      for (let j = 0; j < C; j++) for (let i = 0; i < C; i++) {
        const x = cx * C + i, y = cy * C + j, e = el[(j + 1) * m + i + 1], k = j * C + i;
        ter[k] = classify(x, y, e); elv[k] = Math.round(e * 255);
        const dx = el[(j + 1) * m + i + 2] - el[(j + 1) * m + i], dy = el[(j + 2) * m + i + 1] - el[j * m + i + 1]; slope[k] = Math.min(255, Math.round(Math.hypot(dx, dy) * 255 / 2 * 6));   // 0..255 (steepness x6)
      }
      ch = { cx, cy, terrain: ter, elev: elv, slope }; chunks.set(key, ch); chunkGen++; if (chunks.size > 160) chunks.delete(chunks.keys().next().value);      // small LRU
      return ch;
    }
    function tile(x, y) {
      x |= 0; y |= 0; if (!inb(x, y)) return null; const ch = chunk((x / C) | 0, (y / C) | 0), k = (y % C) * C + (x % C), t = TBYID[ch.terrain[k]], e = ch.elev[k] / 255;
      return { x, y, terrain: t, id: ch.terrain[k], elevation: e, level: Math.min(CONFIG.ELEV_LEVELS - 1, Math.floor(e * CONFIG.ELEV_LEVELS)), slope: ch.slope[k], region: regionIdAt(x, y) };
    }

    // ---- regions
    const KINDS = ['DESERT PLAINS', 'DUNE SEA', 'ROCKY BADLANDS', 'MOUNTAIN BELT', 'VALLEY BASIN', 'HIGH PLATEAU', 'COASTAL SHELF'];
    const regions = []; for (let ry = 0; ry < RY; ry++) for (let rx = 0; rx < RX; rx++) {
      const id = ry * RX + rx, h = hash(S.rich, rx, ry), starter = rx === 2 && ry === 2;
      const richness = starter ? 'MEDIUM' : h < .30 ? 'POOR' : h < .72 ? 'MEDIUM' : 'RICH';
      const cxm = (rx + .5) * RC * C, cym = (ry + .5) * RC * C, e = elevAt(cxm, cym), coastal = rx === 0;
      const kind = coastal ? 'COASTAL SHELF' : e > .62 ? 'MOUNTAIN BELT' : e < .38 ? 'VALLEY BASIN' : KINDS[Math.floor(hash(S.kind, rx, ry) * 5)];
      regions.push({ id, rx, ry, x0: rx * RC * C, y0: ry * RC * C, w: RC * C, h: RC * C, kind, richness, starter, unlocked: starter || (Math.abs(rx - 2) + Math.abs(ry - 2) === 1 ? true : false), name: String.fromCharCode(65 + ry) + (rx + 1) });
    }
    function regionIdAt(x, y) { return Math.floor(y / (RC * C)) * RX + Math.floor(x / (RC * C)); }

    // ---- oil geology: the chance of oil at a point. Several independent layers, no single rule (valleys help, ridges hurt, but a basin or a structure can override)
    function oilProbability(x, y) {
      if (!inb(x, y)) return 0; const t = tile(x, y), tm = T[t.terrain].oilMod; if (!tm) return 0;
      const reg = regions[regionIdAt(x, y)], rich = CONFIG.RICHNESS[reg.richness].mult;
      const basin = clamp01((fbm(S.basin, x / 210, y / 210, 3) - .30) * 2.1), struct = .45 + .85 * fbm(S.struct, x / 55, y / 55, 2);
      return clamp01(tm * rich * basin * struct * .75);
    }

    // ---- sites (oil fields + dry prospects), per region, deterministic from the region seed only
    const siteCache = new Map();
    function pickType(rng, p, rich) { const W_ = CONFIG.OILFIELD; let w = {}; let tot = 0; for (const k in W_) { let v = W_[k].weight; if (k === 'MAJOR') v *= p > .62 ? 2.2 * rich : .15; if (k === 'LARGE') v *= .5 + p; w[k] = v; tot += v; } let r = rng() * tot; for (const k in w) { r -= w[k]; if (r <= 0) return k; } return 'SMALL'; }
    function regionSites(rid) {
      if (siteCache.has(rid)) return siteCache.get(rid); const reg = regions[rid], rng = mulberry32((seed ^ 0x5eed) + rid * 7919), R = CONFIG.RICHNESS[reg.richness], out = [];
      const nReal = R.fields[0] + Math.floor(rng() * (R.fields[1] - R.fields[0] + 1)), nDry = Math.round(nReal * CONFIG.DRY_RATIO), want = nReal + nDry, margin = 22;
      const spaced = (x, y, r) => out.every(s => Math.hypot(s.x - x, s.y - y) >= s.radius + r + CONFIG.MIN_GAP);
      let tries = 0, real = 0, dry = 0;
      while ((real < nReal || dry < nDry) && tries++ < 3000) {
        const x = reg.x0 + margin + Math.floor(rng() * (reg.w - 2 * margin)), y = reg.y0 + margin + Math.floor(rng() * (reg.h - 2 * margin)), p = oilProbability(x, y), isDry = real >= nReal || (dry < nDry && rng() < .3);
        if (rng() > Math.pow(p, isDry ? .8 : 1.15) * 1.6) continue;                                   // a prospect needs a decent geology score; dry prospects look just as good
        const typeKey = isDry ? 'SMALL' : pickType(rng, p, R.mult), spec = CONFIG.OILFIELD[typeKey], radius = Math.round(spec.radius[0] + rng() * (spec.radius[1] - spec.radius[0]));
        if (!tile(x, y) || tile(x, y).terrain === 'WATER' || !spaced(x, y, radius)) continue;
        const u = rng(), reserve = isDry ? 0 : Math.round(spec.reserve[0] * Math.pow(spec.reserve[1] / spec.reserve[0], u));
        const deep = typeKey === 'LARGE' || typeKey === 'MAJOR' ? rng() < .5 : rng() < .15, depth = Math.round(spec.depth[0] + (spec.depth[1] - spec.depth[0]) * clamp01((deep ? .55 : .0) + rng() * (deep ? .45 : .5)));
        const q = rng(), quality = q < .3 ? 'LOW' : q < .8 ? 'MEDIUM' : 'HIGH', pr = Math.round(spec.pressure[0] + (spec.pressure[1] - spec.pressure[0]) * clamp01(.35 * u + .65 * rng()));
        const id = 'F' + rid + '-' + out.length, err = .15 + rng() * .25, bias = (rng() * 2 - 1) * err;
        out.push({ id, kind: isDry ? 'DRY' : 'FIELD', regionId: rid, x, y, radius, type: isDry ? 'PROSPECT' : typeKey, initialReserve: reserve, remainingReserve: reserve, estimatedReserve: Math.round(reserve * (1 + bias)), estimateError: err,
          pressurePotential: isDry ? 0 : pr, quality: isDry ? null : quality, depth: isDry ? Math.round(300 + rng() * 1800) : depth, terrainType: tile(x, y).terrain, geologyScore: +p.toFixed(3),
          indicator: { dx: Math.round((rng() * 2 - 1) * radius * .5), dy: Math.round((rng() * 2 - 1) * radius * .5), r: Math.round(radius * 1.6 + 2) } });
        if (isDry) dry++; else real++;
      }
      siteCache.set(rid, out); return out;
    }
    const allSites = () => { const o = []; for (const r of regions) for (const s of regionSites(r.id)) o.push(s); return o; };
    const siteById = id => { const m = /^F(\d+)-/.exec(id); return m ? regionSites(+m[1]).find(s => s.id === id) || null : null; };
    const sitesNear = (x, y, rad) => { const out = [], r0 = Math.max(0, regionIdAt(clamp(x - rad, 0, W - 1), clamp(y - rad, 0, H - 1))), seen = new Set(); for (const dx of [-rad, 0, rad]) for (const dy of [-rad, 0, rad]) { const px = clamp(x + dx, 0, W - 1), py = clamp(y + dy, 0, H - 1), rid = regionIdAt(px, py); if (seen.has(rid)) continue; seen.add(rid); for (const s of regionSites(rid)) if (Math.hypot(s.x - x, s.y - y) <= rad + s.radius) out.push(s); } return out; };

    // ---- discovery (data + rules only; nothing is charged)
    const progress = new Map();                                                    // site id -> state; absent = UNDISCOVERED
    const stateOf = id => progress.get(id) || 'UNDISCOVERED';
    function advance(id, to) {
      const s = siteById(id); if (!s) return { ok: false, reason: 'unknown' }; const cur = stateOf(id), ci = STATES.indexOf(cur), ti = STATES.indexOf(to);
      if (ti !== ci + 1) return { ok: false, reason: 'order', from: cur, to };
      if (to === 'DRILLABLE' && s.kind === 'DRY') return { ok: false, reason: 'dry' };
      if (to === 'DEPLETED' && s.remainingReserve > 0) return { ok: false, reason: 'notEmpty' };
      progress.set(id, to); return { ok: true, from: cur, to };
    }
    const discover = id => advance(id, 'DISCOVERED'), survey = id => advance(id, 'SURVEYED'), makeDrillable = id => advance(id, 'DRILLABLE'), deplete = id => advance(id, 'DEPLETED');
    function drillEstimate(s) { return Math.round(s.depth / 100 * CONFIG.DRILL.baseCostPer100m * T[s.terrainType].buildCost); }
    /* what the PLAYER may know. UNDISCOVERED -> null (not even that it exists). Nothing else leaks: no reserve, type or exact position before SURVEYED. */
    function visibleInfo(id) {
      const s = siteById(id); if (!s) return null; const st = stateOf(id);
      if (st === 'UNDISCOVERED') return null;
      if (st === 'DISCOVERED') return { id, state: st, indicator: { x: s.x + s.indicator.dx, y: s.y + s.indicator.dy, r: s.indicator.r }, hint: 'promising geology' };
      const base = { id, state: st, x: s.x, y: s.y, radius: s.radius, terrain: s.terrainType };
      if (s.kind === 'DRY') return Object.assign(base, { dry: true, note: 'no commercial oil' });
      const lo = Math.round(s.estimatedReserve * (1 - s.estimateError)), hi = Math.round(s.estimatedReserve * (1 + s.estimateError));
      const out = Object.assign(base, { type: s.type, estimatedReserve: s.estimatedReserve, reserveRange: [lo, hi], pressureClass: s.pressurePotential > 150 ? 'HIGH' : s.pressurePotential > 90 ? 'MEDIUM' : 'LOW', quality: s.quality, probability: +(0.55 + 0.4 * (1 - s.estimateError)).toFixed(2) });
      if (st === 'DRILLABLE' || st === 'DEPLETED') Object.assign(out, { depth: s.depth, pressurePotential: s.pressurePotential, estimatedCost: drillEstimate(s), costNote: 'estimate only, not charged', remainingReserve: s.remainingReserve });
      return out;
    }
    const progressSnapshot = () => Array.from(progress.entries()).sort();
    const restoreProgress = arr => { progress.clear(); for (const [id, st] of arr || []) if (STATES.includes(st) && siteById(id)) progress.set(id, st); };

    // ---- building zones
    function canBuildAt(type, x, y) {
      const f = CONFIG.FACILITIES[type]; if (!f) return { ok: false, reason: 'unknownFacility' }; const [fw, fh] = f.fp; let cost = 0, worst = 0;
      for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) {
        const t = tile(x + i, y + j); if (!t) return { ok: false, reason: 'outside' }; const def = T[t.terrain];
        if (!def.buildable) return { ok: false, reason: 'water' }; if (f.terrains && !f.terrains.includes(t.terrain)) return { ok: false, reason: 'terrain', terrain: t.terrain };
        if (t.slope > Math.min(f.maxSlope, def.maxSlope) * CONFIG.SLOPE_K) return { ok: false, reason: 'slope' }; cost = Math.max(cost, def.buildCost); worst = Math.max(worst, t.slope);
      }
      if (f.needsZone && !zoneAt(f.needsZone, x, y, fw, fh)) return { ok: false, reason: 'needsZone' };
      return { ok: true, footprint: [fw, fh], costModifier: cost, ports: f.ports };
    }
    const zoneCache = new Map();
    function refineryZones(rid) {
      if (zoneCache.has(rid)) return zoneCache.get(rid); const reg = regions[rid], Z = CONFIG.ZONES.REFINERY, cand = [];
      for (let y = reg.y0 + 24; y < reg.y0 + reg.h - Z.h - 24; y += 8) for (let x = reg.x0 + 24; x < reg.x0 + reg.w - Z.w - 24; x += 8) {
        let ok = true, slopeSum = 0, n = 0; for (let j = 0; j < Z.h && ok; j += 2) for (let i = 0; i < Z.w; i += 2) { const t = tile(x + i, y + j); if (!t || t.terrain === 'WATER' || t.terrain === 'ROCKY_RIDGE' || t.terrain === 'LOW_VALLEY' || t.slope > Z.maxSlope * CONFIG.SLOPE_K) { ok = false; break; } slopeSum += t.slope; n++; }
        if (!ok) continue; if (sitesNear(x + Z.w / 2, y + Z.h / 2, Math.max(Z.w, Z.h) / 2 + 6).length) continue;
        let free = 0, tot = 0; for (let j = -Z.margin; j < Z.h + Z.margin; j += 3) for (let i = -Z.margin; i < Z.w + Z.margin; i += 3) { if (i >= 0 && j >= 0 && i < Z.w && j < Z.h) continue; tot++; const t = tile(x + i, y + j); if (t && t.terrain !== 'WATER' && t.slope <= 6 * CONFIG.SLOPE_K) free++; }
        cand.push({ x, y, w: Z.w, h: Z.h, flatness: +(1 - slopeSum / n / (Z.maxSlope * CONFIG.SLOPE_K)).toFixed(3), expansion: +(free / tot).toFixed(3) });
      }
      cand.sort((a, b) => (b.flatness + b.expansion) - (a.flatness + a.expansion)); const out = []; for (const c of cand) { if (out.length >= 2) break; if (out.every(o => Math.abs(o.x - c.x) > 40 || Math.abs(o.y - c.y) > 40)) out.push(Object.assign({ id: 'R' + rid + '-' + out.length, regionId: rid, kind: 'REFINERY', future: 'refinery -> product tanks -> pipelines -> market / export' }, c)); }
      zoneCache.set(rid, out); return out;
    }
    function zoneAt(kind, x, y, w, h) { for (const z of refineryZones(regionIdAt(x, y))) if (x >= z.x && y >= z.y && x + w <= z.x + z.w && y + h <= z.y + z.h) return z; return null; }
    function resourceZone(rid) { const s = regionSites(rid).filter(q => q.kind === 'FIELD'), tot = s.reduce((a, q) => a + q.initialReserve, 0); return { regionId: rid, richness: regions[rid].richness, fields: s.length, totalReserve: tot, byType: s.reduce((o, q) => (o[q.type] = (o[q.type] || 0) + 1, o), {}) }; }

    // ---- zoom level + the iso transform (the SAME formulas as Oli's tc() / toTile(), so the world can sit under the existing camera)
    const levelForZoom = z => z < CONFIG.ZOOM.FAR.max ? 'FAR' : z < CONFIG.ZOOM.MEDIUM.max ? 'MEDIUM' : 'CLOSE';
    const iso = { tc: (x, y) => ({ x: (x - y) * 32, y: (x + y + 1) * 16 }), toTile: (wx, wy) => { const u = wx / 32, v = wy / 16; return { x: Math.floor((u + v) / 2), y: Math.floor((v - u) / 2) }; } };

    // ---- adapters (interfaces for the later integration; NOT used by the game today)
    const LEG_TER = { FLAT_DESERT: 0, SAND_DUNES: 0, ROCKY_GROUND: 2, ROCKY_RIDGE: 3, LOW_VALLEY: 1 };         // legacy ids: 0 SAND, 1 FLAT, 2 ROUGH, 3 ROCK
    function toLegacyWindow(ox, oy, w, h) {
      w = w || CONFIG.LEGACY.W; h = h || CONFIG.LEGACY.H; const water = new Uint8Array(w * h), block = new Uint8Array(w * h), terrain = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const t = tile(ox + x, oy + y), k = y * w + x; if (!t || t.terrain === 'WATER') { water[k] = 1; block[k] = 1; continue; } terrain[k] = LEG_TER[t.terrain]; }
      return { water, block, terrain, w, h, ox, oy };
    }
    const links = new Map();                                                       // wellId -> fieldId (data only)
    const WellLink = {
      bind(wellId, fieldId) { const s = siteById(fieldId); if (!s || s.kind !== 'FIELD') return { ok: false, reason: 'noField' }; if (stateOf(fieldId) !== 'DRILLABLE') return { ok: false, reason: 'notDrillable' }; links.set(wellId, fieldId); return { ok: true }; },
      fieldOf: wellId => links.get(wellId) || null,
      /* production reduces the field's remaining reserve (the future hook; the game does not call it) */
      extract(wellId, barrels) { const id = links.get(wellId), s = id && siteById(id); if (!s) return { ok: false, reason: 'unlinked' }; const took = Math.max(0, Math.min(barrels, s.remainingReserve)); s.remainingReserve -= took; if (s.remainingReserve <= 0 && stateOf(id) === 'DRILLABLE') advance(id, 'DEPLETED'); return { ok: true, took, remaining: s.remainingReserve }; }
    };
    const oilFieldAt = (x, y) => { for (const s of sitesNear(x, y, 2)) if (s.kind === 'FIELD' && Math.hypot(s.x - x, s.y - y) <= s.radius) return s; return null; };

    return { seed, W, H, CHUNK: C, regions, regionIdAt, chunk, tile, inb, elevAt, oilProbability, regionSites, allSites, siteById, sitesNear, oilFieldAt, resourceZone, refineryZones, canBuildAt,
      discover, survey, makeDrillable, deplete, stateOf, visibleInfo, progressSnapshot, restoreProgress, drillEstimate, toLegacyWindow, WellLink, levelForZoom, iso, chunksGenerated: () => chunkGen, cachedChunks: () => chunks.size,
      scale: () => (W * H) / (CONFIG.LEGACY.W * CONFIG.LEGACY.H) };
  }
  const api = { CONFIG, STATES, LAYERS, TBYID, createWorld, hash, vnoise, fbm, mulberry32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OliWorld = api;
})(typeof window !== 'undefined' ? window : globalThis);
