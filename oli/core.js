/* Oli — core.js
 * Pure game logic. No DOM, no canvas. Runs in the browser and in Node (for tests).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OliCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ===== TUNING: every price, cost and rate of the game lives in this block ===== */
  const CFG = {
    GRID_ROWS: 88, GRID_COLS: 140,  // Phase 6: the world is 10x the old 44 x 28 map (the old world sits inside it at WORLD.OX/OY)
    WORLD: { OX: 48, OY: 32, OLD_COLS: 44, OLD_ROWS: 28 },
    START_CASH: 10000,
    FOOTPRINT: { well: [1, 1], tank: [2, 2], pump: [1, 1] },                    // grid cells covered by each building (width, height); the ONE place sizes are defined
    COST: { well: 2000, pipe: 100, pipeMain: 200, tank: 1500, pump: 2500, valve: 200 },       // well = the small well; pipe = cost per grid tile
    REFUND: 0.5,                    // share of the money returned when removing something
    MAX_LEVEL: 5,                   // wells, tanks and pipelines

    /* ===== PHASE 3 ===== */
    // Well types: production = base x level multiplier x condition x pressure
    WELL_KINDS: {
      small:  { cost: 2000, base: 10, decay: 0.5, wear: 0.3, opex: 1.0, maint: 400 },    // low production, gentle pressure loss, low risk
      medium: { cost: 3800, base: 22, decay: 0.8, wear: 0.5, opex: 1.6, maint: 900 },
      large:  { cost: 7000, base: 45, decay: 1.4, wear: 0.9, opex: 2.8, maint: 2000 }    // high production, fast pressure loss, higher wear (risk)
    },                              // decay / wear = % per minute at full output
    WELL_MULT: [1, 1.2, 1.4, 1.65, 2],             // production multiplier per well level
    PRESSURE_MIN: 0.25,             // pressure modifier = this + (1 - this) x pressure
    PRESSURE_RECOVER: 0.3,          // % per minute while the well is not pumping
    CONDITION_MIN: 0.4,             // condition modifier = this + (1 - this) x condition
    CONDITION_BROKEN: 0.1,          // at or below this the well stops until maintained
    MAINT_MIN: 0.1,                 // maintenance cost = kind price x (this + (1 - this) x wear)
    TANK_CAP: [1000, 2000, 3500, 5500, 8000],      // barrels per tank level
    UPGRADE: {                      // price of the NEXT level (index = current level - 1)
      well: [500, 1000, 2000, 4000],
      tank: [800, 1500, 2800, 4500],
      pipeTile: [30, 60, 120, 240], // pipelines: per tile of the network, so longer networks cost more
      pump: [2000, 4000]            // pump station (3 levels)
    },
    PIPE: {
      CAP: [25, 40, 60, 90, 130],   // barrels / min a pipe network can carry, per level
      SPEED: [1, 1.25, 1.5, 1.8, 2.2], // how fast oil moves (animation + display), per level
      TYPES: {
        sub:  { capMult: 1.00, diamMult: 1.00, costMult: 1.00, widthMult: 0.92, key: 'sub' },
        main: { capMult: 2.00, diamMult: 1.32, costMult: 1.00, widthMult: 1.28, key: 'main' }
      },
      RELIAB: [1, 0.8, 0.6, 0.4, 0.25], // leak-chance multiplier per level
      LEAK_PER_TILE_MIN: 0.004,     // chance per tile per minute while oil flows
      LEAK_LOSS: 0.3,               // share of the oil lost at each leaking tile
      MAX_LEAKS: 2,                 // per network at the same time
      WEAR: 0.05,                   // % of condition lost per minute (more wear = more leaks)
      REPAIR_COST: 150, REPAIR_TIME: 6
    },
    QUALITY: { LOW: 0.85, MEDIUM: 1.0, HIGH: 1.2 },  // sale price multiplier
    EXPLORE: {
      COST: 1000, TIME: 20,         // dollars, game seconds
      AREA: 4,                      // an area is AREA x AREA tiles
      CHANCE: { empty: 0.25, small: 0.35, medium: 0.25, large: 0.15 },
      SIZE: { small: 6000, medium: 18000, large: 50000 },       // barrels in the ground
      POTENTIAL: { small: 40, medium: 90, large: 180 },          // barrels / min the reservoir can deliver in total
      QUALITY: { LOW: 0.3, MEDIUM: 0.5, HIGH: 0.2 }
    },
    /* ===== PHASE 4 ===== */
    TERRAIN: { NAMES: ['SAND', 'FLAT', 'ROUGH', 'ROCK'], MULT: [1, 0.85, 1.25, 1.5] },    // building cost multiplier per terrain type
    TERRAIN_MIX: {                                 // share of each terrain type in a region, [SAND, FLAT, ROUGH, ROCK]
      SAND: [0.65, 0.2, 0.1, 0.05], FLAT: [0.3, 0.6, 0.1, 0], ROCK: [0.15, 0, 0.3, 0.55], ROUGH: [0.25, 0, 0.55, 0.2]
    },
    BUILD: { well: 5, tank: 4, pump: 3, pipeTile: 0.12, pipeMax: 3 },   // seconds of real construction: the object only works once it is finished
    REGIONS: [                                     // regions are blocks of the existing map (no separate maps)
      { id: 1, key: 'starter', terrain: 'SAND', mult: 1.0, explore: 1000, risk: 1.0, unlock: 0, need: 0,
        chance: { empty: 0.25, small: 0.35, medium: 0.25, large: 0.15 }, quality: { LOW: 0.3, MEDIUM: 0.5, HIGH: 0.2 } },
      { id: 2, key: 'desert', terrain: 'SAND', mult: 1.1, explore: 1300, risk: 1.1, unlock: 2500, need: 4000,
        chance: { empty: 0.25, small: 0.3, medium: 0.3, large: 0.15 }, quality: { LOW: 0.3, MEDIUM: 0.5, HIGH: 0.2 } },
      { id: 3, key: 'rocky', terrain: 'ROCK', mult: 1.3, explore: 1800, risk: 1.35, unlock: 5000, need: 8000,
        chance: { empty: 0.3, small: 0.2, medium: 0.3, large: 0.2 }, quality: { LOW: 0.2, MEDIUM: 0.5, HIGH: 0.3 } },
      { id: 4, key: 'remote', terrain: 'ROUGH', mult: 1.25, explore: 2500, risk: 1.25, unlock: 8000, need: 12000,
        chance: { empty: 0.3, small: 0.15, medium: 0.3, large: 0.25 }, quality: { LOW: 0.2, MEDIUM: 0.4, HIGH: 0.4 } },
      { id: 5, key: 'rich', terrain: 'FLAT', mult: 1.2, explore: 3500, risk: 1.5, unlock: 15000, need: 22000,
        chance: { empty: 0.1, small: 0.1, medium: 0.35, large: 0.45 }, quality: { LOW: 0.1, MEDIUM: 0.4, HIGH: 0.5 } }
    ],
    ORDER: {                                       // supply contracts (delivery orders) offered by the market
      MAX_OFFERS: 3, MAX_ACTIVE: 3, OFFER_LIFE: 150, FIRST: 45, EVERY: [70, 130],
      DURATIONS: [4, 6, 8, 10],                    // minutes
      FACTOR: [0.5, 1.15],                         // required oil = production x minutes x factor
      PRICE: [0.94, 1.14],                         // contract price vs the spot price
      FAIL_PAY: 0.4, FAIL_PENALTY: 0.1, MIN: 200, STEP: 50, KEEP: 8
    },
    EVENT: {                                       // random market events: the price multiplier ramps up and later fades gradually
      FIRST: [240, 360], GAP: [300, 600], RAMP: 60, RECOVER: 90,
      TYPES: {
        DEMAND_SURGE:  { w: 25, peak: [1.10, 1.18], dur: [90, 150] },
        SUPPLY_SHOCK:  { w: 20, peak: [0.86, 0.92], dur: [90, 150] },
        MARKET_DROP:   { w: 15, peak: [0.82, 0.90], dur: [60, 110] },
        MARKET_BOOM:   { w: 20, peak: [1.12, 1.22], dur: [80, 140] },
        STABLE_MARKET: { w: 20, peak: [1, 1],       dur: [120, 200] }
      },
      CALM_NOISE: 0.35, KEEP: 6
    },
    AI: {                                          // three simple AI companies (no multiplayer); they update every TICK seconds only
      TICK: 5, COST: 30, FIXED: 12, INVEST_COST: 3500, EMA: 600, EFFECT: 0.04, MIN_MULT: 0.96, MAX_MULT: 1.04,
      COMPANIES: [
        { id: 'A', strategy: 'AGGRESSIVE',   money: 8000, prod: 12, reserve: 2000, max: 85, store: 40 },
        { id: 'B', strategy: 'BALANCED',     money: 9000, prod: 10, reserve: 4000, max: 70, store: 70 },
        { id: 'C', strategy: 'CONSERVATIVE', money: 10000, prod: 8, reserve: 8000, max: 60, store: 110 }
      ],
      SELL: {                                      // [price threshold x BASE price, sell rate above it, sell rate below it] (x production)
        AGGRESSIVE: [0.85, 1.25, 0.6], BALANCED: [0.95, 1.1, 0.5], CONSERVATIVE: [1.05, 1.6, 0.3]
      },
      FORCE: { AGGRESSIVE: 0.5, BALANCED: 0.7, CONSERVATIVE: 0.85 }   // stock share of the storage above which they must sell
    },
    PRICE_TICK: 3,                  // game seconds between price updates
    PRICE: {
      START: 70, MIN: 40, MAX: 115, // $ per barrel
      BASE: 72, SWING: 11, SWING_PERIOD: 160, WOBBLE: 4, WOBBLE_PERIOD: 47,
      REVERT: 0.04,                 // pull toward the slow cycle (higher = calmer)
      GLIDE: 0.45,                  // how fast the quoted price glides to each new tick (fraction of a tick; lower = quicker)
      MOMENTUM: 0.88, NOISE: 1.5,   // how long moves persist / how big they are
      TREND_TICKS: 6, TREND_MIN: 0.8 // trend = price change over this many ticks; smaller than this = stable
    },
    HIST: 100,
    FUT: [                          // futures durations (game seconds)
      { sec: 60 }, { sec: 120 }, { sec: 180 }, { sec: 300 }
    ],
    FUT_EDGE: 0.01,                 // the locked price = the market's expected price x (1 + edge); +1% = a small incentive
    FUT_PENALTY: 0.15,              // share of the contract value paid when the oil is NOT in storage at expiry
    FUT_HISTORY: 8,                 // finished contracts kept for display
    MAX_CONTRACTS: 6,

    /* ===== PHASE 8: hydraulics (all balance numbers in one place) ===== */
    HYD: {
      RHO: 850, MU: 0.012, G: 9.81,            // oil density kg/m3, dynamic viscosity Pa.s, gravity m/s2
      ROUGH: 4.5e-5, ROUGH_WORN: 6e-4,         // pipe roughness (m): new steel / fully worn pipe (condition 0)
      TILE_M: 120,                             // one grid tile of pipe = this many metres
      BBL_MIN: 0.158987294928 / 60,            // 1 barrel / minute in m3/s
      BAR: 1e5,                                // Pa per bar
      DIAM: [0.18, 0.228, 0.279, 0.342, 0.411],   // internal pipe diameter (m) per pipe level (sized so every level runs ~2.6 m/s at capacity)
      K: { ELBOW: 0.3, TEE: 0.6, TANK: 1.0, WELL: 0.4, PUMP: 0.5, VALVE: [0.2, 30] },   // minor-loss coefficients (valve: open / partial / nearly closed)
      VALVE_POS: [1, 0.35, 0],                 // opening of OPEN / PARTIAL / CLOSED. A valve's loss K = VALVE[0] + VALVE[1] x ((1 - opening) / opening)^2
      RES_BAR: { small: 14, medium: 18, large: 24 },   // reservoir pressure of a full well (bar); falls with the well's pressure
      RES_FLOOR: 0.6,                          // share of that pressure left when the well's pressure is spent
      P_WH: 3,                                 // wellhead pressure (bar) at which a well delivers its full rate
      TANK: { BASE: 1, MAX: 8 },               // tank backpressure (bar) = BASE + MAX x fill^2
      TAU: { FLOW: 1.2, PUMP_UP: 3, PUMP_DOWN: 4, VALVE: 1.2 },   // response times (s)
      HAMMER: { PER_BBL: 0.06, MAX: 4, DECAY: 2.5 },              // pressure transient: bar per bbl/min of flow change, cap, decay time (s)
      PUMP: { H0_BAR: [10, 18, 28], QMAX: [60, 90, 130], EFF: [0.62, 0.7, 0.78] },   // pump curve H(Q) = H0 - kQ^2 with k = H0 / Qmax^2
      SOLVE_DT: 0.2,                           // the network is re-solved at most this often (s) unless something changes
      HYST: 0.3, PATH_COST: 0.05,                               // bar a different tank must be better by before a well switches to it
      P_SUCTION: 1, SOLVER: { ITER: 40, TOL: 1e-4, DAMP: 0.9 },
      P_MAX: 150,                              // hard safety clamp for any pressure (bar)
      /* Phase 2: pipe utilisation bands (flow / capacity) and the thresholds behind the warnings */
      UTIL: { BUSY: 0.6, HIGH: 0.8, BOTTLENECK: 0.95 },  // < BUSY normal | BUSY..HIGH busy | HIGH..BOTTLENECK high | >= BOTTLENECK bottleneck
      WARN: { P_HIGH: 30, LOW_FLOW: 0.6, TANK_FILL: 0.8 },
      /* Warning thresholds - each is derived from numbers already in this table, not invented:
         P_HIGH 30 bar   - above the strongest reservoir (RES_BAR.large = 24 bar): a well alone can never make this, so HIGH PRESSURE means a pump is adding on top
         LOW_FLOW 0.6    - a well pressure-limited below 60% of its potential (the same 60% where a pipe turns from Normal to Busy)
         TANK_FILL 0.8   - back-pressure BASE + MAX*f^2 is 6.1 bar at 80% fill: more than 5 bar above an empty tank, i.e. the tank is pushing back clearly */
      STATE_DT: 0.5                            // pipe states / warnings are refreshed after every solve, and at least this often (s)
    },
    /* Operating costs, in $ per MINUTE of game time (all easy to tune) */
    OPEX: {
      well: 25,                     // a pump while it is really producing (x well type, x level multiplier, x output share)
      tank: 10,                     // a storage tank, per level, always
      store: 0.1,                   // holding cost per barrel stored (waiting is not free)
      pipe: 0.5,                    // per pipe tile (x pipeline level)
      pumpKwMin: 0.05               // pump stations: $ per kW of hydraulic power per minute (only while pumping)
    },
    LOG_MAX: 30
  };
  const W = CFG.GRID_COLS, H = CFG.GRID_ROWS;
  const OX = CFG.WORLD.OX, OY = CFG.WORLD.OY, OW = CFG.WORLD.OLD_COLS, OH = CFG.WORLD.OLD_ROWS;
  const inOld = (x, y) => x >= OX && y >= OY && x < OX + OW && y < OY + OH;
  const idx = (x, y) => y * W + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Coast runs along the top-left edge (x small).
  const shore = y => 2.5 + 1.3 * Math.sin(y * 0.45 + 1) + 0.8 * Math.sin(y * 0.17 + 2);

  // Rocky hills: the old north-east hills and one new range in the new north-east. Returns 0..1 (used for ground tint and decorations).
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  function rockyAt(x, y) {
    const a = clamp01((x - OX - 32) / 6) * clamp01((13 - (y - OY)) / 6) * .8;
    const b = clamp01((x - 108) / 6) * clamp01((25 - y) / 6) * .8;
    return Math.max(a, b);
  }
  // The original map is generated exactly as before (same random sequence, shifted into the middle); new land around it uses its own sequence.
  function makeMap(seed) {
    const rng = mulberry32(seed);
    const water = new Uint8Array(W * H);
    const block = new Uint8Array(W * H);
    const coast = new Float32Array(W * H);       // > 0: water (depth), <= 0: land (distance from the shore)
    const decos = [];
    for (let ly = 0; ly < OH; ly++) {
      for (let lx = 0; lx < OW; lx++) {
        const x = lx + OX, y = ly + OY, k = idx(x, y);
        coast[k] = shore(ly) - lx;
        if (lx < shore(ly)) { water[k] = 1; block[k] = 1; continue; }
        const nearWater = lx < shore(ly) + 2.2;
        const mount = lx >= 33 && ly <= 11;
        const center = lx >= 13 && lx <= 31 && ly >= 7 && ly <= 21;
        let p = center ? 0.012 : 0.045;
        if (nearWater) p = 0.07;
        if (mount) p = 0.28;
        if (rng() >= p) continue;
        let type;
        if (mount) type = rng() < 0.7 ? 'bigrock' : 'rock';
        else if (nearWater) type = rng() < 0.7 ? 'palm' : 'shrub';
        else { const q = rng(); type = q < 0.35 ? 'palm' : q < 0.65 ? 'rock' : 'shrub'; }
        const v1 = rng(); if (type !== 'shrub') continue;      // palms and rocks no longer clutter or block the map; only harmless shrubs remain
        decos.push({ type, x, y, v: v1 });
      }
    }
    const r2 = mulberry32(seed * 31 + 977);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (inOld(x, y)) continue;
        const k = idx(x, y), sh = shore(y);
        coast[k] = sh - x;
        if (x < sh) { water[k] = 1; block[k] = 1; continue; }
        if (x < OX && y >= OY && y < OY + OH) {         // the original bay continues a few tiles to the west so it reads as a lake, not a cut-out
          const m = shore(y - OY) - (OX - 1 - x);
          if (m > 0) { coast[k] = m; water[k] = 1; block[k] = 1; continue; }
        }
        const nearWater = x < sh + 2.2, mount = x >= 109 && y <= 23;
        let p = nearWater ? 0.07 : 0.04;
        if (mount) p = 0.28;
        if (r2() >= p) continue;
        let type;
        if (mount) type = r2() < 0.7 ? 'bigrock' : 'rock';
        else if (nearWater) type = r2() < 0.7 ? 'palm' : 'shrub';
        else { const q = r2(); type = q < 0.35 ? 'palm' : q < 0.65 ? 'rock' : 'shrub'; }
        const v2 = r2(); if (type !== 'shrub') continue;
        decos.push({ type, x, y, v: v2 });
      }
    }
    return { water, block, coast, decos };
  }

  // The ground is split into AREA x AREA tile areas. Each hides a reserve that only exploration reveals.
  const A_COLS = Math.ceil(W / CFG.EXPLORE.AREA), A_ROWS = Math.ceil(H / CFG.EXPLORE.AREA);
  // Region of an area block. Region 1 (Starter) is the middle, 3 Rocky the NE hills, 5 High Potential the east, 4 Remote the south, 2 Desert the rest.
  function regionOfArea(ax, ay) {
    ax = Math.min(10, Math.max(0, ax - OX / 4)); ay = Math.min(6, Math.max(0, ay - OY / 4));       // land around the old map continues the nearest old region
    if (ax >= 8 && ay <= 2) return 3;
    if (ax >= 8) return 5;
    if (ay >= 5) return 4;
    if (ax >= 3 && ax <= 6 && ay >= 1 && ay <= 4) return 1;
    return 2;
  }
  // Terrain of every tile: patches of 2x2 tiles drawn from the mix of the region the tile lies in.
  function makeTerrain(seed) {
    const ter = new Uint8Array(W * H);
    const fill = (rng, patch, x, y, kx, ky) => {
      const reg = CFG.REGIONS[regionOfArea(Math.floor(x / CFG.EXPLORE.AREA), Math.floor(y / CFG.EXPLORE.AREA)) - 1];
      const pk = (kx >> 1) + ',' + (ky >> 1);
      if (patch[pk] == null) { const mix = CFG.TERRAIN_MIX[reg.terrain]; let r = rng(), acc = 0, t = 0; for (let i = 0; i < 4; i++) { acc += mix[i]; if (r < acc) { t = i; break; } } patch[pk] = t; }
      ter[idx(x, y)] = patch[pk];
    };
    const rng = mulberry32((seed || 7) * 104729 + 5), patch = {};          // the old map keeps its original ground
    for (let ly = 0; ly < OH; ly++) for (let lx = 0; lx < OW; lx++) fill(rng, patch, lx + OX, ly + OY, lx, ly);
    const r2 = mulberry32((seed || 7) * 104729 + 99), p2 = {};
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!inOld(x, y)) fill(r2, p2, x, y, x, y);
    return ter;
  }
  function makeAreas(map, seed) {
    const E = CFG.EXPLORE, A = E.AREA, areas = new Array(A_COLS * A_ROWS);
    const mkPick = rng => table => { let r = rng(), acc = 0; for (const k in table) { acc += table[k]; if (r < acc) return k; } return Object.keys(table)[0]; };
    const make = (ax, ay, pick) => {
      const region = regionOfArea(ax, ay), RG = CFG.REGIONS[region - 1];
      let land = 0;
      for (let y = ay * A; y < Math.min(H, ay * A + A); y++) for (let x = ax * A; x < Math.min(W, ax * A + A); x++) if (!map.block[idx(x, y)]) land++;
      const kind = pick(RG.chance), quality = pick(RG.quality), id = ay * A_COLS + ax;
      areas[id] = { id, ax, ay, region, land: land >= 8, kind: kind, size: E.SIZE[kind] || 0, remaining: E.SIZE[kind] || 0, quality, potential: E.POTENTIAL[kind] || 0, st: 0, end: 0 };
    };
    const p1 = mkPick(mulberry32((seed || 7) * 7919 + 13)), p2 = mkPick(mulberry32((seed || 7) * 7919 + 4001));
    const AX = OX / A, AY = OY / A, AW = Math.ceil(OW / A), AH = Math.ceil(OH / A);
    for (let ay = 0; ay < AH; ay++) for (let ax = 0; ax < AW; ax++) make(ax + AX, ay + AY, p1);        // the old map's reserves are unchanged
    for (let ay = 0; ay < A_ROWS; ay++) for (let ax = 0; ax < A_COLS; ax++) if (!areas[ay * A_COLS + ax]) make(ax, ay, p2);
    // starting area: the three land areas nearest the middle of the old map are known and hold oil
    const cx = AX + AW / 2 - 0.5, cy = AY + AH / 2 - 0.5;
    const near = areas.filter(a => a.land).sort((p, q) => Math.hypot(p.ax - cx, p.ay - cy) - Math.hypot(q.ax - cx, q.ay - cy)).slice(0, 3);
    const first = ['medium', 'small', 'small'], q0 = ['MEDIUM', 'HIGH', 'MEDIUM'];
    near.forEach((a, i) => { a.kind = first[i]; a.size = a.remaining = E.SIZE[first[i]]; a.potential = E.POTENTIAL[first[i]]; a.quality = q0[i]; a.st = 2; });
    return areas;
  }


  /* ================= PHASE 8: hydraulics (pure functions, no game state) ================= */
  const HC = CFG.HYD;
  const fin = (v, d) => (Number.isFinite(v) ? v : (d == null ? 0 : d));
  const Hyd = {
    area: D => Math.PI * D * D / 4,
    velocity(Q, D) { return D > 1e-6 ? fin(Q / (Math.PI * D * D / 4)) : 0; },                       // m/s from Q (m3/s)
    reynolds(rho, v, D, mu) { return mu > 1e-9 ? fin(rho * Math.abs(v) * D / mu) : 0; },
    // Darcy friction factor: laminar 64/Re, turbulent Swamee-Jain, smooth blend in between
    friction(Re, D, eps) {
      if (!(Re > 1e-9) || !(D > 1e-6)) return 0;
      const sj = r => { const l = Math.log10(Math.max(1e-12, eps / (3.7 * D) + 5.74 / Math.pow(r, 0.9))); return 0.25 / (l * l); };
      if (Re < 2300) return 64 / Re;
      if (Re > 4000) return sj(Re);
      const f1 = 64 / 2300, f2 = sj(4000); return f1 + (f2 - f1) * (Re - 2300) / 1700;
    },
    frictionLoss(f, L, D, rho, v) { return fin(f * (L / D) * (rho * v * v / 2)); },              // Pa: dP = f (L/D) (rho v^2 / 2)
    minorLoss(K, rho, v) { return fin(K * (rho * v * v / 2)); },                                  // Pa: dP = K (rho v^2 / 2)
    pumpHead(H0, k, Q) { return Math.max(0, H0 - k * Q * Q); },                                  // m: H(Q) = H0 - kQ^2
    pumpPressure(rho, H) { return rho * HC.G * H; },                                              // Pa: dP = rho g H
    tankBack(fill) { const f = Math.min(1, Math.max(0, fin(fill))); return HC.TANK.BASE + HC.TANK.MAX * f * f; },   // bar
    // one element (pipe tile or pump casing) at flow F (bbl/min) -> loss in bar, plus the numbers behind it
    loss(D, rough, F, K, out) {
      const Q = Math.max(0, fin(F)) * HC.BBL_MIN, v = Hyd.velocity(Q, D), Re = Hyd.reynolds(HC.RHO, v, D, HC.MU), f = Hyd.friction(Re, D, rough);
      const dp = (Hyd.frictionLoss(f, HC.TILE_M, D, HC.RHO, v) + Hyd.minorLoss(K, HC.RHO, v)) / HC.BAR;
      const r = Math.min(HC.P_MAX, Math.max(0, fin(dp)));
      if (out) { out.v = v; out.Re = Re; out.f = f; out.dp = r; }
      return r;
    },
    pumpSpec(level) {
      const i = Math.min(HC.PUMP.H0_BAR.length, Math.max(1, level | 0)) - 1, H0 = HC.PUMP.H0_BAR[i] * HC.BAR / (HC.RHO * HC.G), Qmax = HC.PUMP.QMAX[i];
      return { H0, Qmax, k: H0 / (Qmax * Qmax), eff: HC.PUMP.EFF[i], bar0: HC.PUMP.H0_BAR[i] };
    },
    pumpBoost(level, F, spin) { const sp = Hyd.pumpSpec(level), q = Math.min(Math.max(0, fin(F)), sp.Qmax); return Math.min(HC.P_MAX, Hyd.pumpPressure(HC.RHO, Hyd.pumpHead(sp.H0, sp.k, q)) / HC.BAR * Math.min(1, Math.max(0, fin(spin, 1)))); },   // bar
  };
  // Friction loss of one tile as a table (bar at flow f, step 0.5 bbl/min) per diameter and for new / worn pipe: the solver asks for it thousands of
  // times per solve, so it is read from the table (linear interpolation, quadratic beyond the end) instead of recomputing log / pow every time.
  const LUT_STEP = 0.5, LUT_N = 600, LUT_MAX = LUT_STEP * LUT_N, LUT = {};
  function lutFor(D, rough) {
    const key = D + '|' + rough; let t = LUT[key]; if (t) return t;
    t = LUT[key] = new Float32Array(LUT_N + 2);
    for (let i = 0; i <= LUT_N + 1; i++) { const F = i * LUT_STEP, Q = F * HC.BBL_MIN, v = Hyd.velocity(Q, D), Re = Hyd.reynolds(HC.RHO, v, D, HC.MU); t[i] = Hyd.frictionLoss(Hyd.friction(Re, D, rough), HC.TILE_M, D, HC.RHO, v) / HC.BAR; }
    return t;
  }
  function lutRead(t, F) {
    if (!(F > 0)) return 0;
    if (F >= LUT_MAX) { const r = F / LUT_MAX; return t[LUT_N] * r * r; }
    const x = F / LUT_STEP, i = x | 0, fr = x - i; return t[i] + (t[i + 1] - t[i]) * fr;
  }
  let HT = null;
  function initHT() {
    HT = { nw: [], wr: [], vk: [], dyn: HC.RHO / 2 / HC.BAR };
    // tables 0..n-1: branch pipe per level; n..2n-1: main pipe per level (its real, larger diameter, so a main pipe also loses less pressure)
    for (const m of [CFG.PIPE.TYPES.sub.diamMult, CFG.PIPE.TYPES.main.diamMult]) for (let i = 0; i < HC.DIAM.length; i++) { const D = HC.DIAM[i] * m; HT.nw.push(lutFor(D, HC.ROUGH)); HT.wr.push(lutFor(D, HC.ROUGH_WORN)); HT.vk.push(HC.BBL_MIN / (Math.PI * D * D / 4)); }
    return HT;
  }
  const ROUTE_BLOCKED = new Set(['crossBuilding', 'crossPipe', 'pipeTouch', 'water', 'blocked', 'locked', 'ambiguous', 'pumpSide']);   // refusals a detour can solve
  const ROUTE_MARGIN = 24, ROUTE_MAX_EXPAND = 60000, ROUTE_TURN = 0.55, ROUTE_DETOUR = 2.5, ROUTE_SLACK = 12;       // router window around the two ends, search cap, price of a corner, longest accepted detour
  const DIRV = [[1, 0], [-1, 0], [0, 1], [0, -1]];             // pump facing: 0 +x, 1 -x, 2 +y, 3 -y (the oil leaves on this side)

  class Game {
    constructor(opts) {
      opts = opts || {};
      this.rng = opts.rng || Math.random;
      this.map = makeMap(opts.seed || 7);
      this.terrain = makeTerrain(opts.seed || 7);
      this.seed = opts.seed || 7;
      this.events = [];
      this.reset();
    }

    reset() {
      this.s = {
        cash: CFG.START_CASH, time: 0, nextId: 1, nextLineId: 1,
        price: CFG.PRICE.START, tgt: CFG.PRICE.START, prev: CFG.PRICE.START, trend: 0, priceClock: 0, hist: [],
        contracts: [], done: [], log: [], alert: null, produced: 0, sold: 0,
        revenue: 0, operatingCosts: 0, penalties: 0, maintenance: 0, repairs: 0, profit: 0, owed: 0, capex: 0, refunds: 0, upgrades: 0, exploration: 0, leaked: 0, extracted: 0,   // economy
        change: 0, direction: 0,                                                                  // market
        regions: CFG.REGIONS.map(r => ({ unlocked: r.id === 1 })), regionSpend: 0,                // phase 4: regions
        tutorialDone: false,                                                                         // first-game guide finished (saved)
        orders: [], ordersDone: [], nextOrder: CFG.ORDER.FIRST, orderSeq: 1, orderPaid: 0, orderLost: 0,   // supply contracts
        event: null, eventHist: [], nextEvent: 0, nat: null, aiMult: 1, evMult: 1,                // market events
        pRate: 0, comp: [], aiClock: 0, aiSold: 0, aiProd: 0                                       // competitors
      };
      this.s.nextEvent = CFG.EVENT.FIRST[0] + (CFG.EVENT.FIRST[1] - CFG.EVENT.FIRST[0]) * this.rng();
      this.s.comp = CFG.AI.COMPANIES.map(o => ({ id: o.id, strategy: o.strategy, money: o.money, prod: o.prod, stock: 0, ema: o.prod, emaSold: o.prod, produced: 0, sold: 0, revenue: 0, share: 0 }));
      this.buildings = []; this.lines = []; this.lineOf = null;
      this.opex = { pump: 0, storage: 0, pipe: 0, stations: 0, total: 0 };
      this.pipe = new Uint8Array(W * H);
      this.pipeLvl = new Uint8Array(W * H);          // pipe level (1-5) of every pipe tile
      this.pipeType = new Uint8Array(W * H);         // 0 = sub-branch, 1 = main pipeline
      this.pipeCond = new Float32Array(W * H);       // condition 0..1
      this.pipeSt = new Uint8Array(W * H);           // 0 NORMAL, 1 LEAK, 2 REPAIRING
      this.pipeT = new Float32Array(W * H);          // repair time left
      this.pipeReady = new Float32Array(W * H);      // game time a new pipe tile is finished (0 = long finished)
      this.nextReady = Infinity;                     // earliest future 'finished' time: the network is recalculated then
      this.valve = new Uint8Array(W * H);            // 0 no valve, 1 OPEN, 2 PARTIAL, 3 CLOSED (the player's setting)
      this.valvePos = new Float32Array(W * H).fill(1);   // how far the valve really is open (it moves smoothly)
      this.vblock = new Uint8Array(W * H);           // valve tiles that currently stop the flow completely
      this.hyd = { plans: [], clock: 0, dirty: true, F: new Float32Array(W * H), A: new Float32Array(W * H), touched: [], debug: false, warn: 0, solves: 0, lastError: null };
      this.leakClock = 0;
      this.areas = makeAreas(this.map, this.seed);
      this.occ = new Array(W * H).fill(null);
      this.seedHistory();
      this.rebuildNetwork();
    }

    /* ---------- helpers ---------- */
    footprintOf(type) { return CFG.FOOTPRINT[type] || [1, 1]; }
    cellsOf(b) {
      const [w, h] = this.footprintOf(b.type), out = [];
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push(idx(b.x + dx, b.y + dy));
      return out;
    }
    /* ---------- Phase B: building model, connection points, placement helpers (read-only: nothing here changes the game) ---------- */
    // rotation in degrees from the facing: 0 +x, 90 +y, 180 -x, 270 -y (only the pump has a facing today; the others are symmetric)
    rotationOf(b) { return b && b.type === 'pump' ? [0, 180, 90, 270][b.dir || 0] : 0; }
    // The real connection points of a building (where a pipe may attach), each { role: 'in' | 'out' | 'both', x, y (the free tile outside the footprint), side (0 +x, 1 -x, 2 +y, 3 -y), from (footprint cell) }.
    //   WELL: out (every side)   TANK: in (every side)   PUMP: out on its facing side, in on the opposite side (rotation turns both)
    connectionPoints(type, x, y, dir) {
      const [w, h] = this.footprintOf(type), out = [];
      if (type === 'pump') {
        const d = DIRV[dir || 0], o = [dir || 0, (dir || 0) ^ 1];
        out.push({ role: 'out', x: x + d[0], y: y + d[1], side: o[0], from: [x, y] }); out.push({ role: 'in', x: x - d[0], y: y - d[1], side: o[1], from: [x, y] });
        return out;
      }
      const role = type === 'well' ? 'out' : type === 'tank' ? 'in' : 'both';
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) for (let i = 0; i < 4; i++) {
        const nx = x + dx + DIRV[i][0], ny = y + dy + DIRV[i][1]; if (nx >= x && nx < x + w && ny >= y && ny < y + h) continue;
        out.push({ role, x: nx, y: ny, side: i, from: [x + dx, y + dy] });
      }
      return out;
    }
    // id, type, position, rotation, width, height, footprint cells and connection points of a placed building
    buildingModel(b) {
      const [w, h] = this.footprintOf(b.type), cells = []; for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) cells.push([b.x + dx, b.y + dy]);
      return { id: b.id, type: b.type, x: b.x, y: b.y, rotation: this.rotationOf(b), width: w, height: h, footprint: cells, connectionPoints: this.connectionPoints(b.type, b.x, b.y, b.dir) };
    }
    // the two ends of a valve (in = towards the start of its line, out = towards the end) and the arms of a junction; both live on pipe tiles
    valvePorts(k) {
      if (!this.valve[k]) return null; const L = this.lineAt(k), i = L ? L.cells.indexOf(k) : -1;
      const t = c => ({ x: c % W, y: (c / W) | 0 });
      if (i > 0 && i < L.cells.length - 1) return [Object.assign({ role: 'in' }, t(L.cells[i - 1])), Object.assign({ role: 'out' }, t(L.cells[i + 1]))];
      return [];
    }
    junctionPorts(k) { const out = []; for (let i = 0; i < 4; i++) { const nx = (k % W) + DIRV[i][0], ny = ((k / W) | 0) + DIRV[i][1]; if (inb(nx, ny) && this.pipe[idx(nx, ny)]) out.push({ role: 'both', x: nx, y: ny, side: i }); } return out; }
    // pipe tiles that touch the footprint (outside it): [{ k, end }] - end = it is an OPEN END of a pipe (the one deliberate way to attach a pipe to a new building)
    pipeContacts(type, x, y) {
      const [w, h] = this.footprintOf(type), out = [], seen = new Set(), mv = this.moving ? new Set(this.cellsOf(this.moving)) : null;
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) for (let i = 0; i < 4; i++) {
        const nx = x + dx + DIRV[i][0], ny = y + dy + DIRV[i][1]; if (!inb(nx, ny) || (nx >= x && nx < x + w && ny >= y && ny < y + h)) continue;
        const nk = idx(nx, ny); if (!this.pipe[nk] || seen.has(nk)) continue; seen.add(nk);
        if (mv) { let own = false; for (let j = 0; j < 4 && !own; j++) { const ax = nx + DIRV[j][0], ay = ny + DIRV[j][1]; if (inb(ax, ay) && mv.has(idx(ax, ay))) own = true; } if (own) continue; }   // the moving building's own pipe stays its own
        let links = 0; for (let j = 0; j < 4; j++) { const ax = nx + DIRV[j][0], ay = ny + DIRV[j][1]; if (inb(ax, ay) && (this.pipe[idx(ax, ay)] || this.occ[idx(ax, ay)])) links++; }
        out.push({ k: nk, end: links <= 1 });                  // an OPEN END = a pipe tile with at most one neighbour (pipe or building); computed from the tiles, so it is right while pipes are still under construction too
      }
      return out;
    }
    // The best valid tile near the finger. Score = distance (in tiles) - a bonus when the spot touches an open pipe end (a compatible connection). Invalid tiles never attract.
    // Local window only (radius^2 tiles), so it is cheap enough for every pointer move.
    snapPlacement(type, x, y, radius, hint) {
      const R = Math.ceil(radius), fx = hint ? hint.fx : x, fy = hint ? hint.fy : y; let best = null;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const tx = x + dx, ty = y + dy, d = Math.hypot(tx - fx, ty - fy); if (d > radius + 0.01 || !inb(tx, ty)) continue;
        if (!this.canPlace(type, tx, ty).ok) continue;
        const compat = type === 'pump' ? 0 : this.pipeContacts(type, tx, ty).filter(c => c.end).length, score = d / radius - (compat ? 0.35 : 0);
        if (!best || score < best.score - 1e-9) best = { x: tx, y: ty, d, compat, score };
      }
      return best;
    }
    wellKind(b) { return CFG.WELL_KINDS[b.kind || 'small']; }
    // nominal output of a well at its level (before condition and pressure)
    wellNominal(b) { return this.wellKind(b).base * CFG.WELL_MULT[b.level - 1]; }
    pressureMod(b) { return CFG.PRESSURE_MIN + (1 - CFG.PRESSURE_MIN) * b.pressure; }
    conditionMod(b) { return CFG.CONDITION_MIN + (1 - CFG.CONDITION_MIN) * b.condition; }
    // production = base x level multiplier x condition x pressure
    wellRate(b) { return this.wellNominal(b) * this.conditionMod(b) * this.pressureMod(b); }
    tankCap(b) { return CFG.TANK_CAP[b.level - 1]; }
    maxLevel(b) { return b.type === 'pump' ? CFG.UPGRADE.pump.length + 1 : CFG.MAX_LEVEL; }
    upgradeCost(b) { return b.level >= this.maxLevel(b) ? 0 : CFG.UPGRADE[b.type][b.level - 1]; }
    areaAt(x, y) { return this.areas[Math.floor(y / CFG.EXPLORE.AREA) * A_COLS + Math.floor(x / CFG.EXPLORE.AREA)]; }
    qualityOf(b) { return CFG.QUALITY[b.quality || 'MEDIUM']; }
    // average sale-price multiplier of the oil in storage
    avgQuality() { let a = 0, q = 0; for (const b of this.buildings) if (b.type === 'tank' && b.amt > 0) { a += b.amt; q += b.amt * (b.qm || 1); } return a > 0 ? q / a : 1; }
    oilTotal() { let n = 0; for (const b of this.buildings) if (b.type === 'tank') n += b.amt; return n; }
    storageCap() { let n = 0; for (const b of this.buildings) if (b.type === 'tank') n += this.tankCap(b); return n; }
    countOf(type) { return this.buildings.filter(b => b.type === type).length; }
    pipeCount() { let n = 0; for (let i = 0; i < this.pipe.length; i++) n += this.pipe[i]; return n; }
    pipeKind(k) { return this.pipeType[k] ? 'main' : 'sub'; }
    pipeSpec(k) { return CFG.PIPE.TYPES[this.pipeKind(k)]; }
    pipeCapacity(k) { const lv = Math.max(1, this.pipeLvl[k]); return CFG.PIPE.CAP[lv - 1] * this.pipeSpec(k).capMult; }
    pipeDiameter(k) { const lv = Math.max(1, this.pipeLvl[k]); return HC.DIAM[lv - 1] * this.pipeSpec(k).diamMult; }
    buildingAt(x, y) { return inb(x, y) ? this.occ[idx(x, y)] : null; }
    // log entries hold a message key + values; the UI turns them into text in the player's language
    addLog(k, amt, v) {
      this.s.log.unshift({ t: this.s.time, k, v: v || {}, amt: amt || 0 });
      if (this.s.log.length > CFG.LOG_MAX) this.s.log.pop();
    }
    drainEvents() { const e = this.events; this.events = []; return e; }

    fillOcc(b) { for (const k of this.cellsOf(b)) this.occ[k] = b; }
    clearOcc(b) { for (const k of this.cellsOf(b)) this.occ[k] = null; }

    /* ---------- building ---------- */
    regionAt(x, y) { const a = this.areaAt(x, y); return a ? CFG.REGIONS[a.region - 1] : CFG.REGIONS[0]; }
    regionOpen(id) { const r = this.s.regions[id - 1]; return !!(r && r.unlocked); }
    terrainAt(x, y) { return this.terrain[idx(x, y)]; }
    // construction price: base price x region multiplier x terrain multiplier (average over the footprint)
    tileMult(x, y) { return this.regionAt(x, y).mult * CFG.TERRAIN.MULT[this.terrain[idx(x, y)]]; }
    footMult(type, x, y) {
      const [w, h] = this.footprintOf(type); let m = 0;
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) m += this.tileMult(x + dx, y + dy);
      return m / (w * h);
    }
    pipeCost(fresh, pipeType = 0) { const base = pipeType ? CFG.COST.pipeMain : CFG.COST.pipe; const mult = pipeType ? CFG.PIPE.TYPES.main.costMult : CFG.PIPE.TYPES.sub.costMult; let t = 0; for (const k of fresh) t += Math.round(base * mult * this.tileMult(k % W, (k / W) | 0)); return t; }
    // A pump station sits IN a straight pipeline: on a pipe tile (it replaces it) or on a free tile between two pipes / buildings on opposite sides.
    canPlacePump(x, y) {
      if (!inb(x, y)) return { ok: false, reason: 'outside' };
      const k = idx(x, y);
      if (this.map.water[k] || this.map.block[k]) return { ok: false, reason: 'pumpHere' };            // "Cannot build here"
      if (this.occ[k]) return { ok: false, reason: 'pumpSpace' };                                        // "Not enough space"
      if (!this.regionOpen(this.areaAt(x, y).region)) return { ok: false, reason: 'locked' };
      const has = (cx, cy) => { if (!inb(cx, cy)) return 0; const i = idx(cx, cy), o = this.occ[i]; return this.pipe[i] || (o && o.type !== 'pump') ? 1 : 0; };
      const L = has(x - 1, y), R = has(x + 1, y), U = has(x, y - 1), D = has(x, y + 1), n = L + R + U + D;
      const onPipe = !!this.pipe[k];
      if (onPipe && n >= 3) return { ok: false, reason: 'pumpJunction' };
      if (L && R && !U && !D) return { ok: true, axis: 'h', onPipe };
      if (U && D && !L && !R) return { ok: true, axis: 'v', onPipe };
      return { ok: false, reason: onPipe ? 'pumpNotStraight' : 'pumpNeedsPipe' };
    }
    // the side that is closer to a tank is the output; wells are never an output
    pumpAutoDir(x, y, axis) {
      const sides = axis === 'h' ? [[x + 1, y, 0], [x - 1, y, 1]] : [[x, y + 1, 2], [x, y - 1, 3]];
      const score = ([cx, cy]) => { const i = idx(cx, cy), o = this.occ[i]; if (o) return o.type === 'tank' ? -1 : o.type === 'well' ? 1e6 : 5e5; const d = this.net.dist[i]; return d >= 0 ? d : 1e5; };
      return score(sides[0]) <= score(sides[1]) ? sides[0][2] : sides[1][2];
    }
    canPlace(type, x, y) {
      if (type === 'pump') return this.canPlacePump(x, y);
      const [w, h] = this.footprintOf(type);
      if (!inb(x, y)) return { ok: false, reason: 'outside' };                                           // the anchor cell is not even in the world
      if (!inb(x + w - 1, y + h - 1)) return { ok: false, reason: 'edge' };                              // part of the footprint would stick out of the world
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {                                    // only the cells the building covers are looked at (grid occupancy lookups, no object scan)
        const k = idx(x + dx, y + dy), first = dx === 0 && dy === 0;
        if (this.map.water[k]) return { ok: false, reason: 'water' };
        if (this.map.block[k]) return { ok: false, reason: 'blocked' };
        if (this.occ[k] && this.occ[k] !== this.moving) return { ok: false, reason: first ? 'occupied' : 'overlap' };   // (a building being moved does not block its own new spot) the spot itself is taken / only a corner of the footprint touches another structure
        if (this.pipe[k]) return { ok: false, reason: 'pipe' };
      }
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) if (!this.regionOpen(this.areaAt(x + dx, y + dy).region)) return { ok: false, reason: 'locked' };
      for (const c of this.pipeContacts(type, x, y)) if (!c.end) return { ok: false, reason: 'touchesPipe' };   // beside the middle of a pipe it would join the network by accident (only an open pipe end is a deliberate attachment)
      if (type === 'well') {                       // wells can only be built on a reserve that has been explored
        const a = this.areaAt(x, y);
        if (a.st !== 2) return { ok: false, reason: 'notExplored' };
        if (a.kind === 'empty') return { ok: false, reason: 'noOil' };
        if (a.remaining <= 0) return { ok: false, reason: 'depleted' };
      }
      return { ok: true };
    }

    /* One verdict for a placement, used by the preview, the confirm bar and place() itself:
       state  VALID | INVALID | UNAFFORDABLE        kind  OUT_OF_BOUNDS | OCCUPIED | OVERLAPPING | RESTRICTED_AREA | TERRAIN | RULE | null
       Extra rules (new terrain / zone rules) belong in canPlace; this wrapper adds the footprint, the cost and the money check. */
    placement(type, x, y, kind) {
      const c = this.canPlace(type, x, y), [w, h] = this.footprintOf(type);
      const cells = []; for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) cells.push([x + dx, y + dy]);
      const cost = inb(x, y) && inb(x + w - 1, y + h - 1) ? this.buildCost(type, kind, x, y) : 0;
      if (!c.ok) {
        const R = c.reason, kind = R === 'outside' || R === 'edge' ? 'OUT_OF_BOUNDS' : R === 'occupied' || R === 'pipe' ? 'OCCUPIED' : R === 'overlap' || R === 'pumpSpace' ? 'OVERLAPPING' : R === 'locked' || R === 'notExplored' || R === 'noOil' || R === 'depleted' ? 'RESTRICTED_AREA' : R === 'water' || R === 'blocked' ? 'TERRAIN' : 'RULE';
        return { ok: false, state: 'INVALID', kind, reason: R, cost, cells, w, h, afford: this.s.cash >= cost };
      }
      if (this.s.cash < cost) return { ok: false, state: 'UNAFFORDABLE', kind: null, reason: 'cash', cost, cells, w, h, afford: false };
      return { ok: true, state: 'VALID', kind: null, reason: null, cost, cells, w, h, afford: true };
    }

    // ---- easy building: where can this be placed? (used for snapping and the green "valid spot" markers)
    validSpots(type) {
      const out = [], [fw, fh] = this.footprintOf(type), A = CFG.EXPLORE.AREA;
      if (type === 'pump') { for (let k = 0; k < this.pipe.length; k++) if (this.pipe[k] && this.canPlacePump(k % W, (k / W) | 0).ok) out.push([k % W, (k / W) | 0]); return out; }
      for (const a of this.areas) {                 // only areas that can possibly allow it are scanned (the world is big)
        if (!a.land || !this.regionOpen(a.region)) continue;
        if (type === 'well' && (a.st !== 2 || a.kind === 'empty' || a.remaining <= 0)) continue;
        for (let y = a.ay * A; y < Math.min(H - fh + 1, a.ay * A + A); y++) for (let x = a.ax * A; x < Math.min(W - fw + 1, a.ax * A + A); x++) if (this.canPlace(type, x, y).ok) out.push([x, y]);
      }
      return out;
    }
    nearestValid(type, x, y, radius, spots) {
      if (!spots) { const r = this.snapPlacement(type, x, y, radius); return r ? [r.x, r.y] : null; }          // local window: cheap on every pointer move
      let best = null, bd = radius * radius + 0.01;
      for (const p of spots || this.validSpots(type)) { const d = (p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y); if (d < bd) { bd = d; best = p; } }
      return best;
    }
    // Pipe ends snap to the closest well, tank or pipe within `radius` tiles (the tile itself if it is already one).
    nearestAnchor(x, y, radius) {
      let best = null, bd = radius * radius + 0.01;
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
        const cx = x + dx, cy = y + dy; if (!inb(cx, cy)) continue;
        const k = idx(cx, cy); if (!this.occ[k] && !this.pipe[k]) continue;
        const d = dx * dx + dy * dy - (this.occ[k] ? .5 : 0); if (d < bd) { bd = d; best = [cx, cy]; }
      }
      return best;
    }

    buildCost(type, kind, x, y) { const base = type === 'well' ? CFG.WELL_KINDS[kind || 'small'].cost : CFG.COST[type]; return x == null ? base : Math.round(base * this.footMult(type, x, y)); }

    place(type, x, y, kind, dir) {
      const r = this.canPlace(type, x, y);
      if (!r.ok) return r;
      if (type === 'pump') return this.placePump(x, y, r, dir);
      if (type === 'well' && !CFG.WELL_KINDS[kind || 'small']) return { ok: false, reason: 'nothing' };
      const cost = this.buildCost(type, kind, x, y);
      if (this.s.cash < cost) return { ok: false, reason: 'cash' };
      this.s.cash -= cost; this.s.capex += cost;
      const b = { id: this.s.nextId++, type, x, y, level: 1, amt: 0, invested: cost, status: 'idle', out: 0, rate: 0, active: false, built: this.s.time, ready: this.s.time + (CFG.BUILD[type] || 0) };
      if (type === 'well') { const a = this.areaAt(x, y); Object.assign(b, { kind: kind || 'small', pressure: 1, condition: 1, quality: a.quality, area: a.id, nominal: 0 }); b.rate = this.wellRate(b); }
      else b.qm = 1;
      this.buildings.push(b);
      this.fillOcc(b);
      this.rebuildNetwork();
      this.addLog('log.built', -cost, { what: type === 'well' ? 'well.' + b.kind : type });
      return { ok: true, building: b, cost };
    }

    /* ---------- move a building (wells and tanks; free of charge) ----------
       beginMove(id)   -> the building stops blocking its own cells while the player looks for a new spot (nothing changes in the real state)
       canMove(id,x,y) -> the same verdict canPlace gives, plus "same spot"
       moveBuilding    -> ONE transaction: old cells freed, new cells taken, area/quality of a well refreshed, the network graph rebuilt (pipes that no longer touch it simply drop out) */
    beginMove(id) { const b = this.buildings.find(q => q.id === id); this.moving = b && (b.type === 'well' || b.type === 'tank') ? b : null; return !!this.moving; }
    endMove() { this.moving = null; }
    canMove(id, x, y) {
      const b = this.buildings.find(q => q.id === id); if (!b) return { ok: false, reason: 'nothing' };
      if (b.type !== 'well' && b.type !== 'tank') return { ok: false, reason: 'noMove' };
      if (b.x === x && b.y === y) return { ok: false, reason: 'sameSpot' };
      const prev = this.moving; this.moving = b; const r = this.canPlace(b.type, x, y); this.moving = prev; return r;
    }
    moveBuilding(id, x, y) {
      const b = this.buildings.find(q => q.id === id), r = this.canMove(id, x, y); if (!r.ok) { this.moving = null; return r; }
      const before = { x: b.x, y: b.y }; this.clearOcc(b); b.x = x; b.y = y; this.fillOcc(b);
      if (b.type === 'well') { const a = this.areaAt(x, y); b.area = a.id; b.quality = a.quality; b.rate = this.wellRate(b); }
      this.moving = null; this.rebuildNetwork();
      this.addLog('log.moved', 0, { what: b.type === 'well' ? 'well.' + b.kind : b.type });
      return { ok: true, building: b, from: before };
    }

    placePump(x, y, r, dir) {
      const cost = this.buildCost('pump', null, x, y);
      if (this.s.cash < cost) return { ok: false, reason: 'cash' };
      const d = dir != null && (r.axis === 'h' ? dir < 2 : dir >= 2) ? dir : this.pumpAutoDir(x, y, r.axis), k = idx(x, y);
      this.s.cash -= cost; this.s.capex += cost;
      const b = { id: this.s.nextId++, type: 'pump', x, y, level: 1, amt: 0, invested: cost, status: 'idle', out: 0, rate: 0, active: false, built: this.s.time, ready: this.s.time + (CFG.BUILD.pump || 0), qm: 1,
        dir: d, enabled: true, spin: 0, flow: 0, kw: 0, boost: 0, pIn: 0, pOut: 0 };
      if (r.onPipe) { b.hadPipe = [this.pipeLvl[k], +this.pipeCond[k].toFixed(4), this.pipeType[k]]; this.pipe[k] = 0; this.pipeType[k] = 0; this.pipeLvl[k] = 0; this.pipeCond[k] = 0; this.pipeSt[k] = 0; this.pipeT[k] = 0; this.pipeReady[k] = 0; this.valve[k] = 0; }
      this.buildings.push(b); this.fillOcc(b); this.rebuildNetwork();
      this.addLog('log.built', -cost, { what: 'pump' });
      return { ok: true, building: b, cost };
    }
    flipPump(b) { if (b.type !== 'pump') return { ok: false, reason: 'nothing' }; b.dir ^= 1; this.rebuildNetwork(); this.events.push({ type: 'pumpDir', id: b.id }); return { ok: true, dir: b.dir }; }
    setPumpEnabled(b, on) { if (b.type !== 'pump') return { ok: false, reason: 'nothing' }; b.enabled = !!on; this.hyd.dirty = true; this.events.push({ type: 'pumpToggle', id: b.id, on: b.enabled }); return { ok: true, enabled: b.enabled }; }
    // valves: 0 none, 1 OPEN, 2 PARTIAL, 3 CLOSED. The first valve on a tile is bought; the valve then moves smoothly.
    setValve(k, st) {
      if (!this.pipe[k]) return { ok: false, reason: 'nothing' };
      st = st | 0; if (st < 0 || st > 3) return { ok: false, reason: 'nothing' };
      let cost = 0;
      if (st > 0 && !this.valve[k]) { cost = CFG.COST.valve; if (this.s.cash < cost) return { ok: false, reason: 'cash' }; this.s.cash -= cost; this.s.capex += cost; this.valvePos[k] = CFG.HYD.VALVE_POS[st - 1] >= 0.99 ? 1 : this.valvePos[k]; }
      const was = this.valve[k]; this.valve[k] = st; if (!st) this.valvePos[k] = 1;
      if (st !== 3) this.vblock[k] = 0;
      this.hyd.dirty = true;
      if (st === 3 && !was) this.valvePos[k] = 1;
      this.rebuildNetwork();
      this.events.push({ type: 'valve', k, st });
      return { ok: true, cost, state: st };
    }
    valveK(k) { const o = Math.max(0.02, this.valvePos[k]); return this.valve[k] ? HC.K.VALVE[0] + HC.K.VALVE[1] * Math.pow((1 - o) / o, 2) : 0; }

    // Pipelines follow grid axes only. The router tries the two single-corner "L" shapes first (the cleanest geometry: one corner at most), and when both are blocked
    // (a building, water, a pipe of another network in the way) it searches a detour with A* over the grid (findPath): shortest, fewest corners, never through anything.
    routePipe(ax, ay, bx, by, flip, pipeType = 0) {
      const make = xFirst => {
        const cells = []; let x = ax, y = ay;
        cells.push([x, y]);
        const stepX = () => { while (x !== bx) { x += Math.sign(bx - x); cells.push([x, y]); } };
        const stepY = () => { while (y !== by) { y += Math.sign(by - y); cells.push([x, y]); } };
        if (xFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
        return cells;
      };
      const key = [ax, ay, bx, by, !!flip, pipeType ? 1 : 0, this.pipeCount(), this.buildings.length, this.s.regions.map(r => +r.unlocked).join('')].join(',');
      if (this._rc && this._rc.key === key) return this._rc.route;
      const primary = this.evalRoute(make(!flip), pipeType);
      let route = primary;
      if (!primary.ok) { const secondary = this.evalRoute(make(!!flip), pipeType); route = secondary.ok ? secondary : primary; }
      if (!route.ok && ROUTE_BLOCKED.has(route.reason)) {                                  // something is in the way: look for a way around it
        const f = this.findPath(ax, ay, bx, by);
        if (f.cells) { const alt = this.evalRoute(f.cells, pipeType); if (alt.ok) { alt.auto = true; route = alt; } }
        else if (f.none && route.reason !== 'ambiguous' && route.reason !== 'pumpSide') route = Object.assign({}, route, { reason: 'noRoute' });          // the search proved there is no way at all
      }
      if (route.ok) route.connects = this.wouldConnect(route);
      this._rc = { key, route };
      return route;
    }

    // The ONE judge of a list of cells as a pipeline: world bounds, buildings, blocked / water / locked ground, contacts with other networks, endpoints, pump sides, cost.
    evalRoute(cells, pipeType = 0) {
      const fresh = []; let reason = null;
      for (let i = 0; i < cells.length; i++) {
        const x = cells[i][0], y = cells[i][1];
        if (!inb(x, y)) { reason = 'outside'; break; }
        const k = idx(x, y), endpoint = i === 0 || i === cells.length - 1;
        if (this.occ[k]) { if (!endpoint) { reason = 'crossBuilding'; break; } continue; }
        if (this.map.block[k]) { reason = this.map.water[k] ? 'water' : 'blocked'; break; }
        if (!this.regionOpen(this.areaAt(x, y).region)) { reason = 'locked'; break; }
        if (this.pipe[k]) continue;
        fresh.push(k);
      }
      if (!reason && fresh.length === 0) reason = 'nothing';
      // Pipes that merely touch are joined by the network (neighbouring tiles = one graph edge), so a route may only touch or cross what it deliberately
      // connects to at its two ends. Anything else would silently link two networks that merely look close together.
      if (!reason && cells.length > 2) reason = this.routeContact(cells);
      // a pump joins only at its back and front: a route may start / end on a pump only along the pump's axis
      if (!reason && cells.length > 1) reason = this.pumpSide(cells[0], cells[1]) || this.pumpSide(cells[cells.length - 1], cells[cells.length - 2]);
      // no floating pipelines: one end must touch a well, a tank or an existing pipe
      if (!reason && !(this.isAnchor(cells[0][0], cells[0][1]) || this.isAnchor(cells[cells.length - 1][0], cells[cells.length - 1][1]))) reason = 'floating';
      if (!reason) reason = this.endAmbiguity(cells);                    // an end tile may join ONE network, never two at once by accident
      return { cells, fresh, pipeType: pipeType ? 1 : 0, cost: this.pipeCost(fresh, pipeType), reason, ok: !reason, connects: false };
    }
    pumpSide(c, nb) {                                                    // c = the end cell of a route, nb = the next cell of the route
      if (!inb(c[0], c[1])) return null; const pb = this.occ[idx(c[0], c[1])]; if (!pb || pb.type !== 'pump') return null;
      const d = DIRV[pb.dir || 0], horizontal = d[0] !== 0; return (horizontal ? nb[1] === c[1] : nb[0] === c[0]) ? null : 'pumpSide';
    }

    // A* over the grid: 4-neighbour moves, every step costs the ground price (terrain x region), every turn a small extra, so the cheapest route is also the straightest.
    // Interior cells must be free ground that touches NOTHING except the two end objects (so a detour never links another network or feeds another tank by accident).
    // Only a window around the two ends is searched and the number of expansions is capped: a long route on the 140 x 88 world stays cheap.
    // Returns { cells } | { none: true } (no way exists in the window) | { tooLong: true } (a way exists but only as a huge detour) | {} (invalid ends).
    findPath(ax, ay, bx, by) {
      if (!inb(ax, ay) || !inb(bx, by) || (ax === bx && ay === by)) return {};
      const sk = idx(ax, ay), gk = idx(bx, by), occ = this.occ, M = ROUTE_MARGIN;
      const x0 = Math.max(0, Math.min(ax, bx) - M), x1 = Math.min(W - 1, Math.max(ax, bx) + M), y0 = Math.max(0, Math.min(ay, by) - M), y1 = Math.min(H - 1, Math.max(ay, by) + M);
      const w = x1 - x0 + 1, h = y1 - y0 + 1, n = w * h, loc = (x, y) => (y - y0) * w + (x - x0);
      const ends = new Set([sk, gk]), endB = new Set([occ[sk], occ[gk]]);
      const near = (x, y) => {                                                       // does this cell touch anything except the end objects?
        for (let d = 0; d < 4; d++) { const nx = x + DIRV[d][0], ny = y + DIRV[d][1]; if (!inb(nx, ny)) continue; const nk = idx(nx, ny); if (ends.has(nk)) continue; const o = occ[nk]; if (o ? !endB.has(o) : this.pipe[nk]) return true; }
        return false;
      };
      const free = new Int8Array(n);                                                  // 0 unknown, 1 usable, 2 not usable (decided once per cell)
      const usable = (x, y) => { const l = loc(x, y); if (free[l]) return free[l] === 1; const k = idx(x, y);
        const okc = !occ[k] && !this.pipe[k] && !this.map.block[k] && this.regionOpen(this.areaAt(x, y).region) && !near(x, y); free[l] = okc ? 1 : 2; return okc; };
      const pumpAxis = (k, dx, dy) => { const o = occ[k]; if (!o || o.type !== 'pump') return true; const d = DIRV[o.dir || 0]; return (d[0] !== 0) === (dx !== 0); };
      const g = new Float32Array(n * 4).fill(Infinity), par = new Int32Array(n * 4).fill(-1), done = new Uint8Array(n * 4);
      const man = (x, y) => Math.abs(x - bx) + Math.abs(y - by), TURN = ROUTE_TURN, HMIN = 0.5;
      const heap = [], push = (f, st) => { heap.push([f, st]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; const t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p; } };
      const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; const t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m; } } return top; };
      const sl = loc(ax, ay);
      for (let d = 0; d < 4; d++) { g[sl * 4 + d] = 0; push(man(ax, ay) * HMIN, sl * 4 + d); }                // the first step may go in any direction (the first turn is free)
      let goal = -1, expanded = 0;
      while (heap.length && expanded < ROUTE_MAX_EXPAND) {
        const [, st] = pop(); if (done[st]) continue; done[st] = 1; expanded++;
        const l = st >> 2, dir = st & 3, cx = x0 + (l % w), cy = y0 + ((l / w) | 0);
        if (cx === bx && cy === by) { goal = st; break; }
        for (let d = 0; d < 4; d++) {
          const nx = cx + DIRV[d][0], ny = cy + DIRV[d][1]; if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
          const nk = idx(nx, ny), isGoal = nk === gk;
          if (!isGoal && !usable(nx, ny)) continue;
          if (l === sl && !pumpAxis(sk, DIRV[d][0], DIRV[d][1])) continue;            // leaving a pump: only along its axis
          if (isGoal && !pumpAxis(gk, DIRV[d][0], DIRV[d][1])) continue;              // entering a pump: only along its axis
          const nst = loc(nx, ny) * 4 + d; if (done[nst]) continue;
          const c = g[st] + this.tileMult(nx, ny) + (cx === ax && cy === ay ? 0 : d !== dir ? TURN : 0);
          if (c < g[nst]) { g[nst] = c; par[nst] = st; push(c + man(nx, ny) * HMIN, nst); }
        }
      }
      if (goal < 0) return expanded >= ROUTE_MAX_EXPAND ? {} : { none: true };
      const cells = []; for (let st = goal; st >= 0; st = par[st]) { const l = st >> 2; cells.push([x0 + (l % w), y0 + ((l / w) | 0)]); }
      cells.reverse(); if (cells.length > 1 && cells[0][0] === cells[1][0] && cells[0][1] === cells[1][1]) cells.shift();
      if (cells.length - 1 > (Math.abs(ax - bx) + Math.abs(ay - by)) * ROUTE_DETOUR + ROUTE_SLACK) return { tooLong: true };
      return { cells, expanded };
    }

    // what a route would touch: null when every contact is a deliberate one (at its two end tiles), else 'crossPipe' / 'pipeTouch'
    routeContact(cells) {
      const own = new Set(cells.map(c => idx(c[0], c[1])));
      const ent = k => this.occ[k] && this.occ[k].type !== 'pump' ? null : this.pipe[k] || this.occ[k] ? (this.net.compOf[k] >= 0 ? 'c' + this.net.compOf[k] : 'u' + k) : null;      // only pipe networks count: a pipe beside wells or tanks is meant to feed them
      const around = (x, y, set) => {
        const e0 = ent(idx(x, y)); if (e0) set.add(e0);
        for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + d[0], ny = y + d[1]; if (!inb(nx, ny)) continue; const nk = idx(nx, ny); if (own.has(nk)) continue; const e = ent(nk); if (e) set.add(e); }
      };
      const intended = new Set(); around(cells[0][0], cells[0][1], intended); around(cells[cells.length - 1][0], cells[cells.length - 1][1], intended);
      for (let i = 1; i < cells.length - 1; i++) {
        const x = cells[i][0], y = cells[i][1], k = idx(x, y), me = ent(k);
        if (me && !intended.has(me)) return 'crossPipe';
        for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + d[0], ny = y + d[1]; if (!inb(nx, ny)) continue;
          const nk = idx(nx, ny); if (own.has(nk)) continue;
          const e = ent(nk); if (e && !intended.has(e)) return 'pipeTouch';
        }
      }
      return null;
    }

    // An end tile of a route that would touch pipes of two different networks at once (for example dropped between two parallel pipelines) would silently
    // merge them. Joining two networks is fine when the player does it on purpose - one network at each end - so this only refuses the ambiguous case.
    endAmbiguity(cells) {
      if (cells.length < 2) return null;                                                 // a single tile filling a gap is always a deliberate join
      const own = new Set(cells.map(c => idx(c[0], c[1])));
      const key = nk => this.net.compOf[nk] >= 0 ? 'c' + this.net.compOf[nk] : 'u' + nk;
      const netsAround = (c, selfToo) => {
        const set = new Set(), k0 = idx(c[0], c[1]); if (selfToo && this.pipe[k0]) set.add(key(k0));
        for (const d of DIRV) { const nx = c[0] + d[0], ny = c[1] + d[1]; if (!inb(nx, ny)) continue; const nk = idx(nx, ny); if (!own.has(nk) && this.pipe[nk]) set.add(key(nk)); }
        return set;
      };
      const ends = [cells[0], cells[cells.length - 1]];
      for (let i = 0; i < 2; i++) {
        const c = ends[i], k = idx(c[0], c[1]); if (this.pipe[k] || this.occ[k]) continue;   // only a NEW end tile can reach out to its neighbours
        const other = netsAround(ends[1 - i], true), mine = [...netsAround(c, false)].filter(n => !other.has(n));
        if (mine.length > 1) return 'ambiguous';
      }
      return null;
    }

    // What a route will do to the network, before it is built (the preview and the tests read this; nothing is changed):
    //  start / end   what each end attaches to: { kind: well | tank | pump | pipe | free, id }
    //  junctions     every existing pipe tile that gains a branch: { k, x, y, from, to, isNew } - from = links before, to = links after (3 = T-junction, 4 = four-way)
    routeInfo(route) {
      if (!route || !route.cells) return null;
      const cells = route.cells, fresh = new Set(route.fresh), pipeNear = [], seen = new Set();
      const attach = c => {
        const k = idx(c[0], c[1]), b = this.occ[k];
        if (b) return { kind: b.type, id: b.id };
        let pipe = !!this.pipe[k], found = null;
        for (const d of DIRV) { const nx = c[0] + d[0], ny = c[1] + d[1]; if (!inb(nx, ny)) continue; const nk = idx(nx, ny), o = this.occ[nk]; if (o && !found && o.type !== 'pump') found = { kind: o.type, id: o.id }; else if (this.pipe[nk]) pipe = true; }
        return found || (pipe ? { kind: 'pipe', id: null } : { kind: 'free', id: null });
      };
      for (const c of cells) {                                  // pipe tiles next to a NEW tile of the route (or the route's own end on a pipe)
        const k = idx(c[0], c[1]);
        if (this.pipe[k] && !seen.has(k)) { seen.add(k); pipeNear.push(k); }
        for (const d of DIRV) { const nx = c[0] + d[0], ny = c[1] + d[1]; if (!inb(nx, ny)) continue; const nk = idx(nx, ny); if (this.pipe[nk] && !seen.has(nk) && fresh.has(k)) { seen.add(nk); pipeNear.push(nk); } }
      }
      const junctions = [];
      for (const pk of pipeNear) {
        let added = 0; for (const d of DIRV) { const nx = pk % W + d[0], ny = ((pk / W) | 0) + d[1]; if (inb(nx, ny) && fresh.has(idx(nx, ny))) added++; }
        if (!added) continue;
        const before = this.net.type[pk] === 1 ? this.visualLinks(pk) : 0, to = before + added;
        if (to >= 3) junctions.push({ k: pk, x: pk % W, y: (pk / W) | 0, from: before, to, isNew: before < 3 });
      }
      let corners = 0; for (let i = 1; i + 1 < cells.length; i++) if ((cells[i][0] - cells[i - 1][0]) !== (cells[i + 1][0] - cells[i][0]) || (cells[i][1] - cells[i - 1][1]) !== (cells[i + 1][1] - cells[i][1])) corners++;
      return { length: cells.length, fresh: route.fresh.length, corners, auto: !!route.auto, cost: route.cost, start: attach(cells[0]), end: attach(cells[cells.length - 1]), junctions };
    }

    // The pipe tiles of the branch that tile k belongs to: its segment (up to the next junction / building) plus its dead-end tile. Null for a junction or a non-pipe.
    branchOf(k) {
      const g = this.net.graph; if (!g || !this.pipe[k] || (g.tileNode[k] < 0 && g.segOf[k] < 0)) return null;
      const nd = this.graphNode(k); if (nd && nd.kind === 'junction') return null;
      const seg = nd ? g.edgeById.get(nd.edges[0]) : this.graphSegment(k);
      const tiles = new Set(seg ? seg.tiles : []); if (nd) tiles.add(k);
      if (seg) for (const id of [seg.a, seg.b]) { const o = g.nodes[g.byId.get(id)]; if (o && o.kind === 'end') tiles.add(o.k); }
      return tiles.size ? { tiles: [...tiles], segment: seg ? seg.id : null, refund: tiles.size * Math.floor(CFG.COST.pipe * CFG.REFUND) } : null;
    }
    // Remove a whole branch in ONE operation. A junction that is left with two links simply stops being a junction - the graph is derived, so the remaining pipes are
    // merged into one segment on their own. A junction itself is not a branch (remove the branches around it).
    removeBranch(x, y) {
      if (!inb(x, y)) return { ok: false, reason: 'nothing' };
      const k = idx(x, y), g = this.net.graph;
      if (!this.pipe[k]) return { ok: false, reason: 'nothing' };
      const nd = this.graphNode(k); if (nd && nd.kind === 'junction') return { ok: false, reason: 'junction' };
      const br = this.branchOf(k); if (!br) return this.removeAt(x, y);                    // an unfinished pipe: the single-tile removal
      const junctionsBefore = g.nodes.filter(n => n.kind === 'junction').map(n => n.id);
      for (const t of br.tiles) { this.pipe[t] = 0; this.pipeType[t] = 0; this.pipeLvl[t] = 0; this.pipeCond[t] = 0; this.pipeSt[t] = 0; this.pipeT[t] = 0; this.pipeReady[t] = 0; this.valve[t] = 0; this.vblock[t] = 0; this.valvePos[t] = 1; }
      this.s.cash += br.refund; this.s.refunds += br.refund;
      this.rebuildNetwork();
      this.addLog('log.removedBranch', br.refund, { n: br.tiles.length });
      const after = new Set(this.net.graph.nodes.filter(n => n.kind === 'junction').map(n => n.id));
      return { ok: true, refund: br.refund, what: 'branch', tiles: br.tiles.length, branch: br.segment, simplified: junctionsBefore.filter(id => !after.has(id)), lost: 0 };
    }

    // everything the debug overlay shows about one tile: node, segment, branch count, network, flow, pressure, capacity, connection state
    tileDebug(k) {
      const g = this.net.graph, net = this.net; if (!g || !inb(k % W, (k / W) | 0)) return null;
      const nd = this.graphNode(k), seg = this.graphSegment(k), b = this.occ[k], c = net.compOf[k] >= 0 ? net.comps[net.compOf[k]] : null, lvl = Math.max(1, this.pipeLvl[k]);
      const sref = seg || (nd && nd.kind !== 'junction' && nd.edges.length ? g.edgeById.get(nd.edges[0]) : null);
      return { tile: k, x: k % W, y: (k / W) | 0, pipe: !!this.pipe[k], node: nd ? nd.id : null, nodeKind: nd ? nd.kind : (this.pipe[k] ? 'segment' : null), branches: nd ? nd.edges.length : 0, edges: nd ? nd.edges.slice() : [],
        segment: sref ? sref.id : null, from: sref ? sref.a : null, to: sref ? sref.b : null, segTiles: sref ? sref.len : 0, comp: c ? c.id : -1, links: this.pipe[k] ? this.visualLinks(k) : 0,
        flow: net.flowK[k] || 0, pressure: net.pressK[k] || 0, capacity: this.pipe[k] ? this.pipeCapacity(k) : 0, live: net.live[k] === 1, connected: !!c && c.wells.length > 0 && c.tanks.length > 0, building: b ? b.type + '#' + b.id : null };
    }

    // Internal consistency check of the network (used by tests and the debug overlay). Returns a list of problems; empty = the graph, the routes,
    // the hydraulic edges and the flows all agree with the pipes that really exist.
    validateNetwork() {
      const bad = [], net = this.net, N = W * H, now = this.s.time;
      const owner = new Map();                                                                                   // every building: whole footprint inside the world, registered in occ, never sharing a cell
      for (const b of this.buildings) {
        const [fw, fh] = this.footprintOf(b.type);
        if (!inb(b.x, b.y) || !inb(b.x + fw - 1, b.y + fh - 1)) { bad.push('building #' + b.id + ' sticks out of the world'); continue; }
        for (const k of this.cellsOf(b)) {
          if (this.occ[k] !== b) bad.push('building #' + b.id + ' is not registered on cell ' + k);
          if (owner.has(k) && owner.get(k) !== b.id) bad.push('buildings #' + owner.get(k) + ' and #' + b.id + ' overlap at ' + k); owner.set(k, b.id);
        }
      }
      const adj = (a, b) => (Math.abs(a - b) === 1 && ((a / W) | 0) === ((b / W) | 0)) || Math.abs(a - b) === W;
      for (let k = 0; k < N; k++) {
        if (this.pipe[k] && this.occ[k] && this.occ[k].type !== 'pump') bad.push('pipe under a building at ' + k);
        if (net.live[k] === 1 && !this.pipe[k]) bad.push('live pipe without a pipe at ' + k);
        if (net.live[k] === 1 && this.pipeReady[k] > now) bad.push('unfinished pipe is live at ' + k);
        if (net.compOf[k] >= 0 && !net.live[k]) bad.push('component on empty tile ' + k);
        if (!net.live[k] && (net.flowK[k] > 1e-6)) bad.push('flow on a tile that is not live ' + k);
        if (this.valve[k] && !this.pipe[k] && !(this.occ[k] && this.occ[k].type === 'pump')) bad.push('valve without pipe ' + k);
      }
      for (const [wid, list] of net.routes) {
        const w = this.buildings.find(b => b.id === wid); if (!w) { bad.push('route of a missing well ' + wid); continue; }
        for (const r of list) {
          if (!this.buildings.includes(r.tank)) bad.push('route to a missing tank');
          let prev = this.cellsOf(w); 
          for (let i = 0; i < r.path.length; i++) {
            const k = r.path[i];
            if (net.live[k] !== 1 && net.live[k] !== 4) bad.push('route through a non-pipe tile ' + k);
            if (!(i ? adj(r.path[i - 1], k) : prev.some(p => adj(p, k)))) bad.push('route jumps between tiles at ' + k);
            if (this.vblock[k]) bad.push('route through a closed valve ' + k);
            if (net.compOf[k] !== net.compOf[this.cellsOf(w)[0]]) bad.push('route leaves its network at ' + k);
          }
          const last = r.path.length ? r.path[r.path.length - 1] : -1;
          if (!this.cellsOf(r.tank).includes(r.entry) || (last >= 0 ? !adj(last, r.entry) : !this.cellsOf(w).some(p => adj(p, r.entry)))) bad.push('route does not end at its tank');
          for (const e of r.elems) { if (!adj(e.k, e.next)) bad.push('edge ' + e.k + ' -> ' + e.next + ' is not between neighbours'); }
        }
      }
      for (const [k, e] of net.edges) if (e.id !== k || e.startNode !== k || !adj(e.startNode, e.endNode)) bad.push('bad hydraulic edge ' + k);
      for (const b of this.buildings) if (b.type === 'well' && (b.q || 0) > 1e-6 && !this.hyd.dirty) {     // (a pending recalculation will replace the plans on the next step)
        const pl = this.hyd.plans.find(p => p.w === b);
        if (!pl) bad.push('well ' + b.id + ' produces without a plan');
        else if (!net.routes.get(b.id) || !net.routes.get(b.id).includes(pl.r)) bad.push('well ' + b.id + ' plan uses a stale route');
      }
      this.validateGraph(bad);
      for (const m of this.validateLines()) bad.push('lines: ' + m);
      return bad;
    }

    // The logical graph against the real pipes: references, duplicates, orphans, impossible junctions, and "drawn link == solver link" for every finished tile.
    validateGraph(bad) {
      const net = this.net, g = net.graph, N = W * H;
      if (!g) { bad.push('graph missing'); return bad; }
      const adjT = (a, b) => (Math.abs(a - b) === 1 && ((a / W) | 0) === ((b / W) | 0)) || Math.abs(a - b) === W;
      const ids = new Set(); g.nodes.forEach((n, i) => { if (ids.has(n.id)) bad.push('duplicate node ' + n.id); ids.add(n.id); if (g.byId.get(n.id) !== i) bad.push('node ' + n.id + ' is not indexed');
        if (n.kind === 'junction') { if (n.deg < 3) bad.push('junction ' + n.id + ' has only ' + n.deg + ' links'); if (n.edges.length !== n.deg) bad.push('junction ' + n.id + ' has ' + n.deg + ' links but ' + n.edges.length + ' segments'); if (!this.pipe[n.k]) bad.push('junction ' + n.id + ' without a pipe'); }
        else if (n.kind === 'end') { if (n.edges.length > 1) bad.push('end ' + n.id + ' has ' + n.edges.length + ' segments'); if (!this.pipe[n.k]) bad.push('end ' + n.id + ' without a pipe'); }
        else if (!this.occ[n.k]) bad.push('node ' + n.id + ' has no building'); });
      const eIds = new Set(), used = new Set();
      for (const e of g.edges) {
        if (eIds.has(e.id)) bad.push('duplicate segment ' + e.id); eIds.add(e.id);
        const a = g.byId.get(e.a), b = g.byId.get(e.b);
        if (a === undefined || a < 0) bad.push('segment ' + e.id + ' has a missing start node ' + e.a); if (b === undefined || b < 0) bad.push('segment ' + e.id + ' has a missing end node ' + e.b);
        if (a === undefined || b === undefined || a < 0 || b < 0) continue;
        if (!g.nodes[a].edges.includes(e.id) || !g.nodes[b].edges.includes(e.id)) bad.push('segment ' + e.id + ' is not listed by its nodes');
        const cellsOf = n => n.b != null ? this.cellsOf(this.occ[n.k]) : [n.k];
        if (e.tiles.length) {
          const f = e.tiles[0], l = e.tiles[e.tiles.length - 1];
          if (!cellsOf(g.nodes[a]).some(c => adjT(c, f)) && !cellsOf(g.nodes[b]).some(c => adjT(c, f))) bad.push('segment ' + e.id + ' does not touch its nodes');
          if (!cellsOf(g.nodes[b]).some(c => adjT(c, l)) && !cellsOf(g.nodes[a]).some(c => adjT(c, l))) bad.push('segment ' + e.id + ' does not touch its nodes');
          for (let i = 0; i < e.tiles.length; i++) { const t = e.tiles[i]; if (net.live[t] !== 1) bad.push('segment ' + e.id + ' crosses a tile that is not a live pipe ' + t); if (i && !adjT(e.tiles[i - 1], t)) bad.push('segment ' + e.id + ' jumps at ' + t); if (used.has(t)) bad.push('tile ' + t + ' is in two segments'); used.add(t); if (g.segOf[t] < 0 || g.edges[g.segOf[t]] !== e) bad.push('segment index wrong at ' + t); if (g.tileNode[t] >= 0) bad.push('node tile ' + t + ' inside segment ' + e.id); }
        } else if (!cellsOf(g.nodes[a]).some(c => cellsOf(g.nodes[b]).some(d => adjT(c, d)))) bad.push('zero-length segment ' + e.id + ' between nodes that do not touch');
        if (g.nodes[a].comp !== g.nodes[b].comp) bad.push('segment ' + e.id + ' joins two networks');
      }
      for (const k of g.orphans) bad.push('orphan pipe tile ' + k);
      for (let k = 0; k < N; k++) {                                          // every live pipe tile is a node or inside exactly one segment
        if (net.live[k] !== 1) continue;
        if (g.tileNode[k] < 0 && g.segOf[k] < 0) { if (!g.orphans.includes(k)) bad.push('pipe tile ' + k + ' is in no segment'); }
        const m = this.visualMask(k);                                         // drawn link  ==  solver link (finished tiles, not beside a closed valve)
        for (let d = 0; d < 4; d++) {
          const nx = k % W + DIRV[d][0], ny = ((k / W) | 0) + DIRV[d][1]; if (!inb(nx, ny)) continue;
          const nk = idx(nx, ny); if (!net.live[nk] || this.vblock[nk] || this.vblock[k]) continue;
          const vis = (m >> d) & 1, log = net.conducts(k, nk) ? 1 : 0;
          if (vis && !log) bad.push('drawn link without a logical link at ' + k + ' -> ' + nk);
          if (!vis && log) bad.push('logical link without a drawn link at ' + k + ' -> ' + nk);
        }
      }
      return bad;
    }

    /* ================= Pipe entities (node-to-node layer) =================
       A pipe the player builds is ONE entity: { id, a, b, type, cells }.
         a / b   = connection node IDs:  'B<buildingId>'  a well / tank / pump
                                         'J<tile>'        a junction on an existing pipe tile
                                         'E<tile>'        an open end (nothing there)
         cells   = the tiles this pipe owns, in order from a to b
       The tile arrays (pipe, pipeLvl, pipeCond ...) are the simulation's internal grid. Every pipe tile belongs to exactly ONE entity
       (validateLines), the end nodes are always the nodes the geometry really touches, and the network graph / hydraulics are built
       from the same tiles - so what is drawn, what is stored and what is simulated cannot disagree. */
    lineAlive(k) { return this.pipe[k] === 1; }                       // a pump placed on a pipe is a NODE: it splits the pipe into two entities (in -> pump -> out)
    nodeOfBuilding(b) { return 'B' + b.id; }
    // the node an END cell of a line touches: a building next to it (not a pump inside the line), else another pipe next to it, else open
    endNode(cells, i) {
      const k = cells[i], other = cells.length > 1 ? cells[i === 0 ? 1 : cells.length - 2] : -1, own = new Set(cells), x = k % W, y = (k / W) | 0;
      let pipeN = null;
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRV[d][0], ny = y + DIRV[d][1]; if (!inb(nx, ny)) continue; const nk = idx(nx, ny); if (nk === other || own.has(nk)) continue;
        const b = this.occ[nk];
        if (b && b.type !== 'pump') return 'B' + b.id;
        if (b && b.type === 'pump') { const dv = DIRV[b.dir || 0]; if ((dv[0] !== 0) === (nx !== x)) return 'B' + b.id; continue; }
        if (this.pipe[nk] && pipeN == null) pipeN = 'J' + nk;
      }
      return pipeN || 'E' + k;
    }
    addLine(route, pipeType) {
      const cells = route.cells.map(c => idx(c[0], c[1])), fresh = new Set(route.fresh);
      const own = cells.filter(k => fresh.has(k)); if (!own.length) return null;
      const line = { id: this.s.nextLineId++, type: pipeType ? 1 : 0, cells: own, a: null, b: null, built: this.s.time };
      line.a = this.endNode(own, 0); line.b = this.endNode(own, own.length - 1); this.lineMeta(line);
      this.lines.push(line); this.lineOf = null; return line;
    }
    // Keep the entities equal to the tiles after ANY change (a tile erased, a branch removed, a pump placed / removed, a building moved, an old save):
    // dead tiles leave their line, a line cut in two becomes two lines, pipe tiles that belong to no line become new lines, end nodes are re-read.
    syncLines() {
      if (!this.lines) this.lines = [];
      const out = [], seen = new Uint8Array(W * H);
      for (const L of this.lines) {
        let run = [];
        const flush = () => { if (run.length) { out.push({ id: out.some(q => q.id === L.id) ? this.s.nextLineId++ : L.id, type: L.type, cells: run, a: null, b: null, built: L.built }); run = []; } };
        for (let i = 0; i < L.cells.length; i++) {
          const k = L.cells[i];
          if (!this.lineAlive(k) || seen[k]) { flush(); continue; }
          if (run.length) { const p = run[run.length - 1], dx = Math.abs(p % W - k % W), dy = Math.abs(((p / W) | 0) - ((k / W) | 0)); if (dx + dy !== 1) flush(); }
          run.push(k); seen[k] = 1;
        }
        flush();
      }
      // tiles no line owns (old saves, a pump removed and its pipe tile restored, tests that write tiles directly): one new line per straight-ish chain
      for (let k = 0; k < W * H; k++) {
        if (!this.pipe[k] || seen[k]) continue;
        const chain = [k]; seen[k] = 1; let cur = k, grew = true;
        while (grew) { grew = false; const x = cur % W, y = (cur / W) | 0; for (let d = 0; d < 4; d++) { const nx = x + DIRV[d][0], ny = y + DIRV[d][1]; if (!inb(nx, ny)) continue; const nk = idx(nx, ny); if (this.pipe[nk] && !seen[nk]) { chain.push(nk); seen[nk] = 1; cur = nk; grew = true; break; } } }
        out.push({ id: this.s.nextLineId++, type: this.pipeType[k] ? 1 : 0, cells: chain, a: null, b: null, built: this.s.time });
      }
      for (const L of out) { L.a = this.endNode(L.cells, 0); L.b = this.endNode(L.cells, L.cells.length - 1); this.lineMeta(L); }
      this.lines = out; this.lineOf = null;
    }
    lineAt(k) {
      if (!this.lineOf) { this.lineOf = new Map(); for (const L of this.lines) for (const c of L.cells) this.lineOf.set(c, L); }
      return this.lineOf.get(k) || null;
    }
    /* length = the real path in metres: one tile step = HC.TILE_M, plus half a tile where the pipe runs into a building / onto another pipe;
       state  = BUILDING (still being laid) | OPEN (an end leads nowhere yet - a valid state, it can be extended later) | CONNECTED (both ends on nodes) | INVALID (its tiles disagree with the network) */
    lineMeta(L) {
      const n = L.cells.length, ends = (L.a && L.a[0] !== 'E' ? .5 : 0) + (L.b && L.b[0] !== 'E' ? .5 : 0);
      L.len = +(((n - 1) + ends) * HC.TILE_M).toFixed(2);
      L.state = this.lineState(L); return L;
    }
    lineState(L) {
      if (!L.cells.length || L.cells.some(k => !this.pipe[k])) return 'INVALID';
      if (L.cells.some(k => this.pipeReady[k] > this.s.time)) return 'BUILDING';
      return L.a[0] === 'E' || L.b[0] === 'E' ? 'OPEN' : 'CONNECTED';
    }
    lineInfo(L) {
      const len = L.cells.length * HC.TILE_M; let flow = 0, cap = Infinity, live = true;
      for (const k of L.cells) { if (!this.pipe[k]) continue; flow = Math.max(flow, Math.abs(this.net.flowK[k] || 0)); cap = Math.min(cap, this.pipeCapacity(k)); if (this.net.live[k] !== 1) live = false; }
      return { id: L.id, a: L.a, b: L.b, type: L.type ? 'main' : 'branch', tiles: L.cells.length, length: L.len != null ? L.len : len, state: this.lineState(L), capacity: cap === Infinity ? 0 : cap, flow, connected: live && L.a[0] !== 'E' && L.b[0] !== 'E' };
    }
    // the ONE consistency check between entities and tiles (part of validateNetwork, so every test checks it after every change)
    validateLines() {
      const bad = [], owner = new Map();
      for (const L of this.lines) {
        if (!L.cells.length) bad.push('line ' + L.id + ' empty');
        L.cells.forEach((k, i) => {
          if (!this.lineAlive(k)) bad.push('line ' + L.id + ' owns a dead tile ' + k);
          if (owner.has(k)) bad.push('tile ' + k + ' owned by lines ' + owner.get(k) + ' and ' + L.id); owner.set(k, L.id);
          if (i) { const p = L.cells[i - 1]; if (Math.abs(p % W - k % W) + Math.abs(((p / W) | 0) - ((k / W) | 0)) !== 1) bad.push('line ' + L.id + ' has a gap at ' + k); }
        });
        if (L.cells.length && (L.a !== this.endNode(L.cells, 0) || L.b !== this.endNode(L.cells, L.cells.length - 1))) bad.push('line ' + L.id + ' end nodes ' + L.a + '/' + L.b + ' differ from the geometry');
      }
      for (let k = 0; k < W * H; k++) if (this.pipe[k] && !owner.has(k)) bad.push('pipe tile ' + k + ' belongs to no line');
      return bad;
    }

    /* ---------- connection nodes the player can tap ---------- */
    nodeAt(x, y) {
      if (!inb(x, y)) return null; const k = idx(x, y), b = this.occ[k];
      if (b) return { id: 'B' + b.id, kind: 'b', b, x: b.x, y: b.y };
      if (this.pipe[k]) return { id: 'J' + k, kind: 'j', k, x, y };
      return null;
    }
    nodeById(id) {
      if (!id) return null;
      if (id[0] === 'B') { const b = this.buildings.find(q => q.id === +id.slice(1)); return b ? { id, kind: 'b', b, x: b.x, y: b.y } : null; }
      const k = +id.slice(1); if (id[0] === 'J' && this.pipe[k]) return { id, kind: 'j', k, x: k % W, y: (k / W) | 0 };
      return null;
    }
    // the tiles a new pipe may start / end on for this node: free tiles around a building (along the axis for a pump), or the pipe tile itself for a junction
    nodePorts(n) {
      if (n.kind === 'j') return [[n.x, n.y]];
      const b = n.b, out = [], own = new Set(this.cellsOf(b));
      const dirs = b.type === 'pump' ? (DIRV[b.dir || 0][0] !== 0 ? [0, 1] : [2, 3]).map(i => DIRV[i]) : DIRV;
      for (const k of own) { const x = k % W, y = (k / W) | 0; for (const d of dirs) { const nx = x + d[0], ny = y + d[1]; if (!inb(nx, ny)) continue; const nk = idx(nx, ny); if (own.has(nk)) continue; if (b.type === 'pump' ? (!this.occ[nk]) : (!this.occ[nk] && !this.pipe[nk] && !this.map.water[nk] && !this.map.block[nk])) out.push([nx, ny]); } }
      return out;
    }
    // Auto-routing between two NODES: every port pair is judged by the same judge as any pipe (evalRoute); the shortest valid one with the
    // fewest bends wins; if no straight/L route works, the path search goes round obstacles from the closest port pairs. Runs only on a tap.
    routeNodes(aId, bId, pipeType = 0) {
      const A = this.nodeById(aId), B = this.nodeById(bId);
      const fail = reason => ({ ok: false, reason, cells: [], fresh: [], cost: 0, a: aId, b: bId, pipeType: pipeType ? 1 : 0 });
      if (!A || !B) return fail('badNode');
      if (aId === bId) return fail('sameNode');
      if (A.kind === 'j' && B.kind === 'j' && this.net.compOf[A.k] === this.net.compOf[B.k] && this.net.compOf[A.k] >= 0) return fail('sameNet');
      if (this.lines.some(L => (L.a === aId && L.b === bId) || (L.a === bId && L.b === aId))) return fail('duplicate');
      const PA = this.nodePorts(A), PB = this.nodePorts(B);
      if (!PA.length || !PB.length) return fail('noPort');                                 // every side of that building already has a pipe (or water / rock): join one of its pipes instead
      const bends = cells => { let n = 0; for (let i = 2; i < cells.length; i++) { const a = cells[i - 2], c = cells[i]; if (a[0] !== c[0] && a[1] !== c[1]) n++; } return n; };
      const L = (a, b, xFirst) => { const cells = [[a[0], a[1]]]; let x = a[0], y = a[1]; const sx = () => { while (x !== b[0]) { x += Math.sign(b[0] - x); cells.push([x, y]); } }, sy = () => { while (y !== b[1]) { y += Math.sign(b[1] - y); cells.push([x, y]); } }; if (xFirst) { sx(); sy(); } else { sy(); sx(); } return cells; };
      let best = null, bestScore = Infinity, firstReason = null;
      const pairs = []; for (const a of PA) for (const b of PB) pairs.push([a, b, Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])]);
      pairs.sort((p, q) => p[2] - q[2]);
      for (const [a, b] of pairs) for (const xf of [true, false]) {
        const r = this.evalRoute(L(a, b, xf), pipeType); if (!r.ok) { if (!firstReason) firstReason = r.reason; continue; }
        const sc = r.fresh.length + bends(r.cells) * 2; if (sc < bestScore) { bestScore = sc; best = r; }
      }
      if (!best) for (const [a, b] of pairs.slice(0, 6)) {
        const f = this.findPath(a[0], a[1], b[0], b[1]); if (!f.cells) continue;
        const r = this.evalRoute(f.cells, pipeType); if (!r.ok) continue;
        const sc = r.fresh.length + bends(r.cells) * 2; if (sc < bestScore) { bestScore = sc; best = r; best.auto = true; }
      }
      if (!best) return fail(firstReason && !ROUTE_BLOCKED.has(firstReason) ? firstReason : 'noRoute');
      const r = Object.assign({}, best, { a: aId, b: bId, pipeType: pipeType ? 1 : 0 });
      // the route must really end on both nodes (no gaps): the first / last cell is a port of its node
      const s0 = r.cells[0], s1 = r.cells[r.cells.length - 1], isPort = (P, c) => P.some(p => p[0] === c[0] && p[1] === c[1]);
      if (!isPort(PA, s0) || !isPort(PB, s1)) return fail('noRoute');
      r.connects = this.wouldConnect(r);
      return r;
    }
    // build a node-to-node route: one transaction, then the post-creation checks; if any fails the pipe is NOT kept
    buildLine(route) {
      if (!route || !route.ok) return { ok: false, reason: route ? route.reason : 'nothing' };
      const again = this.routeNodes(route.a, route.b, route.pipeType); if (!again.ok) return { ok: false, reason: again.reason };
      const cashBefore = this.s.cash, r = this.buildRoute(route, route.pipeType); if (!r.ok) return r;
      const L = r.line, endsOk = L && this.lines.some(q => q.id === L.id);
      const want = id => id[0] === 'J' ? (q => q[0] === 'J' || q[0] === 'B') : (q => q === id);       // a junction tile may itself be next to a building; the line then ends on that structure
      const probs = this.validateLines();
      if (!endsOk || !want(route.a)(L.a) || !want(route.b)(L.b) || probs.length) {
        for (const k of L ? L.cells : []) { if (this.pipe[k]) { this.pipe[k] = 0; this.pipeType[k] = 0; this.pipeLvl[k] = 0; this.pipeCond[k] = 0; this.pipeSt[k] = 0; this.pipeT[k] = 0; this.pipeReady[k] = 0; } }
        this.s.cash = cashBefore; this.rebuildNetwork();
        return { ok: false, reason: 'badLink', detail: probs.slice(0, 3).concat(L ? [L.a + '/' + L.b] : []) };
      }
      return Object.assign(r, { line: L });
    }

    isAnchor(x, y) {
      const test = (cx, cy) => inb(cx, cy) && (this.occ[idx(cx, cy)] || this.pipe[idx(cx, cy)]);
      return !!(test(x, y) || test(x + 1, y) || test(x - 1, y) || test(x, y + 1) || test(x, y - 1));
    }

    // Would this route join at least one well to one tank? (previews the result without building)
    wouldConnect(route) {
      const saved = this.pipe, savedNet = this.net;
      this.pipe = saved.slice();
      for (const k of route.fresh) this.pipe[k] = 1;
      const savedNext = this.nextReady, savedVer = this.netVersion;
      this.rebuildNetwork(true);
      let res = false;
      for (const cell of route.cells) {
        const ci = this.net.compOf[idx(cell[0], cell[1])];
        const comp = ci >= 0 ? this.net.comps[ci] : null;
        if (comp && comp.wells.length && comp.tanks.length) { res = true; break; }
      }
      this.pipe = saved; this.net = savedNet; this.nextReady = savedNext; this.netVersion = savedVer;          // a preview is not a topology change
      return res;
    }

    buildRoute(route, pipeType = (route && route.pipeType ? 1 : 0)) {
      if (!route || !route.ok) return { ok: false, reason: route ? route.reason : 'nothing' };
      route = this.evalRoute(route.cells, pipeType);                                       // the preview may be stale: judge the SAME cells again against the live state (one judge, one price)
      if (!route.ok) return { ok: false, reason: route.reason };
      if (this.s.cash < route.cost) return { ok: false, reason: 'cash' };       // nothing has been touched yet: a refusal leaves no partial pipe and no spent money
      this.s.cash -= route.cost; this.s.capex += route.cost;
      const per = Math.min(CFG.BUILD.pipeTile, CFG.BUILD.pipeMax / Math.max(1, route.fresh.length));
      route.fresh.forEach((k, i) => { this.pipe[k] = 1; this.pipeType[k] = pipeType ? 1 : 0; this.pipeLvl[k] = 1; this.pipeCond[k] = 1; this.pipeSt[k] = 0; this.pipeT[k] = 0; this.pipeReady[k] = per > 0 ? this.s.time + (i + 1) * per : 0; });
      const line = this.addLine(route, pipeType);                                         // the entity exists before the network is rebuilt, so it owns its tiles
      this.rebuildNetwork();
      // new tiles join their network at its current level, so extending a pipeline never lowers its capacity
      const fresh = new Set(route.fresh);
      for (const k of route.fresh) {
        const c = this.net.comps[this.net.compOf[k]]; let lv = 0;
        if (c) for (const p of c.pipes) if (!fresh.has(p)) lv = lv ? Math.min(lv, this.pipeLvl[p]) : this.pipeLvl[p];
        this.pipeLvl[k] = lv || 1;
      }
      this.rebuildNetwork();
      this.addLog('log.pipe', -route.cost, { n: route.fresh.length });
      return { ok: true, cost: route.cost, segments: route.fresh.length, line: line ? this.lines.find(q => q.id === line.id) || null : null };
    }

    removeAt(x, y) {
      if (!inb(x, y)) return { ok: false };
      const k = idx(x, y), b = this.occ[k];
      if (b) {
        const refund = Math.floor(b.invested * CFG.REFUND);
        this.s.cash += refund; this.s.refunds += refund;
        this.buildings.splice(this.buildings.indexOf(b), 1);
        this.clearOcc(b);
        if (b.type === 'pump' && b.hadPipe) { this.pipe[k] = 1; this.pipeType[k] = b.hadPipe[2] ? 1 : 0; this.pipeLvl[k] = b.hadPipe[0] || 1; this.pipeCond[k] = b.hadPipe[1] == null ? 1 : b.hadPipe[1]; this.pipeSt[k] = 0; this.pipeT[k] = 0; this.pipeReady[k] = 0; }
        this.rebuildNetwork();
        this.addLog('log.removed', refund, { what: b.type });
        return { ok: true, refund, what: b.type, lost: b.type === 'tank' ? b.amt : 0 };
      }
      if (this.pipe[k]) {
        const refund = Math.floor(CFG.COST.pipe * CFG.REFUND);
        this.pipe[k] = 0; this.pipeType[k] = 0; this.pipeLvl[k] = 0; this.pipeCond[k] = 0; this.pipeSt[k] = 0; this.pipeT[k] = 0; this.pipeReady[k] = 0; this.valve[k] = 0; this.vblock[k] = 0; this.valvePos[k] = 1;
        this.s.cash += refund; this.s.refunds += refund;
        this.rebuildNetwork();
        this.addLog('log.removedPipe', refund);
        return { ok: true, refund, what: 'pipe', lost: 0 };
      }
      return { ok: false, reason: 'nothing' };
    }

    /* ---------- upgrades: every one costs real money and changes real numbers ---------- */
    upgrade(b) {                               // wells and tanks
      if (b.level >= this.maxLevel(b)) return { ok: false, reason: 'maxlevel' };
      const cost = this.upgradeCost(b);
      if (this.s.cash < cost) return { ok: false, reason: 'cash' };
      this.s.cash -= cost; this.s.capex += cost; this.s.upgrades += cost; b.level++; b.invested += cost;
      if (b.type === 'well') b.rate = this.wellRate(b);
      if (b.type === 'pump') this.rebuildNetwork(); else this.hyd.dirty = true;
      this.addLog('log.upgrade', -cost, { what: b.type, n: b.level });
      this.events.push({ type: 'upgrade', id: b.id, kind: b.type, level: b.level });
      return { ok: true, cost, level: b.level };
    }

    pipeNet(k) { return this.net.comps[this.net.compOf[k]] || null; }
    // pipelines upgrade as a network: its weakest tiles go up one level
    pipeUpgradeInfo(k) {
      const c = this.pipeNet(k); if (!c || !c.pipes.length) return null;
      const lv = c.level;
      if (lv >= CFG.MAX_LEVEL) return { maxed: true, level: lv, cost: 0, tiles: [] };
      const tiles = c.pipes.filter(p => this.pipeLvl[p] === lv);
      return { maxed: false, level: lv, cost: tiles.length * CFG.UPGRADE.pipeTile[lv - 1], tiles, cap: CFG.PIPE.CAP[lv] };
    }
    upgradePipes(k) {
      const info = this.pipeUpgradeInfo(k);
      if (!info) return { ok: false, reason: 'nothing' };
      if (info.maxed) return { ok: false, reason: 'maxlevel' };
      if (this.s.cash < info.cost) return { ok: false, reason: 'cash' };
      this.s.cash -= info.cost; this.s.capex += info.cost; this.s.upgrades += info.cost;
      for (const p of info.tiles) this.pipeLvl[p]++;
      this.rebuildNetwork();
      this.addLog('log.upgradePipes', -info.cost, { n: info.level + 1 });
      this.events.push({ type: 'upgrade', kind: 'pipe', k, level: info.level + 1, tiles: info.tiles.length });
      return { ok: true, cost: info.cost, level: info.level + 1 };
    }

    /* ---------- maintenance and repairs (real operating costs) ---------- */
    spend(cost, kind) {
      const s = this.s;
      if (s.cash < cost) return false;
      s.cash -= cost; s.operatingCosts += cost; s[kind] += cost; s.profit = s.revenue - s.operatingCosts;
      return true;
    }
    maintenanceCost(b) { return Math.round(this.wellKind(b).maint * (CFG.MAINT_MIN + (1 - CFG.MAINT_MIN) * (1 - b.condition)) * 100) / 100; }
    maintain(b) {
      if (b.type !== 'well') return { ok: false, reason: 'nothing' };
      if (b.condition >= 0.999) return { ok: false, reason: 'good' };
      const cost = this.maintenanceCost(b);
      if (!this.spend(cost, 'maintenance')) return { ok: false, reason: 'cash' };
      b.condition = 1; b.rate = this.wellRate(b);
      this.addLog('log.maintenance', -cost, { what: 'well.' + b.kind });
      return { ok: true, cost };
    }
    repairCost(k) { return CFG.PIPE.REPAIR_COST * this.pipeLvl[k]; }
    repairPipe(k) {
      if (!this.pipe[k]) return { ok: false, reason: 'nothing' };
      if (this.pipeSt[k] === 2) return { ok: false, reason: 'repairing' };      // never twice
      if (this.pipeSt[k] !== 1) return { ok: false, reason: 'noleak' };
      const cost = this.repairCost(k);
      if (!this.spend(cost, 'repairs')) return { ok: false, reason: 'cash' };
      this.pipeSt[k] = 2; this.pipeT[k] = CFG.PIPE.REPAIR_TIME;
      this.addLog('log.repair', -cost);
      return { ok: true, cost };
    }

    /* ---------- exploration ---------- */
    explore(areaId) {
      const a = this.areas[areaId];
      if (!a || !a.land) return { ok: false, reason: 'nothing' };
      if (!this.regionOpen(a.region)) return { ok: false, reason: 'locked' };
      if (a.st === 1) return { ok: false, reason: 'exploring' };
      if (a.st === 2) return { ok: false, reason: 'known' };
      const cost = this.exploreCost(a);
      if (this.s.cash < cost) return { ok: false, reason: 'cash' };
      this.s.cash -= cost; this.s.capex += cost; this.s.exploration += cost;
      a.st = 1; a.end = this.s.time + CFG.EXPLORE.TIME;
      this.addLog('log.explore', -cost);
      return { ok: true, cost };
    }
    exploreCost(a) { return CFG.REGIONS[a.region - 1].explore; }

    /* ---------- regions ---------- */
    // LOCKED -> (pay + enough cash) AVAILABLE -> (an area explored) EXPLORED -> (a well built) ACTIVE
    regionState(id) {
      if (!this.regionOpen(id)) return 'LOCKED';
      let found = false;
      for (const b of this.buildings) if (b.type === 'well' && this.areaAt(b.x, b.y).region === id) return 'ACTIVE';
      for (const a of this.areas) if (a.region === id && a.st === 2) found = true;
      return found ? 'EXPLORED' : 'AVAILABLE';
    }
    regionInfo(id) {
      const R = CFG.REGIONS[id - 1], st = this.regionState(id);
      let n = 0, found = 0, wells = 0, expl = 0, pot = 0, land = 0;
      for (const a of this.areas) if (a.region === id && a.land) { land++; if (a.st === 2) { found++; if (a.kind !== 'empty') pot += a.potential; } if (a.st === 1) expl++; }
      for (const b of this.buildings) if (b.type === 'well' && this.areaAt(b.x, b.y).region === id) wells++;
      const E = CFG.EXPLORE; let avg = 0; for (const k in R.chance) avg += R.chance[k] * (E.POTENTIAL[k] || 0);
      return { id, key: R.key, state: st, terrain: R.terrain, constructionMult: R.mult, explorationCost: R.explore, riskLevel: R.risk, discovered: found > 0 || st !== 'LOCKED',
        reservePotential: Math.round(avg), oilChance: 1 - (R.chance.empty || 0), unlockCost: R.unlock, unlockNeed: R.need, areas: land, explored: found, exploring: expl, wells, knownPotential: pot };
    }
    unlockRegion(id) {
      const R = CFG.REGIONS[id - 1];
      if (!R) return { ok: false, reason: 'nothing' };
      if (this.regionOpen(id)) return { ok: false, reason: 'known' };
      if (this.s.cash < R.need) return { ok: false, reason: 'needCash', need: R.need };
      if (this.s.cash < R.unlock) return { ok: false, reason: 'cash' };
      this.s.cash -= R.unlock; this.s.capex += R.unlock; this.s.regionSpend += R.unlock;
      this.s.regions[id - 1].unlocked = true;
      this.addLog('log.region', -R.unlock, { n: id });
      this.events.push({ type: 'region', id });
      return { ok: true, cost: R.unlock };
    }

    // what the player is allowed to know about an area
    areaInfo(a) {
      const base = { id: a.id, ax: a.ax, ay: a.ay, region: a.region, land: a.land, state: a.st === 2 ? 'discovered' : a.st === 1 ? 'exploring' : 'unexplored', progress: a.st === 1 ? Math.min(1, 1 - (a.end - this.s.time) / CFG.EXPLORE.TIME) : 0 };
      if (a.st !== 2) return base;
      return Object.assign(base, { kind: a.kind, reserveSize: a.size, remaining: a.remaining, quality: a.quality, productionPotential: a.potential, wells: this.buildings.filter(b => b.type === 'well' && b.area === a.id).length });
    }

    /* ---------- pipe network ---------- */
    // The pipe network is a graph: pipe tiles, wells and tanks are nodes, neighbouring tiles are edges. It is rebuilt only when something
    // changes (build, remove, upgrade, repair, a construction finishing), never per frame. For every well it stores its reachable tanks
    // sorted by path length (the "routes"); the step loop then only has to walk those short lists.
    rebuildNetwork(light) {
      if (!light) this.syncLines();                                    // the pipe entities always describe exactly the tiles that exist
      const N = W * H, now = this.s.time;
      const vis = new Uint8Array(N);  // 1 pipe, 2 well, 3 tank, 4 pump  (everything that exists: used for drawing)
      for (let k = 0; k < N; k++) if (this.pipe[k]) vis[k] = 1;
      for (const b of this.buildings) for (const k of this.cellsOf(b)) vis[k] = b.type === 'well' ? 2 : b.type === 'tank' ? 3 : 4;
      // unfinished pipes / buildings are on the map but not in the working network yet
      const type = vis.slice(); let nextReady = Infinity;
      for (let k = 0; k < N; k++) if (this.pipe[k] && this.pipeReady[k] > now) { type[k] = 0; if (this.pipeReady[k] < nextReady) nextReady = this.pipeReady[k]; }
      for (const b of this.buildings) if (b.ready > now) { for (const k of this.cellsOf(b)) type[k] = 0; if (b.ready < nextReady) nextReady = b.ready; }
      this.nextReady = nextReady;
      const occ = this.occ, vb = this.vblock;
      if (!light) { this.vlist = new Set(); for (let k = 0; k < N; k++) { vb[k] = this.valve[k] === 3 && this.valvePos[k] < 0.03 && type[k] === 1 ? 1 : 0; if (this.valve[k]) this.vlist.add(k); } }
      const pumpFront = k => { const d = DIRV[occ[k].dir || 0]; return d[0] + d[1] * W; };      // index step from the pump to the tile it pushes oil into
      const conducts = (a, b) => {
        if (!type[a] || !type[b]) return false;
        if (occ[a] && occ[a] === occ[b]) return true;            // cells of one building
        if (vb[a] || vb[b]) return false;                        // a fully closed valve
        if (type[a] === 4 || type[b] === 4) {                    // a pump only connects at its back (input) and its front (output)
          const pk = type[a] === 4 ? a : b, o = pk === a ? b : a;
          if (type[o] === 4) return false;
          const f = pumpFront(pk); return o - pk === f || o - pk === -f;
        }
        return !(type[a] === type[b] && type[a] !== 1);         // well-well and tank-tank do not connect
      };
      const nbrs = k => {
        const x = k % W, y = (k / W) | 0, out = [];
        if (x + 1 < W) out.push(k + 1);
        if (x > 0) out.push(k - 1);
        if (y + 1 < H) out.push(k + W);
        if (y > 0) out.push(k - W);
        return out;
      };
      const compOf = new Int32Array(N).fill(-1), comps = [];
      for (let k = 0; k < N; k++) {
        if (!type[k] || compOf[k] >= 0) continue;
        const c = { id: comps.length, pipes: [], wells: [], tanks: [], pumps: [], flow: 0 };
        const seen = new Set(), q = [k]; compOf[k] = c.id;
        while (q.length) {
          const a = q.pop();
          if (type[a] === 1) c.pipes.push(a);
          else { const b = occ[a]; if (b && !seen.has(b)) { seen.add(b); (b.type === 'well' ? c.wells : b.type === 'tank' ? c.tanks : c.pumps).push(b); } }
          for (const n of nbrs(a)) if (compOf[n] < 0 && conducts(a, n)) { compOf[n] = c.id; q.push(n); }
        }
        comps.push(c);
      }
      // shortest path from every well to every tank it can reach THROUGH PIPES AND PUMPS (a tank is an end point, oil never passes through one;
      // oil enters a pump at its back and leaves at its front). Every route also lists its hydraulic elements (pipe tiles and pumps).
      const routes = new Map(), edges = new Map();
      if (!light) {
        const par = new Int32Array(N), dist = new Int16Array(N);
        for (const w of this.buildings) {
          if (w.type !== 'well' || type[this.cellsOf(w)[0]] !== 2) continue;
          par.fill(-2); const q = [], list = [], found = new Set();
          for (const k of this.cellsOf(w)) { par[k] = -1; dist[k] = 0; q.push(k); }
          for (let i = 0; i < q.length; i++) {
            const a = q[i];
            for (const n of nbrs(a)) {
              if (par[n] !== -2 || !conducts(a, n)) continue;
              if (type[a] === 4 && n - a !== pumpFront(a)) continue;              // leave a pump only through its front
              if (type[n] === 4 && n - a !== pumpFront(n)) continue;              // enter a pump only through its back
              if (type[n] === 3) {                                   // reached a tank: record the route once, do not continue through it
                const t = occ[n];
                if (!found.has(t)) {
                  found.add(t); const path = []; for (let c = a; c >= 0 && (type[c] === 1 || type[c] === 4); c = par[c]) path.push(c); path.reverse();
                  const elems = path.map((k, j) => {
                    const prev = j ? path[j - 1] : par[k], next = j + 1 < path.length ? path[j + 1] : n;
                    let cnt = 0; for (const nb of nbrs(k)) if (conducts(k, nb)) cnt++;
                    const pump = type[k] === 4;
                    return { k, kind: pump ? 'pump' : 'pipe', b: pump ? occ[k] : null, K: pump ? HC.K.PUMP : ((k - prev !== next - k ? HC.K.ELBOW : 0) + (cnt >= 3 ? HC.K.TEE : 0)), next };
                  });
                  list.push({ tank: t, len: path.length, path, entry: n, elems });
                }
                continue;
              }
              if (type[n] !== 1 && type[n] !== 4) continue;          // never through another well
              par[n] = a; dist[n] = dist[a] + 1; q.push(n);
            }
          }
          list.sort((p, r) => p.len - r.len || p.tank.id - r.tank.id);
          routes.set(w.id, list);
          for (const r of list) for (const e of r.elems) if (!edges.has(e.k)) {      // hydraulic edge of this tile (start node = the tile, end node = where the oil goes next)
            const lvl = Math.max(1, this.pipeLvl[e.k]);
            edges.set(e.k, { id: e.k, startNode: e.k, endNode: e.next, length: HC.TILE_M, diameter: e.kind === 'pump' ? HC.DIAM[1] : this.pipeDiameter(e.k), roughness: HC.ROUGH,
              capacity: e.kind === 'pump' ? Hyd.pumpSpec(e.b.level).Qmax : this.pipeCapacity(e.k), oilDensity: HC.RHO, viscosity: HC.MU, currentFlow: 0, pressureDrop: 0, velocity: 0, connected: true, blocked: false, pumpId: e.kind === 'pump' ? e.b.id : null });
          }
        }
      }
      // distance to the nearest tank (kept for compatibility with older code and tests)
      const dist = new Int16Array(N).fill(-1), q = [];
      for (const b of this.buildings) if (b.type === 'tank' && b.ready <= now) for (const k of this.cellsOf(b)) { dist[k] = 0; q.push(k); }
      for (let i = 0; i < q.length; i++) {
        const a = q[i];
        for (const n of nbrs(a)) if (dist[n] < 0 && conducts(a, n)) { dist[n] = dist[a] + 1; q.push(n); }
      }
      const next = new Int32Array(N).fill(-1);
      for (let k = 0; k < N; k++) {
        if (type[k] !== 1 || dist[k] < 0) continue;
        let best = -1;
        for (const n of nbrs(k)) if (dist[n] >= 0 && dist[n] < dist[k] && conducts(k, n) && (best < 0 || dist[n] < dist[best])) best = n;
        next[k] = best;
      }
      // actual flow through every tile (filled by step): bbl/min, the neighbour the oil moves to, and the solved pressure (bar) at the tile
      this.net = { comps, compOf, dist, next, type: vis, live: type, routes, edges, flowK: new Float32Array(N), fnext: new Int32Array(N).fill(-1), fsrc: new Int32Array(N).fill(-1), pressK: new Float32Array(N), dpK: new Float32Array(N), velK: new Float32Array(N) };
      this.net.conducts = conducts;
      this.net.graph = light ? null : this.buildGraph(type, conducts, nbrs);     // the logical graph is derived from the SAME tiles + the SAME link rule: it can never disagree with them
      for (const c of comps) this.updateComp(c);
      this.netVersion = (this.netVersion || 0) + 1;
      if (!light) this.hyd.dirty = true;
    }

    /* ---------- the logical network graph (Phase 6) ----------
       NODES: every well / tank / pump station, every pipe JUNCTION (a pipe tile with 3 or 4 links: T and + junctions, any number of branches) and every pipe END
       (a dead end). EDGES: the pipe SEGMENTS between two nodes (corners and straight tiles are just part of a segment). The graph is built only when the topology
       changes (inside rebuildNetwork), from the same link rule the hydraulic solver and the renderer use. Ids are deterministic - a junction is "J<tile>", a segment
       "S<lowest tile>" - so they are identical after save/load and nothing has to be stored separately. Splitting a pipe by joining a branch to its middle, or merging two
       segments again after a branch is removed, therefore happens by itself: there is no second copy of the topology that could drift away from the pipes. */
    buildGraph(type, conducts, nbrs) {
      const N = W * H, occ = this.occ, compOf = this.net.compOf;
      const nodes = [], edges = [], byId = new Map(), tileNode = new Int32Array(N).fill(-1), segOf = new Int32Array(N).fill(-1);
      const add = (id, kind, k, b) => { const n = { id, kind, k, x: k % W, y: (k / W) | 0, b: b ? b.id : null, deg: 0, edges: [], comp: compOf[k] }; byId.set(id, nodes.length); nodes.push(n); return nodes.length - 1; };
      const pipes = [];
      for (let k = 0; k < N; k++) {
        if (type[k] === 1) {
          let d = 0; for (const n of nbrs(k)) if (conducts(k, n)) d++;
          if (d >= 3) tileNode[k] = add('J' + k, 'junction', k); else if (d <= 1) tileNode[k] = add('E' + k, 'end', k);
          if (tileNode[k] >= 0) nodes[tileNode[k]].deg = d;
          pipes.push(k);
        }
      }
      for (const b of this.buildings) {
        const cells = this.cellsOf(b); if (!type[cells[0]]) continue;                      // unfinished buildings are not in the working network yet
        const id = add((b.type === 'well' ? 'W' : b.type === 'tank' ? 'T' : 'P') + b.id, b.type, cells[0], b);
        for (const c of cells) tileNode[c] = id;
      }
      const loopId = (a, b) => 'L' + (a < b ? a + '~' + b : b + '~' + a);
      for (let ni = 0; ni < nodes.length; ni++) {
        const n = nodes[ni], cells = n.b != null ? this.cellsOf(occ[n.k]) : [n.k];
        for (const c of cells) for (const m of nbrs(c)) {
          if (tileNode[m] === ni || !conducts(c, m)) continue;
          if (tileNode[m] >= 0) {                                           // two nodes side by side: a segment without pipe tiles (well beside a pipe junction, tank touching a junction...)
            if (tileNode[m] < ni) continue;
            const a = nodes[ni], bn = nodes[tileNode[m]], id = loopId(a.id, bn.id);
            if (byId.has(id)) continue;
            byId.set(id, -1); edges.push({ id, a: a.id, b: bn.id, tiles: [], len: 0, level: 0 }); a.edges.push(id); bn.edges.push(id); continue;
          }
          if (segOf[m] >= 0) continue;                                      // this segment was already walked from its other end
          const tiles = []; let prev = c, cur = m, end = -1, guard = 0;
          while (guard++ < N) {
            tiles.push(cur); let nx = -1;
            for (const q of nbrs(cur)) if (q !== prev && conducts(cur, q)) { nx = q; break; }
            if (nx < 0) break;                                              // cannot happen for an interior tile (it has exactly two links); a safety net
            if (tileNode[nx] >= 0) { end = tileNode[nx]; break; }
            prev = cur; cur = nx;
          }
          if (end < 0) continue;
          const id = 'S' + Math.min.apply(null, tiles); let lv = 9; for (const t of tiles) lv = Math.min(lv, Math.max(1, this.pipeLvl[t]));
          const ei = edges.length; for (const t of tiles) segOf[t] = ei;
          edges.push({ id, a: n.id, b: nodes[end].id, tiles, len: tiles.length, level: lv }); n.edges.push(id); nodes[end].edges.push(id);
        }
      }
      const orphans = []; for (const k of pipes) if (tileNode[k] < 0 && segOf[k] < 0) orphans.push(k);     // a closed ring of pipe that touches nothing
      let junctions = 0, ends = 0; for (const n of nodes) { if (n.kind === 'junction') junctions++; else if (n.kind === 'end') ends++; }
      const edgeById = new Map(); for (const e of edges) edgeById.set(e.id, e);
      return { nodes, edges, byId, edgeById, tileNode, segOf, orphans, junctions, ends };
    }
    graphNode(k) { const g = this.net.graph; return g && g.tileNode[k] >= 0 ? g.nodes[g.tileNode[k]] : null; }
    graphSegment(k) { const g = this.net.graph; return g && g.segOf[k] >= 0 ? g.edges[g.segOf[k]] : null; }
    // plain, comparable copy of the graph (tests, debug, save/load comparison)
    graphSnapshot() {
      const g = this.net.graph; if (!g) return null;
      const nodes = g.nodes.map(n => ({ id: n.id, kind: n.kind, k: n.k, deg: n.edges.length, edges: n.edges.slice().sort(), comp: n.comp })).sort((p, q) => (p.id < q.id ? -1 : 1));
      const edges = g.edges.map(e => ({ id: e.id, a: e.a, b: e.b, len: e.len, level: e.level })).sort((p, q) => (p.id < q.id ? -1 : 1));
      return { nodes, edges, junctions: g.junctions, ends: g.ends, orphans: g.orphans.length };
    }

    /* The links of one pipe tile as the player SEES them (bit d set = connected towards DIRV[d]). The renderer draws exactly these; validateNetwork() compares them
       with the links the hydraulic solver uses, so a drawn connection is a logical one and the other way round. */
    visualMask(k) {
      const x = k % W, y = (k / W) | 0, type = this.net.type; let m = 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRV[d][0], ny = y + DIRV[d][1]; if (!inb(nx, ny)) continue;
        const nk = idx(nx, ny), nt = type[nk];
        if (nt === 1 && this.vblock[nk] && !this.valve[k]) continue;                // oil does not pass a fully closed valve: the pipe visibly ends there
        if (nt === 1 || nt === 2 || nt === 3) m |= 1 << d;
        else if (nt === 4) { const pb = this.occ[nk]; if (pb && (pb.dir < 2) === (DIRV[d][0] !== 0)) m |= 1 << d; }      // a pump only joins at its back and front
      }
      return m;
    }
    visualLinks(k) { const m = this.visualMask(k); let n = 0; for (let d = 0; d < 4; d++) n += (m >> d) & 1; return n; }

    // capacity of a network = its weakest tile; every leaking / repairing tile loses part of the oil
    updateComp(c) {
      let lv = 0, leaks = 0;
      for (const p of c.pipes) { const l = Math.max(1, this.pipeLvl[p]); lv = lv ? Math.min(lv, l) : l; if (this.pipeSt[p]) leaks++; }
      c.level = lv || 1; c.cap = c.pipes.length ? Math.min.apply(null, c.pipes.map(p => this.pipeCapacity(p))) : 0; c.speed = CFG.PIPE.SPEED[c.level - 1];
      c.leaks = leaks; c.leakFactor = Math.pow(1 - CFG.PIPE.LEAK_LOSS, leaks);
    }

    /* ---------- what the player is shown about the network (read only) ---------- */
    underConstruction() { const t = this.s.time; return this.buildings.some(b => b.ready > t) || this.nextReady < Infinity; }
    buildProgress(b) { const t = this.s.time; return b.ready > t ? clamp(1 - (b.ready - t) / Math.max(1e-6, b.ready - (b.built == null ? b.ready - 1 : b.built)), 0, 1) : 1; }
    wellNet(b) {
      const routes = this.net.routes.get(b.id) || [];
      const tank = b.target != null ? this.buildings.find(q => q.id === b.target) : null;
      return { connected: routes.length > 0, ready: !(b.ready > this.s.time), progress: this.buildProgress(b), target: tank, why: b.why || null, flow: b.out || 0,
        routes: routes.length, pathTiles: b.target != null && routes.length ? (routes.find(r => r.tank.id === b.target) || routes[0]).len : 0, nearest: routes.length ? routes[0].tank : null };
    }
    tankNet(t) {
      const wells = this.buildings.filter(w => w.type === 'well' && w.target === t.id && (w.out || 0) > 0);
      const linked = this.buildings.filter(w => w.type === 'well' && (this.net.routes.get(w.id) || []).some(r => r.tank === t));
      return { inflow: t.inflow || 0, full: t.amt >= this.tankCap(t) - 1e-6, ready: !(t.ready > this.s.time), progress: this.buildProgress(t), feeding: wells, linked };
    }
    pipeStat(k) {
      const net = this.net, c = net.comps[net.compOf[k]], lvl = Math.max(1, this.pipeLvl[k]);
      const live = net.live[k] === 1, flow = net.flowK[k] || 0, cap = this.pipeCapacity(k);
      let issue = null;
      if (!live) issue = 'building'; else if (this.pipeSt[k] === 2) issue = 'repair'; else if (this.pipeSt[k] === 1) issue = 'leak';
      else if (!c || !c.wells.length) issue = 'noWell'; else if (!c.tanks.length) issue = 'noTank';
      else if (flow <= 0.01 && c.wells.every(w => !(w.out > 0))) issue = c.wells.some(w => w.why === 'full') ? 'full' : 'idle';
      else if (flow >= cap - 1e-6) issue = 'atCap';
      const src = net.fsrc[k] >= 0 ? this.buildings.find(b => b.id === net.fsrc[k]) : null, nx = net.fnext[k] >= 0 ? this.occ[net.fnext[k]] : null;
      return { connected: !!c && c.wells.length > 0 && c.tanks.length > 0, flow, cap, level: lvl, issue, from: src, to: nx && nx.type === 'tank' ? nx : null };
    }

    isWellConnected(b) { const r = this.net.routes.get(b.id); return !!r && r.length > 0; }   // a real path to at least one finished tank

    /* ---------- hydraulics (Phase 8) ---------- */
    // The oil is moved by PRESSURE. A well offers its reservoir pressure; the route to a tank costs pressure (friction, bends, valves, the
    // tank's own back-pressure) and pumps give some back. Q = rate x clamp((Pres - Preq) / (Pres - Pwellhead), 0, 1).
    // hydSolve() finds, a few times per second (and on every network change), the steady target flow of every well. step() then moves the real
    // flow toward that target with a time constant (dQ/dt = (Qtarget - Q) / tau), so nothing jumps.
    resBar(w) { return HC.RES_BAR[w.kind || 'small'] * (HC.RES_FLOOR + (1 - HC.RES_FLOOR) * w.pressure); }
    // loss (bar) of one element at F bbl/min: friction (table) + minor losses K x rho v^2 / 2. Same physics as Hyd.loss, read from a table for speed.
    elemLoss(e, F, extraK, out) {
      const T = HT || initHT(), k = e.k, pump = e.kind === 'pump', li = pump ? 1 : (this.pipeLvl[k] > 1 ? this.pipeLvl[k] - 1 : 0) + (this.pipeType[k] ? HC.DIAM.length : 0);
      F = F > 0 ? F : 0;
      let fr;
      if (F >= LUT_MAX) { const r = F / LUT_MAX, tn = T.nw[li], tw = T.wr[li]; fr = (tw[LUT_N] + (tn[LUT_N] - tw[LUT_N]) * (pump ? 1 : this.pipeCond[k])) * r * r; }
      else { const x = F * (1 / LUT_STEP), i = x | 0, f = x - i, tn = T.nw[li], tw = T.wr[li], a = tn[i] + (tn[i + 1] - tn[i]) * f, c = pump ? 1 : this.pipeCond[k]; fr = c >= 1 ? a : tw[i] + (tw[i + 1] - tw[i]) * f + (a - (tw[i] + (tw[i + 1] - tw[i]) * f)) * c; }
      const v = F * T.vk[li], K = e.K + extraK + (!pump && this.valve[k] ? this.valveK(k) : 0), r = fr + K * T.dyn * v * v;
      if (out) out.v = v;
      return r < HC.P_MAX ? (r > 0 ? r : 0) : HC.P_MAX;
    }
    elemCap(e) { return e.kind === 'pump' ? Hyd.pumpSpec(e.b.level).Qmax : this.pipeCapacity(e.k) * (this.valve[e.k] ? Math.max(0, Math.min(1, this.valvePos[e.k])) : 1); }
    // pressure the well head must supply to push `F` bbl/min along route r; per-tile flow comes from `Fk` (+ own flow when `own` is true)
    routePreq(r, F, Fk, add) {
      const el = r.elems, n = el.length, t = r.tank; let p = Hyd.tankBack(t.amt / this.tankCap(t));
      for (let i = n - 1; i >= 0; i--) {                         // backwards from the tank
        const e = el[i], f = add ? Fk[e.k] + F : Math.max(Fk[e.k], F);
        p += this.elemLoss(e, f, (i === n - 1 ? HC.K.TANK : 0) + (i === 0 ? HC.K.WELL : 0));
        if (e.kind === 'pump' && e.b.enabled && !(e.b.ready > this.s.time)) p = Math.max(HC.P_SUCTION, p - Hyd.pumpBoost(e.b.level, f, 1));   // a pump cannot pull oil through a long suction line
      }
      if (!n) p += HC.K.TANK * 0.01;
      return p;
    }
    // The flow of ONE well, with the other wells' flow fixed: the root of h(f) = f - rate x g(Preq(f)). g falls as f grows, so h rises: Illinois (regula falsi) is safe.
    solveWell(pl, F) {
      const span = Math.max(0.1, pl.Pres - HC.P_WH), rate = pl.rate;
      const g = f => rate * Math.min(1, Math.max(0, fin((pl.Pres - this.routePreq(pl.r, f, F, true)) / span))) - f;     // = -h(f)
      if (rate <= 1e-9) return 0;
      let a = 0, b = rate, ga = g(a), gb = g(b);
      if (ga <= 0) return 0;
      if (gb >= 0) return rate;
      let side = 0;
      for (let i = 0; i < 24; i++) {
        const c = (a * gb - b * ga) / (gb - ga), gc = g(c);
        if (Math.abs(gc) < 1e-5 * rate || Math.abs(b - a) < 1e-6) return c;
        if (gc * gb > 0) { b = c; gb = gc; if (side === -1) ga *= 0.5; side = -1; } else { a = c; ga = gc; if (side === 1) gb *= 0.5; side = 1; }
      }
      return (a + b) / 2;
    }
    hydSolve(wells) {
      const hy = this.hyd, net = this.net, now = this.s.time, F = hy.F, touched = hy.touched, ZERO = 0;
      hy.clock = 0; hy.dirty = false; hy.solves++; hy.solved = true;
      // 1. choose a route for every well (lowest required pressure among tanks that have room, with hysteresis so it does not flap)
      const plans = [], keep = new Map(); for (const pl of hy.plans) keep.set(pl.w.id, pl);
      const used = new Set();
      for (const w of wells) {
        w.target = null; w.why = null; w.lim = null;
        if (w.ready > now) { w.status = 'building'; w.why = 'building'; w.qt = 0; continue; }
        if (w.blocked) { w.status = w.blocked; w.why = w.blocked; w.qt = 0; continue; }
        const routes = net.routes.get(w.id) || [];
        if (!routes.length) { const c = net.comps[net.compOf[idx(w.x, w.y)]]; w.status = c && (c.pipes.length || c.pumps.length) ? 'nostorage' : 'nopipe'; w.why = w.status; w.qt = 0; continue; }
        const Pres = this.resBar(w), est = Math.max(0.1, w.rate), prev = keep.get(w.id);
        let best = null, bp = Infinity, cur = null, cp = Infinity, count = 0;
        for (const r of routes) {
          const t = r.tank; if (t.ready > now || this.tankCap(t) - t.amt <= 1e-6) continue;
          if (++count > 8) break;
          const pq = this.routePreq(r, est, F, false) + HC.PATH_COST * r.path.length;     // pressure cost + a small price per tile of pipe
          if (pq < bp - 1e-9) { bp = pq; best = r; }
          if (prev && prev.r.tank === t) { cur = r; cp = pq; }
        }
        if (!best) { w.status = 'full'; w.why = 'full'; w.target = routes[0].tank.id; w.qt = 0; continue; }
        const pick = cur && cp <= bp + HC.HYST ? cur : best;
        w.target = pick.tank.id;
        plans.push({ w, r: pick, Pres, rate: w.rate, f: Math.min(w.rate, prev ? prev.qt : w.rate * 0.5), qt: 0, cap: 1, lim: null, lf: 1 });
      }
      // 2. iterate (damped fixed point): tile flows -> pressure demand of every well -> new well flows
      for (const k of touched) F[k] = 0; touched.length = 0;
      let it = 0, conv = plans.length === 0, maxd = 0;
      for (; it < HC.SOLVER.ITER && !conv; it++) {
        for (const k of touched) F[k] = ZERO; touched.length = 0;
        for (const pl of plans) for (const e of pl.r.elems) { if (!F[e.k]) touched.push(e.k); F[e.k] += pl.f; }
        maxd = 0;
        for (const pl of plans) {
          for (const e of pl.r.elems) F[e.k] -= pl.f;                          // the flow of the other wells on this route
          const sol = this.solveWell(pl, F), nf = pl.f + HC.SOLVER.DAMP * (sol - pl.f); maxd = Math.max(maxd, Math.abs(nf - pl.f) / Math.max(1, pl.rate)); pl.f = nf;     // the error is relative to the well's size
          for (const e of pl.r.elems) F[e.k] += pl.f;
        }
        if (maxd < HC.SOLVER.TOL) conv = true;
      }
      hy.iters = it; hy.maxd = maxd; hy.converged = conv;
      if (!conv) { hy.warn++; hy.lastError = 'no convergence (' + maxd.toExponential(2) + ')'; for (const pl of plans) { const pv = keep.get(pl.w.id); if (pv && pv.stable) pl.f = Math.min(pl.f, pv.qt); } }     // keep the last stable flow of a well that was solved before; a new one keeps its best estimate
      // 3. capacity: no tile carries more than it can; wells sharing a tile share what it can carry
      for (const k of touched) F[k] = ZERO; touched.length = 0;
      for (const pl of plans) for (const e of pl.r.elems) { if (!F[e.k]) touched.push(e.k); F[e.k] += pl.f; }
      for (const pl of plans) {
        let sc = 1;
        for (const e of pl.r.elems) { const c = this.elemCap(e), ld = F[e.k]; if (ld > c) sc = Math.min(sc, c / ld); }
        if (sc < 1 - 1e-9) { pl.f *= sc; pl.lim = 'capacity'; }
      }
      for (const k of touched) F[k] = ZERO; touched.length = 0;
      for (const pl of plans) for (const e of pl.r.elems) { if (!F[e.k]) touched.push(e.k); F[e.k] += pl.f; }
      // 4. results: target flow, limiting reason, hammer, pressures, pump / edge data
      net.pressK.fill(0); const pumpUse = new Set();
      for (const pl of plans) {
        const w = pl.w, wasQt = w.qt || 0;
        pl.qt = Math.max(0, fin(pl.f)); if (pl.qt < 1e-4) pl.qt = pl.f = 0; w.qt = pl.qt;        // the damped iteration leaves a residue (1e-5...) when the well cannot push at all: that is 0
        if (!pl.lim && pl.qt < pl.rate * 0.995) pl.lim = 'pressure';
        w.lim = pl.lim;
        const drop = wasQt - pl.qt; if (drop > 0.4) w.hm = Math.min(HC.HAMMER.MAX, (w.hm || 0) + HC.HAMMER.PER_BBL * drop);
        const el = pl.r.elems, n = el.length, lo = this._lo || (this._lo = {}), ls = [], bs = [];
        let p = Hyd.tankBack(pl.r.tank.amt / this.tankCap(pl.r.tank)), boostSum = 0;
        for (let i = n - 1; i >= 0; i--) {                       // backwards from the tank: the pressure the well head has to supply
          const e = el[i], f = F[e.k];
          const loss = this.elemLoss(e, f, (i === n - 1 ? HC.K.TANK : 0) + (i === 0 ? HC.K.WELL : 0), lo);
          let boost = 0;
          if (e.kind === 'pump') { pumpUse.add(e.b); if (e.b.enabled && !(e.b.ready > now)) boost = Hyd.pumpBoost(e.b.level, f, e.b.spin); boostSum += boost; }
          ls[i] = loss; bs[i] = boost; net.velK[e.k] = lo.v; net.dpK[e.k] = loss; p = Math.max(0, p + loss - boost); if (boost > 0) p = Math.max(HC.P_SUCTION, p);
          const ed = net.edges.get(e.k); if (ed) { ed.currentFlow = f; ed.pressureDrop = loss; ed.velocity = lo.v; ed.blocked = this.vblock[e.k] === 1; }
        }
        w.preq = p; w.wh = Math.max(HC.P_WH, p); w.pump = boostSum;
        let q = w.wh;                                            // forwards from the well head (it never runs below its minimum pressure): the pressure at every tile
        for (let i = 0; i < n; i++) {
          const e = el[i]; if (q + (w.hm || 0) > net.pressK[e.k]) net.pressK[e.k] = q + (w.hm || 0);
          if (e.kind === 'pump') { e.b.pIn = q; e.b.boost = bs[i]; e.b.pOut = Math.max(0, q - ls[i] + bs[i]); e.b.flowT = F[e.k]; }
          q = Math.max(0, q - ls[i] + bs[i]);
        }
        pl.lf = 1; for (const e of el) if (e.kind === 'pipe' && this.pipeSt[e.k]) pl.lf *= 1 - CFG.PIPE.LEAK_LOSS;
        // limiting hint for the UI: the tile that is closest to its capacity
        let worst = -1, wr = 0; for (let i = 0; i < n; i++) { const r = F[el[i].k] / this.elemCap(el[i]); if (r > wr) { wr = r; worst = el[i].k; } }
        w.bottleneck = worst;
      }
      for (const b of this.buildings) if (b.type === 'pump') b.used = pumpUse.has(b);
      for (const pl of plans) pl.stable = conv;
      hy.plans = plans; hy.maxP = 0; for (const pl of plans) hy.maxP = Math.max(hy.maxP, pl.w.wh || 0);
    }

    // One simulation step of the oil network (called from step). Reads net.routes, moves the real flow toward the solved target.
    routeFlow(wells, dt) {
      const net = this.net, now = this.s.time, s = this.s, hy = this.hyd, A = hy.A, F = hy.F;
      for (const c of net.comps) { c.flow = 0; c.ext = 0; }
      net.flowK.fill(0); net.fnext.fill(-1); net.fsrc.fill(-1);
      const tanks = this.buildings.filter(b => b.type === 'tank'), pumps = this.buildings.filter(b => b.type === 'pump');
      for (const t of tanks) t.inNow = 0;
      hy.clock += dt;
      // a valve that moves, or one that has just closed completely, changes the network
      let moving = false;
      if (this.vlist) for (const k of this.vlist) {
        const tgt = this.valve[k] ? HC.VALVE_POS[this.valve[k] - 1] : 1, d = tgt - this.valvePos[k];
        if (Math.abs(d) > 1e-4) { this.valvePos[k] += d * (1 - Math.exp(-dt / HC.TAU.VALVE)); moving = true; if (Math.abs(tgt - this.valvePos[k]) < 0.002) this.valvePos[k] = tgt; }
        const want = this.valve[k] === 3 && this.valvePos[k] < 0.03 ? 1 : 0;
        if (want !== this.vblock[k]) { this.rebuildNetwork(); break; }
      }
      if (moving) hy.dirty = true;
      let need = hy.dirty || hy.clock >= HC.SOLVE_DT;
      if (!need) for (const pl of hy.plans) { const t = pl.r.tank; if (t.ready > now || this.tankCap(t) - t.amt <= 1e-6) { need = true; break; } }
      if (need) this.hydSolve(wells);
      // pumps spin up / down (target: on while enabled and used by a route)
      for (const b of pumps) {
        const tgt = b.enabled && b.used && !(b.ready > now) ? 1 : 0, tau = tgt > b.spin ? HC.TAU.PUMP_UP : HC.TAU.PUMP_DOWN;
        b.spinT = tgt; b.spin += (tgt - b.spin) * (1 - Math.exp(-dt / tau)); if (Math.abs(tgt - b.spin) < 0.002) b.spin = tgt;
        b.flow = 0;
      }
      // dynamics: real flow follows the target
      for (const w of wells) { w.hm = (w.hm || 0) * Math.exp(-dt / HC.HAMMER.DECAY); if (w.hm < 0.01) w.hm = 0; }
      const plans = hy.plans, inPlan = new Set();
      for (const pl of plans) {
        const w = pl.w, t = pl.r.tank; inPlan.add(w); let tau = HC.TAU.FLOW;
        for (const e of pl.r.elems) {
          if (e.kind === 'pump') { const b = e.b; if (Math.abs(b.spinT - b.spin) > 0.03) tau = Math.max(tau, b.spinT > b.spin ? HC.TAU.PUMP_UP : HC.TAU.PUMP_DOWN); }
          else if (this.valve[e.k]) { const tg = HC.VALVE_POS[this.valve[e.k] - 1]; if (Math.abs(tg - this.valvePos[e.k]) > 0.02) tau = Math.max(tau, HC.TAU.VALVE); }
        }
        if (this.tankCap(t) - t.amt <= 1e-6 || t.ready > now) { if ((w.q || 0) > 0.4) w.hm = Math.min(HC.HAMMER.MAX, (w.hm || 0) + HC.HAMMER.PER_BBL * w.q); w.q = 0; hy.dirty = true; }
        const q0 = Math.max(0, fin(w.q));
        if (this.tankCap(t) - t.amt > 1e-6 && !(t.ready > now)) w.q = q0 + (pl.qt - q0) * (1 - Math.exp(-dt / tau));
        if (Math.abs(pl.qt - w.q) < 0.002) w.q = pl.qt;
        w.q = Math.min(Math.max(0, fin(w.q)), Math.max(w.rate, q0, 0));      // never above what it delivered or can deliver; a lower potential is reached through dQ/dt, not in one jump
      }
      for (const w of wells) if (!inPlan.has(w)) { if ((w.q || 0) > 0.4) w.hm = Math.min(HC.HAMMER.MAX, (w.hm || 0) + HC.HAMMER.PER_BBL * w.q); w.q = 0; w.out = 0; }
      // hard capacity limit on the real flow
      hy.touched2 = hy.touched2 || []; for (const k of hy.touched2) A[k] = 0; hy.touched2.length = 0;
      for (const pl of plans) if (pl.w.q > 0) for (const e of pl.r.elems) { if (!A[e.k]) hy.touched2.push(e.k); A[e.k] += pl.w.q; }
      const order = plans.slice(), rot = this._rot = ((this._rot || 0) + 1) % Math.max(1, plans.length);
      const seq = order.slice(rot).concat(order.slice(0, rot));
      for (const pl of seq) {
        const w = pl.w, t = pl.r.tank; let sc = 1;
        for (const e of pl.r.elems) { const c = this.elemCap(e), ld = A[e.k]; if (ld > c) sc = Math.min(sc, c / ld); }
        const q = w.q * sc, desire = w.rate / 60 * dt, free = this.tankCap(t) - t.amt, lf = pl.lf;
        const ext = Math.min(q / 60 * dt, free / lf);
        w.out = ext / Math.max(dt, 1e-9) * 60;
        if (free <= 1e-6) { w.status = 'full'; w.why = 'full'; }
        else if (pl.qt < pl.rate * 0.995 || sc < 1 - 1e-9) { w.status = 'limited'; w.why = 'limited'; w.lim = sc < 1 - 1e-9 ? 'capacity' : (pl.lim || 'pressure'); }
        else { w.status = 'producing'; w.why = null; }
        const arrive = ext * lf, put = Math.min(arrive, free);
        if (put > 0) {
          const m = CFG.QUALITY[w.quality || 'MEDIUM'];
          t.qm = (t.amt * (t.qm || 1) + put * m) / (t.amt + put); t.amt = Math.min(this.tankCap(t), t.amt + put); t.inNow += put;
          if (this.tankCap(t) - t.amt < 1e-7) t.amt = this.tankCap(t);       // a tank that is full to the last drop is exactly full
        }
        const c = net.comps[net.compOf[idx(w.x, w.y)]]; if (c) { c.flow += put; c.ext += ext; }
        s.produced += put; s.extracted += ext; s.leaked += ext - arrive;
        const rate = w.out, path = pl.r.path;
        for (let i = 0; i < path.length; i++) {
          const k = path[i]; net.flowK[k] += rate;
          if (rate >= net.flowK[k] * .5) { net.fnext[k] = i + 1 < path.length ? path[i + 1] : pl.r.entry; net.fsrc[k] = w.id; }
        }
        for (const e of pl.r.elems) if (e.kind === 'pump') e.b.flow += rate;
      }
      for (const w of wells) if (w.status === 'full' && !inPlan.has(w)) w.out = 0;
      // pump power: P = dP x Q / efficiency, charged only while it really moves oil
      for (const b of pumps) {
        const Q = b.flow * HC.BBL_MIN, boost = b.flow > 0.01 && b.enabled ? Hyd.pumpBoost(b.level, b.flow, b.spin) : 0, sp = Hyd.pumpSpec(b.level);
        b.boostNow = boost; b.kw = fin(boost * HC.BAR * Q / sp.eff / 1000);
      }
      for (const t of tanks) { const inst = t.inNow / Math.max(dt, 1e-9) * 60; t.inflow = (t.inflow || 0) + (inst - (t.inflow || 0)) * (1 - Math.exp(-dt / 1.5)); if (t.inflow < .01) t.inflow = 0; }
      for (const b of pumps) this.pumpStep(b, dt);
      hy.stateClock = (hy.stateClock || 0) + dt;
      if (hy.solved || hy.stateClock >= HC.STATE_DT) { hy.solved = false; hy.stateClock = 0; this.updateNetState(); }
    }

    /* ---------- hydraulic read-only views ---------- */
    pumpNet(b) {
      const sp = Hyd.pumpSpec(b.level), d = DIRV[b.dir || 0], live = this.net.live, inK = idx(b.x - d[0], b.y - d[1]), outK = idx(b.x + d[0], b.y + d[1]);
      const okIn = inb(b.x - d[0], b.y - d[1]) && (live[inK] === 1 || live[inK] === 2), okOut = inb(b.x + d[0], b.y + d[1]) && (live[outK] === 1 || live[outK] === 3);
      const ready = !(b.ready > this.s.time);
      let status = !ready ? 'building' : !okIn ? 'noInput' : !okOut ? 'noOutput' : !b.enabled ? 'offline' : !b.used ? 'idle' : b.flow < 0.05 ? 'standby' : b.flow >= sp.Qmax * 0.98 ? 'maxed' : 'running';
      const boost = b.flow > 0.05 && b.enabled ? Hyd.pumpBoost(b.level, b.flow, b.spin) : 0;
      return { status, enabled: b.enabled, ready, progress: this.buildProgress(b), level: b.level, maxLevel: this.maxLevel(b), dir: b.dir || 0, connectedIn: okIn, connectedOut: okOut, boost, boostMax: sp.bar0, flow: b.flow || 0, maxFlow: sp.Qmax,
        pIn: b.pIn || 0, pOut: b.pOut || 0, kw: b.kw || 0, costMin: (b.kw || 0) * CFG.OPEX.pumpKwMin, efficiency: sp.eff, spin: b.spin || 0 };
    }
    /* Phase 1 views (read only, from the one solver above). A well follows Q = PI x max(Pres - Pwh, 0), capped at its production potential:
       PI = potential / (Pres - P_WH), so a well at the minimum well-head pressure delivers its full potential and none at Pwh >= Pres. */
    wellHyd(b) {
      const k = this.wellKind(b), util = b.nominal > 0 ? (b.out || 0) / b.nominal : 0, Pres = this.resBar(b), pot = Math.max(0, fin(b.rate));
      const PI = pot / Math.max(0.1, Pres - HC.P_WH), wh = fin(b.wh, HC.P_WH) || HC.P_WH;
      return { reservoirPressure: Pres, wellHeadPressure: wh, productionPotential: pot, productivityIndex: PI, currentFlow: Math.max(0, fin(b.out)), targetFlow: Math.max(0, fin(b.qt)),
        pressureDrivenFlow: Math.min(pot, PI * Math.max(Pres - wh, 0)),
        currentProduction: b.out || 0, pressureDecay: k.decay * util, condition: b.condition, pumpContribution: b.pump || 0, limit: b.lim || null, transient: b.hm || 0, required: b.preq || 0 };
    }
    tankHyd(t) {
      const cap = this.tankCap(t), inv = Math.min(cap, Math.max(0, fin(t.amt))), f = cap > 0 ? inv / cap : 1;
      return { capacity: cap, inventory: inv, fillRatio: f, basePressure: HC.TANK.BASE, maxBackPressure: HC.TANK.MAX, backPressure: Hyd.tankBack(f), currentInflow: t.inflow || 0,
        fill: f, inflow: t.inflow || 0, full: f >= 1 - 1e-9 };
    }
    /* Hydraulic state of a stretch of pipe tiles between two nodes: flow and its direction from the solver, pressures before / after it,
       the loss inside it and how much of its capacity is used (<70% normal, 70-90% warning, >=90% critical). Read only. */
    pipeHyd(cells, aId, bId, extra) {
      const net = this.net, own = cells.filter(k => this.pipe[k]);
      const base = Object.assign({ length: own.length * HC.TILE_M, diameter: 0, capacity: 0, roughness: HC.ROUGH, currentFlow: 0, pressureIn: 0, pressureOut: 0, pressureLoss: 0, usage: 0, usageLevel: 'normal', direction: 0, from: null, to: null }, extra || {});
      if (!own.length) return base;
      let flow = 0, cap = Infinity, D = Infinity, cond = 1, live = true;
      for (const k of own) { flow = Math.max(flow, Math.max(0, fin(net.flowK[k]))); cap = Math.min(cap, this.pipeCapacity(k)); D = Math.min(D, this.pipeDiameter(k)); cond = Math.min(cond, fin(this.pipeCond[k], 1)); if (net.live[k] !== 1) live = false; }
      // direction along the cell order (a -> b = +1): the solver's "next tile" of each tile
      const inC = new Set(cells); let dir = 0;
      for (let i = 0; i + 1 < cells.length && !dir; i++) { const p = cells[i], q = cells[i + 1]; if (net.fnext[p] === q) dir = 1; else if (net.fnext[q] === p) dir = -1; }
      if (!dir) { const f = net.fnext[cells[cells.length - 1]], g = net.fnext[cells[0]]; if (f >= 0 && !inC.has(f)) dir = 1; else if (g >= 0 && !inC.has(g)) dir = -1; }
      const on = flow > 1e-3 && live, ord = dir < 0 ? own.slice().reverse() : own;
      let loss = 0; if (on) for (const k of own) loss += Math.max(0, fin(net.dpK[k]));
      const st = on ? 0 : this.staticPressure(own[0]);
      const pIn = on ? Math.max(0, fin(net.pressK[ord[0]])) : st, usage = on && cap > 0 && cap < Infinity ? Math.min(1, flow / cap) : 0;
      return Object.assign(base, { diameter: D, capacity: cap === Infinity ? 0 : cap, roughness: HC.ROUGH + (HC.ROUGH_WORN - HC.ROUGH) * (1 - cond),
        currentFlow: on ? flow : 0, pressureIn: pIn, pressureOut: on ? Math.max(0, pIn - loss) : st, static: !on, pressureLoss: on ? Math.min(loss, pIn) : 0, usage, usageLevel: this.utilLevel(usage),
        direction: on ? (dir || 1) : 0, from: on ? (dir < 0 ? bId : aId) : null, to: on ? (dir < 0 ? aId : bId) : null });
    }
    graphId(n) { return n.b != null ? 'B' + n.b : n.id; }          // graph node -> the same id the pipe entities use ('B<building>', 'J<tile>', 'E<tile>')
    /* one pipe the player built. With `k` (the tile the player touched) it is the stretch of that pipe between the two graph nodes around k
       (a branch joined in the middle splits a pipe into two hydraulic connections); without it, the whole pipe. */
    lineHyd(L, k) {
      const extra = { id: L.id, type: L.type ? 'main' : 'branch', state: this.lineState(L), connected: L.cells.every(c => this.net.live[c] === 1) && L.a[0] !== 'E' && L.b[0] !== 'E' };
      const seg = k != null ? this.graphSegment(k) : null, g = this.net.graph;
      if (seg && g) { const own = new Set(L.cells), tiles = seg.tiles.filter(t => own.has(t)); if (tiles.length) return this.pipeHyd(tiles, this.graphId(g.nodes[g.byId.get(seg.a)]), this.graphId(g.nodes[g.byId.get(seg.b)]), Object.assign(extra, { segment: seg.id })); }
      const cells = L.cells.filter(c => !(L.a === 'J' + c || L.b === 'J' + c));
      return Object.assign(this.pipeHyd(cells.length ? cells : L.cells, L.a, L.b, extra), { length: L.len || L.cells.length * HC.TILE_M });
    }
    /* the oil network as a graph: nodes (well / tank / pump / junction / open end) and connections (pipe stretches between two nodes, with flow
       and direction), plus the path every producing well uses. It is the solver's own graph (net.graph), not a second copy. */
    networkGraph() {
      const g = this.net.graph; if (!g) return { nodes: [], edges: [], paths: [] };
      const nodes = g.nodes.map(n => ({ id: this.graphId(n), kind: n.kind === 'end' ? 'open' : n.kind, links: n.edges.slice() }));
      const edges = g.edges.map(e => { const a = this.graphId(g.nodes[g.byId.get(e.a)]), b = this.graphId(g.nodes[g.byId.get(e.b)]), h = this.pipeHyd(e.tiles, a, b);
        return { id: e.id, a, b, tiles: e.tiles.length, from: h.from, to: h.to, flow: h.currentFlow, usage: h.usage }; });
      const paths = this.buildings.filter(b => b.type === 'well').map(w => { const pl = this.hyd.plans.find(p => p.w === w); return { well: w.id, tank: pl ? pl.r.tank.id : null, tiles: pl ? pl.r.path.slice() : [], flow: Math.max(0, fin(w.out)) }; });
      return { nodes, edges, paths };
    }
    /* ================= Phase 2: pump states, pipe states, valves, warnings (read the solver; never change its physics) ================= */
    utilLevel(u) { const U = HC.UTIL; return !(u >= U.BUSY) ? 'normal' : u < U.HIGH ? 'busy' : u < U.BOTTLENECK ? 'high' : 'bottleneck'; }
    // the pressure in a part of the network where nothing flows: no flow means no friction, so it equals what pushes on it - the strongest
    // working well's reservoir pressure (a shut-in well), else the back-pressure of its tanks; nothing connected -> 0
    staticPressure(k) {
      const net = this.net, ci = k != null && k >= 0 ? net.compOf[k] : -1, c = ci >= 0 ? net.comps[ci] : null; if (!c) return 0;
      const now = this.s.time; let p = 0;
      for (const w of c.wells) if (!(w.ready > now) && !w.blocked) p = Math.max(p, this.resBar(w));
      if (!p) for (const t of c.tanks) if (!(t.ready > now)) p = Math.max(p, Hyd.tankBack(t.amt / this.tankCap(t)));
      return Math.min(HC.P_MAX, Math.max(0, fin(p)));
    }
    /* Pump state - each one is what the simulation is doing with it:
       OFF       switched off by the player (or still being built): no boost, no power; oil may still pass through the casing (with its loss)
       STARTING  switched on and in use, still spinning up: boost = curve x speed, power follows
       RUNNING   in use at full speed: boost from H(Q) = H0 - kQ^2
       OVERLOAD  flow at the pump's maximum: the head is ~0 and the pump caps the flow (elemCap)
       STARVED   a tank with room is reachable but no oil reaches the pump inlet (no working well behind it): nothing to pump, no power
       STOPPED   switched on but no tank with room behind it (outlet not connected / tanks full / pipe cut): spins down, no power */
    pumpStep(b, dt) {
      const sp = Hyd.pumpSpec(b.level), now = this.s.time, prev = b.state, ready = !(b.ready > now);
      let st;
      if (!ready || !b.enabled) st = 'OFF';
      else if (b.used && b.flow > 0.05) st = b.flow >= sp.Qmax * 0.98 ? 'OVERLOAD' : b.spin < 0.97 ? 'STARTING' : 'RUNNING';
      else {
        const d = DIRV[b.dir || 0], k = idx(b.x, b.y), net = this.net, side = (dx, dy) => { const x = b.x + dx, y = b.y + dy; const ci = inb(x, y) ? net.compOf[idx(x, y)] : -1; return ci >= 0 ? net.comps[ci] : null; };
        const out = side(d[0], d[1]), inn = side(-d[0], -d[1]), comps = new Set([out, inn, net.compOf[k] >= 0 ? net.comps[net.compOf[k]] : null].filter(Boolean));
        let room = false, oil = false;
        for (const c of comps) { for (const t of c.tanks) if (!(t.ready > now) && this.tankCap(t) - t.amt > 1e-6) room = true; for (const w of c.wells) if (!(w.ready > now) && !w.blocked && (w.r0 || 0) > 0) oil = true; }
        st = room && (!oil || b.used) ? 'STARVED' : 'STOPPED';
      }
      if (st !== prev) { b.state = st; b.stateSince = now; this.events.push({ type: 'pumpState', id: b.id, from: prev || null, to: st }); }
      if (b.flow > 0.05 && b.enabled && ready) b.runTime = (b.runTime || 0) + dt;
      b.costTotal = (b.costTotal || 0) + Math.max(0, fin(b.kw)) * CFG.OPEX.pumpKwMin * dt / 60;      // the same $ the operating costs charge for it
    }
    pumpHyd(b) {
      const n = this.pumpNet(b), flowing = (b.flow || 0) > 0.05, st = flowing ? 0 : this.staticPressure(idx(b.x, b.y));
      const boost = Math.max(0, fin(b.boostNow || 0));
      return { state: b.state || (b.enabled ? 'STOPPED' : 'OFF'), enabled: b.enabled !== false, flow: Math.max(0, fin(b.flow)), maxFlow: n.maxFlow,
        pressureIn: flowing ? Math.max(0, fin(b.pIn)) : st, pressureOut: flowing ? Math.max(0, fin(b.pOut)) : st, boost, head: boost * HC.BAR / (HC.RHO * HC.G), headMax: Hyd.pumpSpec(b.level).H0,
        kw: Math.max(0, fin(b.kw)), costPerMin: Math.max(0, fin(b.kw)) * CFG.OPEX.pumpKwMin, costTotal: b.costTotal || 0, runTime: b.runTime || 0, level: b.level, dir: b.dir || 0 };
    }
    /* a valve on pipe tile k: OPEN / PARTIAL / CLOSED (and MOVING while it travels), the flow through it, the pressure on both sides.
       A closed valve cuts the network: each side then shows its own static pressure (the shut-in side, the tank side). */
    valveHyd(k) {
      const v = this.valve[k] | 0; if (!v || !this.pipe[k]) return null;
      const tgt = HC.VALVE_POS[v - 1], pos = this.valvePos[k], net = this.net, flow = Math.max(0, fin(net.flowK[k]));
      const status = Math.abs(tgt - pos) > 0.02 ? 'MOVING' : v === 3 ? 'CLOSED' : v === 2 ? 'PARTIAL' : 'OPEN';
      if (flow > 1e-3) { const before = Math.max(0, fin(net.pressK[k])); return { k, state: v, status, opening: pos, flow, pressureBefore: before, pressureAfter: Math.max(0, before - Math.max(0, fin(net.dpK[k]))) }; }
      const x = k % W, y = (k / W) | 0, sides = [];
      for (let d = 0; d < 4; d++) { const nx = x + DIRV[d][0], ny = y + DIRV[d][1]; if (!inb(nx, ny)) continue; const nk = idx(nx, ny); if (net.compOf[nk] >= 0 && (this.pipe[nk] || this.occ[nk])) sides.push(nk); }
      const ps = sides.map(nk => ({ p: this.staticPressure(nk), wells: (net.comps[net.compOf[nk]] || { wells: [] }).wells.length })).sort((a, b) => b.wells - a.wells || b.p - a.p);
      return { k, state: v, status, opening: pos, flow: 0, pressureBefore: ps[0] ? ps[0].p : 0, pressureAfter: ps[1] ? ps[1].p : (v === 3 ? 0 : ps[0] ? ps[0].p : 0) };
    }
    /* Game state refreshed after each solve: every pipe's utilisation + status, and the warnings. Each warning names its cause in the
       simulation and the thing it is about (so the UI can point at it); nothing is raised without that cause. */
    updateNetState() {
      const now = this.s.time, net = this.net, W_ = HC.WARN, out = [];
      for (const L of this.lines) { const h = this.lineHyd(L); L.flowNow = h.currentFlow; L.util = h.usage; L.status = h.usageLevel; L.pIn = h.pressureIn; L.pOut = h.pressureOut;
        if (h.usageLevel === 'bottleneck') out.push({ code: 'BOTTLENECK', kind: 'line', id: L.id, value: h.usage }); }
      let hiK = -1, hiP = W_.P_HIGH; for (const L of this.lines) for (const k of L.cells) { const p = net.pressK[k]; if (p > hiP) { hiP = p; hiK = k; } }
      if (hiK >= 0) { const L = this.lineAt(hiK); out.push({ code: 'HIGH_PRESSURE', kind: 'line', id: L ? L.id : null, k: hiK, value: hiP }); }
      for (const b of this.buildings) {
        if (b.type === 'well' && !(b.ready > now) && !b.blocked && b.target != null && b.lim === 'pressure' && (b.rate || 0) > 0 && (b.qt || 0) < W_.LOW_FLOW * b.rate) out.push({ code: 'LOW_PRESSURE', kind: 'b', id: b.id, value: (b.qt || 0) / b.rate });
        else if (b.type === 'pump' && b.state === 'STARVED') out.push({ code: 'PUMP_STARVED', kind: 'b', id: b.id });
        else if (b.type === 'tank' && !(b.ready > now)) { const f = b.amt / this.tankCap(b);
          if (f >= W_.TANK_FILL && f < 1 && this.buildings.some(w => w.type === 'well' && w.target === b.id && w.lim === 'pressure')) out.push({ code: 'TANK_BACKPRESSURE', kind: 'b', id: b.id, value: Hyd.tankBack(f) }); }
      }
      if (this.vlist) for (const k of this.vlist) if (this.valve[k] === 3 && this.pipe[k]) {   // a closed valve that keeps oil from storage
        const x = k % W, y = (k / W) | 0, cs = new Set(); for (let d = 0; d < 4; d++) { const nx = x + DIRV[d][0], ny = y + DIRV[d][1]; if (inb(nx, ny) && net.compOf[idx(nx, ny)] >= 0) cs.add(net.comps[net.compOf[idx(nx, ny)]]); }
        const arr = [...cs], wells = arr.filter(c => c.wells.some(w => !(w.ready > now) && !w.blocked)), tanks = arr.filter(c => c.tanks.length);
        if (wells.length && tanks.some(c => !wells.includes(c) || wells.length > 1)) out.push({ code: 'VALVE_CLOSED', kind: 'valve', k, id: this.lineAt(k) ? this.lineAt(k).id : null });
      }
      this.warnings = out;
    }
    pipeEdge(k) {
      const ed = this.net.edges.get(k), lvl = Math.max(1, this.pipeLvl[k]), f = this.net.flowK[k] || 0, o = {};
      const D = this.pipeDiameter(k); Hyd.loss(D, HC.ROUGH, f, 0, o);
      return { pressure: this.net.pressK[k] || 0, drop: this.net.dpK[k] || 0, velocity: Hyd.velocity(f * HC.BBL_MIN, D), reynolds: o.Re || 0, friction: o.f || 0, flow: f, capacity: this.pipeCapacity(k), diameter: D, valve: this.valve[k] || 0, valvePos: this.valvePos[k], edge: ed || null };
    }
    debugSnapshot() {
      const hy = this.hyd, rows = [];
      for (const pl of hy.plans) rows.push({ well: pl.w.id, tank: pl.r.tank.id, tiles: pl.r.path.length, qt: pl.qt, q: pl.w.q || 0, preq: pl.w.preq, wellHead: pl.w.wh, reservoir: pl.Pres, lim: pl.lim, bottleneck: pl.w.bottleneck });
      const gr = this.net.graph; return { problems: this.validateNetwork(), graph: gr ? { nodes: gr.nodes.length, segments: gr.edges.length, junctions: gr.junctions, ends: gr.ends, orphans: gr.orphans.length, list: gr.nodes.filter(n => n.kind === 'junction').map(n => ({ id: n.id, k: n.k, branches: n.edges.length })) } : null, solves: hy.solves, iterations: hy.iters, converged: hy.converged, maxError: hy.maxd, warnings: hy.warn, lastError: hy.lastError, plans: rows,
        pumps: this.buildings.filter(b => b.type === 'pump').map(b => ({ id: b.id, head: b.boost, flow: b.flow, kw: b.kw, spin: b.spin })) };
    }

    step(dt) {
      const s = this.s, wells = [];
      s.time += dt;
      this.lastDt = dt;
      if (this.nextReady <= s.time) this.rebuildNetwork();       // something just finished building: recalculate the network once
      for (const b of this.buildings) if (b.type === 'well') wells.push(b);
      // 1. what every well CAN produce (level x condition x pressure); wells in one reservoir share its deliverability
      const sum = this._sum || (this._sum = new Float64Array(this.areas.length)); sum.fill(0);
      for (const w of wells) {
        const a = this.areas[w.area];
        w.nominal = this.wellNominal(w);
        w.blocked = w.condition <= CFG.CONDITION_BROKEN ? 'broken' : (a && a.remaining <= 0) ? 'depleted' : null;
        w.r0 = w.blocked ? 0 : this.wellRate(w);
        sum[w.area] += w.r0;
      }
      for (const w of wells) { const a = this.areas[w.area]; w.rate = w.r0 * (a && sum[w.area] > a.potential ? a.potential / sum[w.area] : 1); w.out = 0; }
      // 2. move it. Every well sends its oil to the NEAREST tank it can reach through pipes that still has room (path length, not map
      //    distance). A full tank is skipped, so the oil goes to the next valid tank. Each pipe tile carries at most its capacity; wells
      //    sharing a tile share that capacity. Leaks on the chosen path lose part of the oil. Nothing moves unless the path is finished.
      this.routeFlow(wells, dt);
      // 3. wells wear out: pressure falls and condition drops while pumping; an idle well slowly recovers pressure
      for (const w of wells) {
        const k = this.wellKind(w), util = w.nominal > 0 ? w.out / w.nominal : 0;
        w.active = w.status === 'producing' || w.status === 'limited';
        if (w.out > 0) {
          w.pressure = Math.max(0, w.pressure - k.decay / 100 / 60 * dt * util);
          w.condition = Math.max(0, w.condition - k.wear * this.regionAt(w.x, w.y).risk / 100 / 60 * dt * util);
          const a = this.areas[w.area]; if (a) a.remaining = Math.max(0, a.remaining - w.out / 60 * dt);
        } else if (!w.blocked) w.pressure = Math.min(1, w.pressure + CFG.PRESSURE_RECOVER / 100 / 60 * dt);
        w.rate = w.r0 > 0 ? w.rate : 0;
      }
      // 4. pipes: wear, leaks and repairs (once per game second)
      this.leakClock += dt;
      while (this.leakClock >= 1) { this.leakClock -= 1; this.pipeTick(); }
      // 5. exploration finishes
      for (const a of this.areas) if (a.st === 1 && s.time >= a.end) {
        a.st = 2; this.addLog('log.explored', 0, { n: a.id });
        this.events.push({ type: 'explored', id: a.id, kind: a.kind, quality: a.quality });
      }
      // player production rate (EMA over ~10 min) for the market share
      { let fl = 0; for (const cp of this.net.comps) fl += cp.flow; s.pRate += (fl / Math.max(dt, 1e-6) * 60 - s.pRate) * (1 - Math.exp(-dt / CFG.AI.EMA)); }
      // operating costs: revenue - operating costs = profit
      this.updateOpex();
      if (this.opex.total > 0) this.charge(this.opex.total / 60 * dt);
      // futures contracts
      this.settleContracts();
      // supply contracts, market events and competitors (all cheap: they only do work every few seconds)
      this.orderTick(dt); this.eventTick(); this.aiTick(dt);
      // market
      s.priceClock += dt;
      while (s.priceClock >= CFG.PRICE_TICK) {
        s.priceClock -= CFG.PRICE_TICK;
        this.priceTick(this.rng, true);
      }
      // the quoted price glides toward the latest market tick instead of jumping
      if (s.tgt != null && s.price !== s.tgt) {
        s.price += (s.tgt - s.price) * (1 - Math.exp(-dt / (CFG.PRICE_TICK * CFG.PRICE.GLIDE)));
        if (Math.abs(s.tgt - s.price) < 0.005) s.price = s.tgt;
        s.price = Math.round(s.price * 100) / 100;
      }
      this.checkAlert();
      s.change = Math.round((s.price - s.prev) * 100) / 100; s.direction = this.priceTrend().dir;
    }

    // glide=true (used by step): the tick sets a new target and s.price moves there smoothly.
    // glide=false: s.price jumps to the new value at once (tests, history seeding).
    priceTick(r, glide) {
      const s = this.s;
      const P = CFG.PRICE;
      const target = P.BASE + P.SWING * Math.sin(s.time / P.SWING_PERIOD + 0.8) + P.WOBBLE * Math.sin(s.time / P.WOBBLE_PERIOD);
      // the random walk runs on the NATURAL price; events and the competitors only scale what is quoted
      const base = glide ? (s.nat != null ? s.nat : s.tgt != null ? s.tgt : s.price) : s.price;
      const calm = s.event && s.event.calm && s.time >= s.event.start && s.time < s.event.start + s.event.duration ? CFG.EVENT.CALM_NOISE : 1;
      s.prev = s.tgt != null && glide ? s.tgt : base;
      s.trend = s.trend * P.MOMENTUM + (r() - 0.5) * P.NOISE * calm;
      let np = base + (target - base) * P.REVERT + s.trend * 0.6 * calm + (r() - 0.5) * 0.5 * calm;
      np = clamp(np, P.MIN, P.MAX);
      s.nat = np;
      s.evMult = glide ? this.eventMultAt(s.time) : 1; s.aiMult = glide ? this.aiMultNow() : 1;
      np = Math.round(clamp(np * s.evMult * s.aiMult, P.MIN, P.MAX) * 10) / 10;
      s.tgt = np;
      if (!glide) s.price = np;
      s.hist.push(np);
      if (s.hist.length > CFG.HIST) s.hist.shift();
      if (!glide) this.checkAlert();
    }

    checkAlert() {
      const s = this.s, a = s.alert;
      if (a && ((a.dir > 0 && s.price >= a.target) || (a.dir < 0 && s.price <= a.target))) {
        this.events.push({ type: 'alert', price: s.price, target: a.target });
        s.alert = null;
      }
    }

    seedHistory() {
      const r = mulberry32(99), s = this.s;
      s.time = 0;
      for (let i = 0; i < CFG.HIST; i++) { s.time += CFG.PRICE_TICK; this.priceTick(r); }
      const off = CFG.PRICE.START - s.price;
      s.hist = s.hist.map(v => Math.round((v + off) * 10) / 10);
      s.price = s.tgt = s.nat = CFG.PRICE.START; s.prev = s.hist[s.hist.length - 2]; s.time = 0; s.priceClock = 0; s.alert = null;
      this.events = [];
    }

    // Market direction over the last few price updates: dir is 1 (rising), -1 (falling) or 0 (stable).
    priceTrend() {
      const h = this.s.hist, n = Math.min(CFG.PRICE.TREND_TICKS, h.length - 1);
      if (n < 1) return { dir: 0, delta: 0, pct: 0 };
      const delta = h[h.length - 1] - h[h.length - 1 - n];
      return { dir: delta > CFG.PRICE.TREND_MIN ? 1 : delta < -CFG.PRICE.TREND_MIN ? -1 : 0, delta, pct: delta / h[h.length - 1 - n] * 100 };
    }

    setAlert(target) {
      if (target == null) { this.s.alert = null; return; }
      this.s.alert = { target, dir: target >= this.s.price ? 1 : -1 };
    }

    /* ---------- market ---------- */
    drain(amount) {
      const tot = this.oilTotal();
      if (tot <= 0) return;
      const f = Math.min(1, amount / tot);
      for (const b of this.buildings) if (b.type === 'tank') b.amt = Math.max(0, b.amt - b.amt * f);
    }

    /* ---------- ECONOMY STATE: money, revenue, operating costs, profit (the only place money moves) ---------- */
    income(amount) {                           // oil sold -> revenue. Any unpaid operating costs are settled first.
      const s = this.s; amount = Math.round(amount * 100) / 100;
      s.revenue += amount;
      const pay = Math.min(s.owed, amount); s.owed -= pay; s.cash += amount - pay;
      s.profit = s.revenue - s.operatingCosts;
    }
    charge(amount, penalty) {                  // operating cost. Money never goes negative: a shortfall is owed and paid from the next revenue.
      const s = this.s;
      s.operatingCosts += amount; if (penalty) s.penalties += amount;
      const pay = Math.min(s.cash, amount); s.cash -= pay; s.owed += amount - pay;
      s.profit = s.revenue - s.operatingCosts;
    }
    pipeTick() {
      const P = CFG.PIPE;
      for (const c of this.net.comps) {
        if (!c.pipes.length) continue;
        let changed = false;
        const carrying = c.flow > 0;
        for (const k of c.pipes) {
          if (this.pipeSt[k] === 2) {
            this.pipeT[k] -= 1;
            if (this.pipeT[k] <= 0) { this.pipeSt[k] = 0; this.pipeT[k] = 0; this.pipeCond[k] = 1; changed = true; this.events.push({ type: 'repaired', k }); }
            continue;
          }
          if (!carrying) continue;
          this.pipeCond[k] = Math.max(0, this.pipeCond[k] - P.WEAR / 100 / 60);
          if (this.pipeSt[k] === 0 && c.leaks + (changed ? 0 : 0) < P.MAX_LEAKS) {
            const p = P.LEAK_PER_TILE_MIN / 60 * P.RELIAB[Math.max(1, this.pipeLvl[k]) - 1] * (1 + 2 * (1 - this.pipeCond[k])) * this.regionAt(k % W, (k / W) | 0).risk;
            if (this.rng() < p) {
              this.pipeSt[k] = 1; c.leaks++; changed = true;
              this.addLog('log.leak', 0);
              this.events.push({ type: 'leak', k });
            }
          }
        }
        if (changed) this.updateComp(c);
      }
    }

    // $ per minute right now, split by kind (pumps only cost money while they really pump)
    updateOpex() {
      const O = CFG.OPEX; let pump = 0, storage = 0, pipes = 0, stations = 0;
      for (const b of this.buildings) {
        if (b.type === 'well') pump += O.well * this.wellKind(b).opex * CFG.WELL_MULT[b.level - 1] * (b.nominal > 0 ? Math.min(1, (b.out || 0) / b.nominal) : 0);
        else if (b.type === 'pump') stations += fin(b.kw) * O.pumpKwMin;
        else storage += O.tank * b.level + O.store * b.amt;
      }
      for (let k = 0; k < this.pipe.length; k++) if (this.pipe[k]) pipes += O.pipe * Math.max(1, this.pipeLvl[k]);
      this.opex = { pump, storage, pipe: pipes, stations, total: pump + storage + pipes + stations };
    }

    /* ---------- MARKET STATE (read-only view of the market part of the state) ---------- */
    market() {
      const s = this.s, P = CFG.PRICE, tr = this.priceTrend();
      return { currentOilPrice: s.price, previousOilPrice: s.prev, priceChange: s.price - s.prev, priceDirection: tr.dir, trendPct: tr.pct, marketTime: s.time, minPrice: P.MIN, maxPrice: P.MAX, event: this.eventView(), eventMult: s.evMult, competitorMult: s.aiMult };
    }
    economy() {
      const s = this.s;
      return { money: s.cash, revenue: s.revenue, operatingCosts: s.operatingCosts, penalties: s.penalties, profit: s.revenue - s.operatingCosts, owed: s.owed, opexPerMin: this.opex.total,
        maintenance: s.maintenance, repairs: s.repairs, upgrades: s.upgrades, exploration: s.exploration, capex: s.capex, leaked: s.leaked, quality: this.avgQuality() };
    }
    storage() {
      const inv = this.oilTotal(), cap = this.storageCap(), com = this.committed();
      return { inventory: inv, capacity: cap, level: cap > 0 ? inv / cap : 0, committed: com, free: Math.max(0, inv - com), quality: this.avgQuality() };
    }

    /* ---------- selling ---------- */
    sell(amount) {                             // spot sale: revenue = soldOil x currentOilPrice
      amount = Math.min(amount, this.oilTotal());
      if (!(amount >= 0.01)) return { ok: false, reason: 'nooil' };
      const q = this.avgQuality();                                      // LOW 0.85 / MEDIUM 1.00 / HIGH 1.20 x market price
      const rev = Math.round(amount * this.s.price * q * 100) / 100;
      this.drain(amount);
      this.income(rev); this.s.sold += amount; this.s.tutorialDone = true;
      this.addLog('log.sold', rev, { n: Math.floor(amount), p: Math.round(this.s.price * q * 10) / 10 });
      return { ok: true, amount, revenue: rev, quality: q };
    }

    /* ---------- supply contracts (delivery orders) ---------- */
    // AVAILABLE (offered, not yet accepted) -> ACTIVE -> COMPLETED | FAILED (deadline missed);  an offer nobody accepts becomes EXPIRED.
    // The reward is paid in full on completion. Missing the deadline pays only FAIL_PAY of what was delivered and costs a penalty.
    potential() { let n = 0; for (const b of this.buildings) if (b.type === 'well' && !b.blocked) n += this.wellRate(b); return n; }
    makeOrder() {
      const s = this.s, O = CFG.ORDER, rng = this.rng, rate = Math.max(10, this.potential());
      const minutes = O.DURATIONS[Math.floor(rng() * O.DURATIONS.length)];
      const f = O.FACTOR[0] + (O.FACTOR[1] - O.FACTOR[0]) * rng();
      const required = Math.max(O.MIN, Math.round(rate * minutes * f / O.STEP) * O.STEP);
      const pf = O.PRICE[0] + (O.PRICE[1] - O.PRICE[0]) * rng();
      const price = Math.round(clamp(s.price * pf, CFG.PRICE.MIN, CFG.PRICE.MAX) * 2) / 2;
      const o = { id: s.orderSeq++, status: 'AVAILABLE', requiredOil: required, deliveredOil: 0, remainingOil: required, price, reward: Math.round(required * price), duration: minutes * 60, deadline: 0, offerEnd: s.time + O.OFFER_LIFE, created: s.time };
      s.orders.push(o);
      this.events.push({ type: 'order', id: o.id, status: 'AVAILABLE' });
      return o;
    }
    orderTick() {
      const s = this.s, O = CFG.ORDER;
      if (s.time >= s.nextOrder) {
        if (s.orders.filter(o => o.status === 'AVAILABLE').length < O.MAX_OFFERS) this.makeOrder();
        s.nextOrder = s.time + O.EVERY[0] + (O.EVERY[1] - O.EVERY[0]) * this.rng();
      }
      for (let i = s.orders.length - 1; i >= 0; i--) {
        const o = s.orders[i];
        if (o.status === 'AVAILABLE' && s.time >= o.offerEnd) this.closeOrder(o, 'EXPIRED');
        else if (o.status === 'ACTIVE' && s.time >= o.deadline) this.failOrder(o);
      }
    }
    closeOrder(o, status) {
      const s = this.s; o.status = status; o.closed = s.time;
      s.orders.splice(s.orders.indexOf(o), 1); s.ordersDone.unshift(o); if (s.ordersDone.length > CFG.ORDER.KEEP) s.ordersDone.pop();
      this.events.push({ type: 'order', id: o.id, status });
    }
    failOrder(o) {
      const pay = Math.round(o.deliveredOil * o.price * CFG.ORDER.FAIL_PAY * 100) / 100, pen = Math.round(o.reward * CFG.ORDER.FAIL_PENALTY * 100) / 100;
      if (pay > 0) { this.income(pay); this.s.orderPaid += pay; }
      this.charge(pen, true); this.s.orderLost += pen; o.paid = pay; o.penalty = pen;
      this.addLog('log.orderFailed', pay - pen, { n: Math.floor(o.deliveredOil) });
      this.closeOrder(o, 'FAILED');
    }
    acceptOrder(id) {
      const s = this.s, o = s.orders.find(q => q.id === id);
      if (!o || o.status !== 'AVAILABLE') return { ok: false, reason: 'nothing' };
      if (s.orders.filter(q => q.status === 'ACTIVE').length >= CFG.ORDER.MAX_ACTIVE) return { ok: false, reason: 'tooManyOrders' };
      o.status = 'ACTIVE'; o.deadline = s.time + o.duration; o.accepted = s.time;
      this.addLog('log.orderAccepted', 0, { n: o.requiredOil });
      return { ok: true, order: o };
    }
    // deliver oil from storage (never more than is stored and not already promised to a futures contract, never more than still needed)
    deliverOrder(id, amount) {
      const s = this.s, o = s.orders.find(q => q.id === id);
      if (!o || o.status !== 'ACTIVE') return { ok: false, reason: 'nothing' };
      const free = Math.max(0, this.oilTotal() - this.committed());
      let n = amount == null ? Infinity : amount;
      n = Math.min(n, free, o.remainingOil);
      if (!(n >= 0.01)) return { ok: false, reason: free < 0.01 ? 'nooil' : 'nothing' };
      this.drain(n);
      o.deliveredOil = Math.min(o.requiredOil, o.deliveredOil + n); o.remainingOil = Math.max(0, o.requiredOil - o.deliveredOil);
      if (o.remainingOil < 0.01) {
        o.deliveredOil = o.requiredOil; o.remainingOil = 0;
        this.income(o.reward); s.orderPaid += o.reward; s.sold += n; o.paid = o.reward;
        this.addLog('log.orderDone', o.reward, { n: o.requiredOil });
        this.closeOrder(o, 'COMPLETED');
        return { ok: true, amount: n, completed: true, reward: o.reward };
      }
      s.sold += n;
      return { ok: true, amount: n, completed: false };
    }

    /* ---------- market events ---------- */
    eventMultAt(t) {
      const e = this.s.event; if (!e) return 1;
      const d = t - e.start; if (d <= 0) return 1;
      const sm = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
      if (d < e.ramp) return 1 + (e.peak - 1) * sm(d / e.ramp);
      if (d < e.duration) return e.peak;
      if (d < e.duration + e.recover) return 1 + (e.peak - 1) * sm(1 - (d - e.duration) / e.recover);
      return 1;
    }
    eventView() {
      const e = this.s.event; if (!e) return null;
      const t = this.s.time, d = t - e.start, ph = d < e.duration ? 'active' : 'fading';
      return { type: e.type, phase: ph, start: e.start, duration: e.duration, peak: e.peak, priceFrom: e.priceFrom, priceTo: e.priceTo, remaining: Math.max(0, e.start + e.duration - t), endsIn: Math.max(0, e.start + e.duration + e.recover - t), mult: this.eventMultAt(t) };
    }
    startEvent(type, over) {
      const s = this.s, E = CFG.EVENT, T = E.TYPES[type]; if (!T) return null;
      const r = this.rng, pick = ab => ab[0] + (ab[1] - ab[0]) * r();
      const e = Object.assign({ type, start: s.time, duration: Math.round(pick(T.dur)), peak: Math.round(pick(T.peak) * 1000) / 1000, ramp: E.RAMP, recover: E.RECOVER, calm: type === 'STABLE_MARKET' }, over || {});
      e.priceFrom = Math.round(s.price * 10) / 10; e.priceTo = Math.round(clamp(s.price * e.peak, CFG.PRICE.MIN, CFG.PRICE.MAX) * 10) / 10;
      s.event = e;
      this.addLog('log.event', 0, { type });
      this.events.push({ type: 'marketEvent', phase: 'start', event: this.eventView() });
      return e;
    }
    eventTick() {
      const s = this.s, E = CFG.EVENT;
      if (s.event && s.time >= s.event.start + s.event.duration + s.event.recover) {
        s.eventHist.unshift({ type: s.event.type, start: s.event.start, duration: s.event.duration, peak: s.event.peak }); if (s.eventHist.length > E.KEEP) s.eventHist.pop();
        this.events.push({ type: 'marketEvent', phase: 'end', event: { type: s.event.type } });
        s.event = null; s.nextEvent = s.time + E.GAP[0] + (E.GAP[1] - E.GAP[0]) * this.rng();
      }
      if (!s.event && s.time >= s.nextEvent) {
        let tot = 0; for (const k in E.TYPES) tot += E.TYPES[k].w;
        let r = this.rng() * tot, type = 'STABLE_MARKET';
        for (const k in E.TYPES) { r -= E.TYPES[k].w; if (r <= 0) { type = k; break; } }
        this.startEvent(type);
      }
    }

    /* ---------- AI competitors ---------- */
    // Each company produces, sells by its strategy and slowly reinvests. Updated every AI.TICK seconds, never per frame.
    aiTick(dt) {
      const s = this.s, A = CFG.AI;
      s.aiClock += dt;
      while (s.aiClock >= A.TICK) { s.aiClock -= A.TICK; this.aiStep(A.TICK); }
    }
    aiStep(dt) {
      const s = this.s, A = CFG.AI, P = CFG.PRICE, price = s.price, al = 1 - Math.exp(-dt / A.EMA);
      let sumP = 0, sumS = 0;
      for (const c of s.comp) {
        const O = A.COMPANIES.find(q => q.id === c.id), cap = c.prod * O.store;
        const produce = c.prod * dt / 60 * (0.92 + 0.16 * this.rng());
        c.stock += produce; c.produced += produce;
        const sc = A.SELL[c.strategy], rate = (price >= sc[0] * P.BASE ? sc[1] : sc[2]) * c.prod;
        let sell = Math.min(c.stock, rate * dt / 60);
        if (c.stock > cap * A.FORCE[c.strategy]) sell = Math.min(c.stock, Math.max(sell, c.stock - cap * A.FORCE[c.strategy]));   // a full warehouse forces a sale
        c.stock -= sell; c.sold += sell;
        const rev = sell * price, cost = produce * A.COST + A.FIXED * dt / 60;
        c.revenue += rev; c.money = Math.max(0, c.money + rev - cost);
        if (c.money > O.reserve && c.prod < O.max) { const spend = 0.35 * (c.money - O.reserve); c.money -= spend; c.prod = Math.min(O.max, c.prod + spend / A.INVEST_COST); }
        c.ema += (produce / dt * 60 - c.ema) * al; c.emaSold += (sell / dt * 60 - c.emaSold) * al;
        sumP += c.ema; sumS += c.emaSold;
      }
      s.aiProd = sumP; s.aiSold = sumS;
    }
    // Net supply of the competitors: selling more than they produce pushes the price down a little, hoarding lifts it. Limited to +-4%.
    aiMultNow() {
      const s = this.s, A = CFG.AI; if (!s.comp.length || s.aiProd <= 0) return 1;
      const idx2 = clamp(s.aiSold / s.aiProd - 1, -1, 1);
      return clamp(1 - A.EFFECT * idx2, A.MIN_MULT, A.MAX_MULT);
    }
    // Market share = each company's share of all oil produced, as a moving average over about 10 minutes.
    marketShares() {
      const s = this.s, rows = [{ id: 'P', player: true, production: s.pRate, revenue: s.revenue, money: s.cash, sold: s.sold, strategy: null }];
      for (const c of s.comp) rows.push({ id: c.id, player: false, production: c.ema, revenue: c.revenue, money: c.money, sold: c.sold, strategy: c.strategy, stock: c.stock, capacity: c.prod });
      let tot = 0; for (const r of rows) tot += r.production;
      for (const r of rows) r.share = tot > 0 ? r.production / tot : 0;
      return rows;
    }
    // Ranking: by total revenue (one clear measure).
    ranking() { return this.marketShares().sort((a, b) => b.revenue - a.revenue).map((r, i) => Object.assign(r, { rank: i + 1 })); }

    /* ---------- futures: lock a price now, deliver from storage when the time is up ---------- */
    committed() { let n = 0; for (const k of this.s.contracts) n += k.amount; return n; }

    // The price the market expects after `sec` seconds (its own cycle + momentum, no noise) plus a small edge.
    // Above today's price = the market is expected to rise; below = expected to fall. Not a free profit.
    forwardPrice(sec) {
      const s = this.s, P = CFG.PRICE, n = Math.max(1, Math.round(sec / CFG.PRICE_TICK));
      let x = s.nat != null ? s.nat : s.tgt != null ? s.tgt : s.price, tr = s.trend, tm = s.time;
      for (let i = 0; i < n; i++) {
        tm += CFG.PRICE_TICK;
        const target = P.BASE + P.SWING * Math.sin(tm / P.SWING_PERIOD + 0.8) + P.WOBBLE * Math.sin(tm / P.WOBBLE_PERIOD);
        tr *= P.MOMENTUM;
        x = clamp(x + (target - x) * P.REVERT + tr * 0.6, P.MIN, P.MAX);
      }
      return Math.round(clamp(x * this.eventMultAt(tm) * this.aiMultNow() * (1 + CFG.FUT_EDGE), P.MIN, P.MAX) * 10) / 10;
    }

    contractQuote(amount, optIdx) {
      const o = CFG.FUT[optIdx], price = this.forwardPrice(o.sec);
      return { price, revenue: Math.round(amount * price * 100) / 100, sec: o.sec, vsSpot: (price / this.s.price - 1) * 100, penalty: Math.round(amount * price * CFG.FUT_PENALTY * 100) / 100 };
    }

    createContract(amount, optIdx) {           // oil is NOT taken now: it must be in storage when the contract ends
      const free = this.storage().free;
      amount = Math.min(amount, free);
      if (this.oilTotal() < 1) return { ok: false, reason: 'nooil' };
      if (!(amount >= 1)) return { ok: false, reason: 'nofree' };
      if (this.s.contracts.length >= CFG.MAX_CONTRACTS) return { ok: false, reason: 'tooMany' };
      const q = this.contractQuote(amount, optIdx);
      this.s.contracts.push({ id: this.s.nextId++, amount, price: q.price, start: this.s.time, end: this.s.time + q.sec, spot0: this.s.price, status: 'active' });
      this.addLog('log.futures', 0, { n: Math.floor(amount), p: q.price });
      return { ok: true, quote: q, amount };
    }

    settleContracts() {
      const s = this.s;
      for (let i = s.contracts.length - 1; i >= 0; i--) {
        const k = s.contracts[i];
        if (s.time < k.end) continue;
        s.contracts.splice(i, 1);
        k.spotEnd = s.price;
        if (this.oilTotal() >= k.amount - 1e-9) {              // COMPLETED: deliver at the locked price
          const rev = Math.round(k.amount * k.price * 100) / 100;
          this.drain(k.amount); this.income(rev); s.sold += k.amount;
          k.status = 'completed'; k.result = rev - Math.round(k.amount * s.price * 100) / 100;   // gain / loss versus selling on the spot market now
          this.addLog('log.futuresDelivered', rev, { n: Math.floor(k.amount), p: k.price });
          this.events.push({ type: 'contract', status: 'completed', amount: k.amount, revenue: rev, result: k.result });
        } else {                                                // EXPIRED: not enough oil in storage -> penalty
          const pen = Math.round(k.amount * k.price * CFG.FUT_PENALTY * 100) / 100;
          this.charge(pen, true);
          k.status = 'expired'; k.result = -pen;
          this.addLog('log.futuresExpired', -pen, { n: Math.floor(k.amount), p: k.price });
          this.events.push({ type: 'contract', status: 'expired', amount: k.amount, revenue: 0, penalty: pen });
        }
        s.done.unshift(k); if (s.done.length > CFG.FUT_HISTORY) s.done.pop();
      }
    }

    /* ---------- save / load ---------- */
    serialize() {
      const s = this.s;
      return {
        v: 1, w: 2, s: JSON.parse(JSON.stringify(s)),
        pipes: (() => { const out = []; for (let k = 0; k < this.pipe.length; k++) if (this.pipe[k]) out.push(k); return out; })(),
        pipeInfo: (() => { const out = []; for (let k = 0; k < this.pipe.length; k++) if (this.pipe[k]) out.push([k, this.pipeLvl[k], +this.pipeCond[k].toFixed(4), this.pipeSt[k], +this.pipeT[k].toFixed(2), this.pipeType[k]]); return out; })(),
        lines: (this.lines || []).map(L => [L.id, L.a, L.b, L.type, L.cells, L.len]),
        areas: this.areas.map(a => [a.st, a.end, a.remaining]),
        valves: (() => { const out = []; for (let k = 0; k < this.valve.length; k++) if (this.valve[k] && this.pipe[k]) out.push([k, this.valve[k]]); return out; })(),
        pipeReady: (() => { const out = [], t = this.s.time; for (let k = 0; k < this.pipe.length; k++) if (this.pipe[k] && this.pipeReady[k] > t) out.push([k, +this.pipeReady[k].toFixed(2)]); return out; })(),
        buildings: this.buildings.map(b => ({ id: b.id, type: b.type, x: b.x, y: b.y, level: b.level, amt: b.amt, invested: b.invested, kind: b.kind, pressure: b.pressure, condition: b.condition, quality: b.quality, area: b.area, qm: b.qm, built: b.built, ready: b.ready, dir: b.dir, enabled: b.enabled, hadPipe: b.hadPipe, runTime: b.runTime, costTotal: b.costTotal }))
      };
    }

    // Old saves use tile numbers of the 44 x 28 map. The old map now sits at (OX, OY), so every position, pipe and area is shifted.
    migrateOldWorld(d) {
      const mv = k => (k % OW + OX) + ((k / OW | 0) + OY) * W, e = Object.assign({}, d);
      e.pipes = (d.pipes || []).map(mv); e.pipeInfo = (d.pipeInfo || []).map(p => [mv(p[0])].concat(p.slice(1))); e.pipeReady = (d.pipeReady || []).map(p => [mv(p[0]), p[1]]);
      e.buildings = (d.buildings || []).map(b => Object.assign({}, b, { x: b.x + OX, y: b.y + OY }));
      const AC = Math.ceil(OW / CFG.EXPLORE.AREA), A = CFG.EXPLORE.AREA; e.areas = [];
      (d.areas || []).forEach((v, i) => { e.areas[((i / AC | 0) + OY / A) * A_COLS + (i % AC) + OX / A] = v; });
      e.w = 2; return e;
    }
    load(d) {
      if (!d || d.v !== 1 || !d.s) throw new Error('bad save');
      this.reset();
      Object.assign(this.s, d.s);
      if (this.s.prev == null) this.s.prev = this.s.price;
      if (this.s.tgt == null) this.s.tgt = this.s.price;
      this.s.log = (this.s.log || []).filter(l => l.k);   // drop log lines written by older versions
      if (d.w !== 2) d = this.migrateOldWorld(d);          // saves from the 44 x 28 map: move everything into the middle of the new world
      this.pipe = new Uint8Array(W * H);
      this.pipeType = new Uint8Array(W * H);
      for (const k of d.pipes || []) if (k >= 0 && k < W * H) { this.pipe[k] = 1; this.pipeType[k] = 0; this.pipeLvl[k] = 1; this.pipeCond[k] = 1; }
      for (const p of d.pipeInfo || []) { const k = p[0]; if (this.pipe[k]) { this.pipeLvl[k] = clamp(p[1] | 0 || 1, 1, CFG.MAX_LEVEL); this.pipeCond[k] = clamp(+p[2], 0, 1); this.pipeSt[k] = p[3] | 0; this.pipeT[k] = +p[4] || 0; this.pipeType[k] = p[5] ? 1 : 0; } }
      for (const p of d.pipeReady || []) if (this.pipe[p[0]]) this.pipeReady[p[0]] = p[1];
      for (const p of d.valves || []) { const k = p[0], st = p[1] | 0; if (this.pipe[k] && st >= 1 && st <= 3) { this.valve[k] = st; this.valvePos[k] = HC.VALVE_POS[st - 1]; } }
      this.occ = new Array(W * H).fill(null);
      this.buildings = (d.buildings || []).map(b => Object.assign({ status: 'idle', out: 0, rate: 0, active: false }, b));
      if (d.areas) d.areas.forEach((v, i) => { const a = this.areas[i]; if (a && v) { a.st = v[0]; a.end = v[1]; a.remaining = v[2]; } });
      for (const b of this.buildings) {
        this.s.regions[this.areaAt(b.x, b.y).region - 1].unlocked = true;     // a save with buildings in a region means it was opened
        this.fillOcc(b);
        b.level = clamp(Math.round(Number(b.level)) || 1, 1, CFG.MAX_LEVEL);
        if (b.type === 'tank') { b.amt = clamp(Number(b.amt) || 0, 0, this.tankCap(b)); b.qm = b.qm || 1; }
        else if (b.type === 'pump') { b.level = clamp(b.level, 1, this.maxLevel(b)); b.dir = clamp(b.dir | 0, 0, 3); b.enabled = b.enabled !== false; b.spin = 0; b.flow = 0; b.kw = 0; b.boost = 0; b.pIn = 0; b.pOut = 0; b.qm = 1; b.amt = 0; b.runTime = Math.max(0, fin(Number(b.runTime))); b.costTotal = Math.max(0, fin(Number(b.costTotal))); b.state = b.enabled ? 'STOPPED' : 'OFF'; }
        else {
          const a = this.areaAt(b.x, b.y);                      // saves from before exploration: the ground under a well counts as discovered
          if (a.st !== 2) { a.st = 2; if (a.kind === 'empty') { a.kind = 'small'; a.size = a.remaining = CFG.EXPLORE.SIZE.small; a.potential = CFG.EXPLORE.POTENTIAL.small; } }
          b.amt = 0; b.kind = CFG.WELL_KINDS[b.kind] ? b.kind : 'small'; b.area = a.id; b.quality = b.quality || a.quality;
          b.pressure = b.pressure == null ? 1 : clamp(b.pressure, 0, 1); b.condition = b.condition == null ? 1 : clamp(b.condition, 0, 1);
          b.rate = this.wellRate(b);
        }
      }
      this.lines = (d.lines || []).filter(l => Array.isArray(l) && Array.isArray(l[4])).map(l => ({ id: l[0] | 0, a: l[1], b: l[2], type: l[3] ? 1 : 0, cells: l[4].filter(k => k >= 0 && k < W * H), len: +l[5] || 0, built: 0 }));   // pipe entities by ID; old saves have none: syncLines builds them from the tiles
      if (!this.s.nextLineId) this.s.nextLineId = this.lines.reduce((m, L) => Math.max(m, L.id), 0) + 1;
      if (d.s.tutorialDone === undefined) this.s.tutorialDone = this.s.sold > 0 || this.buildings.length > 1;   // old saves: veterans skip the guide
      this.events = [];
      this.rebuildNetwork();
    }
  }

  return { CFG, Hyd, Game, makeMap, idx, inb, mulberry32, shore, rockyAt };
});
