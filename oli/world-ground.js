/* Visual-only ground for the world preview: the same terrain DATA, rules, oil and regions as the game; only the pixels of the ground (land, coast, sea) are drawn by world-v4.js.
   ground=old (default off) keeps the original renderer. Used by the worker and by the no-worker fallback. */
(function (root) {
  function make(world, G, warm) {
    const W4 = G(); W4.setCoast(world.coastLine); W4.setZones(false);
    return {
      img: (cx, cy, k) => W4.renderTiles(cx * 64, cy * 64, 64, 64, k, warm),
      overview: (o, W, H) => { const r = W4.renderTiles(0, 0, W, H, 1 / o.step, warm); return r.length === o.rgba.length ? r : null; }
    };
  }
  root.OliGround = { make };
})(typeof self !== 'undefined' ? self : window);
