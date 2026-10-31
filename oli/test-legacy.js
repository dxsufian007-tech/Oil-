// Test helper for the Phase 1-4 core tests, which were written for the original 44 x 28 map with hard-coded tile numbers.
// The old map now sits inside the 10x world at (OX, OY); this shifts every coordinate those tests pass in, and every coordinate they read back.
const core = require('./core.js'), { Game, CFG } = core, { OX, OY } = CFG.WORLD;
const P = Game.prototype;
// numbers of the old map (x < 44, y < 28) are shifted; tiles read from areas are already global
function shiftArgs(name, ix) {                       // ix: argument positions that are x / y (pairs)
  const orig = P[name];
  P[name] = function (...a) {
    if (this._lg) return orig.apply(this, a);
    this._lg = 1;
    try { for (const [xi, yi] of ix) { if (a[xi] != null && a[xi] < 44 && a[yi] < 28) { a[xi] += OX; a[yi] += OY; } } return orig.apply(this, a); } finally { this._lg = 0; }
  };
}
shiftArgs('place', [[1, 2]]); shiftArgs('canPlace', [[1, 2]]); shiftArgs('removeAt', [[0, 1]]); shiftArgs('areaAt', [[0, 1]]); shiftArgs('regionAt', [[0, 1]]);
shiftArgs('terrainAt', [[0, 1]]); shiftArgs('tileMult', [[0, 1]]); shiftArgs('footMult', [[1, 2]]); shiftArgs('buildingAt', [[0, 1]]); shiftArgs('isAnchor', [[0, 1]]);
shiftArgs('routePipe', [[0, 1], [2, 3]]); shiftArgs('buildCost', [[2, 3]]);
// tile numbers (idx(x, y) of the old map) -> tile numbers of the new map
core.legacyIdx = (x, y) => core.idx(x + OX, y + OY);
const oldAreas = g => g.areas.filter(a => a.ax * 4 >= OX && a.ay * 4 >= OY && a.ax * 4 < OX + 44 && a.ay * 4 < OY + 28);   // areas that were part of the old map
module.exports = { OX, OY, idx: (x, y) => (x < 44 && y < 28) ? core.idx(x + OX, y + OY) : core.idx(x, y), oldAreas };
