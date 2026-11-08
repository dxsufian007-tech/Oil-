/* Oli - the "new map" ground for the existing 140 x 88 game grid (a WINDOW onto the 2560 x 1600 world of prototype round 4).
   What it does: for every tile of the game grid it reads the ground of the new world (same generator as the prototype, world-v4.js) and gives core.js
   its `map` (water / block / coast). Nothing else in the game changes: grid size, tile numbering, save format, pipes, pressure, flow, pumps, tanks, production and prices
   are not touched; this file never writes a building, a pipe or a save.
   Rules kept from the old map: only open water (sea / lake) is water + blocked. Rocks, wadis, hills and compounds are ground only (they never block a pipe or a building).
   Old saves: `protect()` clears water / blocked on every tile a saved building or pipe already stands on, so nothing that exists is ever invalid.
   The window is ONE offset (ox, oy) in world tiles: moving or growing it later is a change of that number, not of the game. */
(function (root) {
  'use strict';
  const COLS = 140, ROWS = 88;
  const PRESETS = {
    c3east:     { ox: 920,  oy: 676, label: 'east edge of the C3 reserve, dry wadis and rock outcrops (default)' },
    coast:      { ox: 528,  oy: 664, label: 'west coast and the C3 reserve corner' },
    industrial: { ox: 1468, oy: 456, label: 'extraction E1 + transport T1 compounds, wadis and rocks' }
  };
  const DEFAULT_PRESET = 'c3east';
  const GRP = { PLAIN: 0, HILL: 1, ROCK: 2, WADI: 3, WATER: 4, SLAB: 5, RESERVE: 6 };
  const STATES = 4;                  // 0 plain, 1 oil field found, 2 explored and dry, 3 region locked  (the same four looks the old ground had)
  const PAL_MAX = 64;

  function build(opts) {
    opts = opts || {};
    const P = PRESETS[opts.preset || DEFAULT_PRESET] || PRESETS[DEFAULT_PRESET];
    const ox = opts.ox != null ? opts.ox : P.ox, oy = opts.oy != null ? opts.oy : P.oy, cols = opts.cols || COLS, rows = opts.rows || ROWS;
    const Wd = opts.world || (typeof module !== 'undefined' && module.exports ? require('./world-v4.js')() : root.OliWorldV4());
    if (ox < 0 || oy < 0 || ox + cols > Wd.WW || oy + rows > Wd.WH) throw new Error('the window is outside the world');
    const N = cols * rows, water = new Uint8Array(N), block = new Uint8Array(N), coast = new Float32Array(N), cls = new Uint8Array(N), grp = new Uint8Array(N), zone = new Uint8Array(N), rgb = new Float32Array(N * 3);
    const tmp = [0, 0, 0], K = Wd.K, SUB = [.25, .75];
    for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
      const k = ty * cols + tx, wx = ox + tx, wy = oy + ty;
      const ec = Wd.elev(wx + .5, wy + .5), kc = Wd.classify(wx + .5, wy + .5, ec), A = Wd.A(), inZ = A.inZ, z = A.z;
      cls[k] = kc; if (z) zone[k] = Wd.ZONES.indexOf(z) + 1;
      let g = GRP.PLAIN;
      if (kc === K.DEEP || kc === K.SHALLOW || kc === K.LAKE) g = GRP.WATER;
      else if (kc === K.HILL) g = GRP.HILL; else if (kc === K.ROCK) g = GRP.ROCK; else if (kc === K.WADI) g = GRP.WADI;
      else if (inZ && z) g = z.k === 'RESERVE' ? GRP.RESERVE : z.k === 'FUTURE' ? GRP.PLAIN : GRP.SLAB;
      grp[k] = g;
      if (g === GRP.WATER) { water[k] = 1; block[k] = 1; coast[k] = Math.max(.1, Wd.coast(wy + .5) - (wx + .5)); } else coast[k] = Math.min(-.1, Wd.coast(wy + .5) - (wx + .5));
      let r = 0, gg = 0, b = 0;
      for (const sy of SUB) for (const sx of SUB) {
        const x = wx + sx, y = wy + sy, e = Wd.elev(x, y), dx = Wd.elev(x + 1.5, y) - Wd.elev(x - 1.5, y), dy = Wd.elev(x, y + 1.5) - Wd.elev(x, y - 1.5), kk = Wd.analyze(x, y, e);
        Wd.colorOf(x, y, e, dx, dy, kk, tmp); r += tmp[0]; gg += tmp[1]; b += tmp[2];
      }
      rgb[k * 3] = r / 4; rgb[k * 3 + 1] = gg / 4; rgb[k * 3 + 2] = b / 4;
    }
    /* palette: the most common colours (per ground group), every tile takes the nearest one of its own group */
    const STEP = opts.step || 6, cnt = new Map(), key = (g, r, gg, b) => g * 1e6 + ((r / STEP) | 0) * 1e4 + ((gg / STEP) | 0) * 100 + ((b / STEP) | 0);
    for (let k = 0; k < N; k++) { const q = key(grp[k], rgb[k * 3], rgb[k * 3 + 1], rgb[k * 3 + 2]), e = cnt.get(q) || { n: 0, g: grp[k], r: 0, gg: 0, b: 0 }; e.n++; e.r += rgb[k * 3]; e.gg += rgb[k * 3 + 1]; e.b += rgb[k * 3 + 2]; cnt.set(q, e); }
    const pal = [...cnt.values()].sort((a, b) => b.n - a.n).map(e => ({ g: e.g, r: Math.round(e.r / e.n), gg: Math.round(e.gg / e.n), b: Math.round(e.b / e.n), n: e.n }));
    const chosen = [], taken = new Set();
    for (const g of Object.values(GRP)) { let c = 0; for (const e of pal) if (e.g === g && c < 4) { chosen.push(e); taken.add(e); c++; } }    // every ground group keeps at least its commonest colours
    for (const e of pal) { if (chosen.length >= PAL_MAX) break; if (!taken.has(e)) { chosen.push(e); taken.add(e); } }
    const tile = new Uint8Array(N); let worst = 0;
    for (let k = 0; k < N; k++) {
      let best = -1, bd = 1e9;
      for (let i = 0; i < chosen.length; i++) { const c = chosen[i]; if (c.g !== grp[k]) continue; const d = Math.abs(c.r - rgb[k * 3]) + Math.abs(c.gg - rgb[k * 3 + 1]) + Math.abs(c.b - rgb[k * 3 + 2]); if (d < bd) { bd = d; best = i; } }
      if (best < 0) { best = 0; bd = 300; }
      tile[k] = best; if (bd > worst) worst = bd;
    }
    const c3 = Wd.ZONES.find(z => z.k === 'RESERVE');
    const rect = z => { const x0 = z.x - ox, y0 = z.y - oy, x1 = x0 + z.w, y1 = y0 + z.h; return (x1 <= 0 || y1 <= 0 || x0 >= cols || y0 >= rows) ? null : { x0, y0, x1, y1 }; };
    return { ox, oy, cols, rows, water, block, coast, decos: [], cls, grp, zone, tile, palette: chosen, paletteError: worst, c3: rect(c3), zones: Wd.ZONES.map(z => ({ id: z.id, k: z.k, r: rect(z) })).filter(z => z.r), preset: opts.preset || DEFAULT_PRESET, world: { w: Wd.WW, h: Wd.WH } };
  }

  /* gives core.js its map. core.js only reads map.water / map.block while placing something or routing a pipe; the numbers of the game are not changed.
     The "land" flag of an exploration area (>= 8 open tiles) is recomputed for the new ground; everything else in an area (oil, size, quality) is unchanged. */
  function install(game, opts) {
    const m = build(opts), CORE = (typeof module !== 'undefined' && module.exports) ? require('./core.js') : root.OliCore, A = CORE.CFG.EXPLORE.AREA, W = CORE.CFG.GRID_COLS, H = CORE.CFG.GRID_ROWS;
    if (m.cols !== W || m.rows !== H) throw new Error('the window must have the size of the game grid');
    game.map = { water: m.water, block: m.block, coast: m.coast, decos: [] };
    for (const a of game.areas) { let land = 0; for (let y = a.ay * A; y < Math.min(H, a.ay * A + A); y++) for (let x = a.ax * A; x < Math.min(W, a.ax * A + A); x++) if (!m.block[y * W + x]) land++; a.land = land >= 8; }
    return m;
  }

  /* an old save: every tile a building or a pipe already stands on stays usable */
  function protect(game, m) {
    let cleared = 0; const W = m.cols, mark = k => { if (k >= 0 && k < m.block.length && (m.block[k] || m.water[k])) { m.block[k] = 0; m.water[k] = 0; cleared++; } };
    for (const b of game.buildings || []) for (const k of game.cellsOf(b)) mark(k);
    if (game.pipe) for (let k = 0; k < game.pipe.length; k++) if (game.pipe[k]) mark(k);
    for (const L of game.lines || []) for (const k of L.cells || []) mark(k);
    return cleared;
  }


  /* the ground tiles for Phaser: every palette colour in the four looks of the old ground (plain, oil found, explored dry, locked). 66 x 34 diamonds, one pixel bigger than the grid so
     neighbours overlap and no seam shows. Returns a canvas of 16 columns. */
  function tilesetCanvas(m, doc) {
    const n = m.palette.length * STATES, C = 16, R = Math.ceil(n / C), TW = 66, TH = 34, cv = (doc || document).createElement('canvas'); cv.width = TW * C; cv.height = TH * R;
    const g = cv.getContext('2d');
    const rnd = s => () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    for (let i = 0; i < n; i++) {
      const pi = (i / STATES) | 0, s = i % STATES, p = m.palette[pi], r = rnd(pi * 7919 + s * 31 + 5), col = i % C, row = (i / C) | 0;
      g.save(); g.translate(col * TW, row * TH); g.beginPath(); g.moveTo(33, 0); g.lineTo(66, 17); g.lineTo(33, 34); g.lineTo(0, 17); g.closePath(); g.clip();
      g.fillStyle = 'rgb(' + p.r + ',' + p.gg + ',' + p.b + ')'; g.fillRect(0, 0, TW, TH); g.translate(1, 1);
      const px = () => 8 + r() * 48, py = () => 6 + r() * 20;
      if (p.g === GRP.PLAIN || p.g === GRP.HILL) { g.fillStyle = 'rgba(40,40,20,.10)'; for (let j = 0; j < (p.g === GRP.HILL ? 7 : 4); j++) g.fillRect(px(), py(), 2, 1); }
      else if (p.g === GRP.ROCK) { for (let j = 0; j < 5; j++) { const x = px(), y = py(), w = 3 + r() * 4, h = w * .55; g.fillStyle = 'rgba(40,36,30,.32)'; g.beginPath(); g.ellipse(x + 1, y + 1, w, h, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(190,184,172,.42)'; g.beginPath(); g.ellipse(x - .5, y - .5, w * .8, h * .75, 0, 0, 7); g.fill(); } }
      else if (p.g === GRP.WADI) { g.strokeStyle = 'rgba(235,222,190,.22)'; g.lineWidth = 1; for (let j = 0; j < 3; j++) { const y = 8 + j * 7 + r() * 3, x = 10 + r() * 20; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 14 + r() * 14, y + 1); g.stroke(); } }
      else if (p.g === GRP.WATER) { g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = 1; for (let j = 0; j < 2; j++) { const x = 12 + r() * 30, y = 8 + r() * 16; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 8 + r() * 8, y); g.stroke(); } }
      if (p.g !== GRP.WATER) {
        if (s === 1) { g.fillStyle = 'rgba(112,70,22,.30)'; g.fillRect(0, 0, 64, 32); g.fillStyle = 'rgba(60,35,10,.16)'; for (let j = 0; j < 5; j++) g.fillRect(12 + j * 9, 12 + (j % 3) * 3, 2, 2); }
        else if (s === 2) { g.fillStyle = 'rgba(92,70,40,.16)'; g.fillRect(0, 0, 64, 32); }
        else if (s === 3) { g.fillStyle = 'rgba(20,30,45,.22)'; g.fillRect(0, 0, 64, 32); }
      }
      g.restore();
    }
    return cv;
  }
  /* the tile number of one grid cell; water ignores the exploration state, like the old ground */
  function tileIndex(m, k, state) { return m.tile[k] * STATES + (m.grp[k] === GRP.WATER ? 0 : state); }

  const api = { build, install, protect, tilesetCanvas, tileIndex, PRESETS, DEFAULT_PRESET, GRP, STATES, COLS, ROWS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OliMapWindow = api;
})(typeof window !== 'undefined' ? window : globalThis);
