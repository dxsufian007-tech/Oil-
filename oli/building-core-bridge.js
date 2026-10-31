/* Oli - building-core-bridge.js (Phase 2 adapter, read-only)
 * The Building Registry and core.js (Phase B/C game) describe the same three things (well, tank, pump) in two places. This adapter does NOT change either:
 * it maps registry ids to core types and reports every difference, so the later integration knows exactly what to reconcile (see docs/BUILDING_SYSTEM.md, CONFLICT list).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OliCoreBridge = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MAP = { oil_well: 'well', oil_tank: 'tank', pump_station: null /* core 'pump' is a 1x1 in-line pump, a different machine: see CONFLICT 2 */ };
  const SIDE_OF = { 0: 0, 1: 1, 2: 2, 3: 3 };                                  // both use 0 east, 1 west, 2 south, 3 north
  // compare a registry definition with core.js: footprint, and the SET of (role, side) ports of an unrotated building at a given anchor
  function compare(def, game, coreType) {
    const diffs = [], [w, h] = game.footprintOf(coreType);
    if (def.footprint[0] !== w || def.footprint[1] !== h) diffs.push('footprint registry ' + def.footprint.join('x') + ' vs core ' + w + 'x' + h);
    const pts = game.connectionPoints(coreType, 0, 0, 0), coreSides = new Set(pts.map(p => p.role + ':' + p.side)), regSides = new Set(def.connections.filter(c => c.kind === 'pipe' && !c.reserved).map(c => (c.role === 'both' ? 'both' : c.role) + ':' + SIDE_OF[c.side]));
    for (const k of coreSides) if (!regSides.has(k)) diffs.push('core port ' + k + ' missing in registry');
    for (const k of regSides) if (!coreSides.has(k)) diffs.push('registry port ' + k + ' not in core');
    return diffs;
  }
  return { MAP, compare };
});
