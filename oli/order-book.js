/* Oli - order-book.js : the order book and the execution walk (S2).  Pure: no DOM, no clock, no company.
 *
 * LIQUIDITY.  A side of the book is a ladder of price levels away from the market price.  Each level holds real orders (other players' standing limit orders, S5) PLUS - only if the
 * model is switched on - simulated liquidity, which is always labelled src:'SIM' ("نموذج سيولة محاكى من عمق السوق"): it is derived from the market depth of the product (config), the commercial stock cover and
 * the volatility of the market state, NEVER a fixed price path and never invented orders presented as real ones.  With no real orders on a side and the model off, that side is EMPTY (no fake liquidity).
 * EXECUTION.  A market order WALKS the ladder from the best price: every level is filled at its own price (so a size above the liquidity is not priced at one price), stops at the
 * order's limit price and at the slippage cap (maxSlip), and fills PARTIALLY when the book cannot take the rest.  The result is the volume-weighted average price (VWAP).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OliOrderBook = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const DEF = { step: 0.001, halfSpread: 0.0005, levelShare: 0.12, maxSlip: 0.05, simulated: true, coverExp: 0.5, volExp: 1 };
  /* ctx = { cover: commercial stock / normal stock, vol: volatility multiplier of the market state (1 = calm) }.  real = [{ side, price, qty, owner }] */
  function build(price, depth, ctx, cfg, real) {
    const C = Object.assign({}, DEF, cfg || {}), cover = clamp(ctx && ctx.cover > 0 ? ctx.cover : 1, 0.2, 3), vol = clamp(ctx && ctx.vol > 0 ? ctx.vol : 1, 0.5, 4);
    const hs = C.halfSpread * vol, liq = Math.pow(cover, C.coverExp) / Math.pow(vol, C.volExp), n = Math.max(1, Math.ceil(C.maxSlip / C.step)), per = Math.max(0, depth * C.levelShare * liq);
    const side = (s) => { const dir = s === 'ASK' ? 1 : -1, rows = [], map = new Map();
      if (C.simulated) for (let k = 0; k < n; k++) { const p = Math.round(price * (1 + dir * (hs + C.step * k)) * 100) / 100; map.set(p, { price: p, qty: per, src: 'SIM', real: 0 }); }
      for (const o of real || []) { if (o.side !== (s === 'ASK' ? 'SELL' : 'BUY') || !(o.qty > 0) || !(o.price > 0)) continue; const p = Math.round(o.price * 100) / 100, r = map.get(p) || { price: p, qty: 0, src: 'REAL', real: 0 }; r.qty += o.qty; r.real += o.qty; if (r.src === 'SIM' && r.real > 0) r.src = 'MIXED'; map.set(p, r); }
      for (const r of map.values()) rows.push(r); rows.sort((a, b) => s === 'ASK' ? a.price - b.price : b.price - a.price); return rows; };
    const asks = side('ASK'), bids = side('BID'), ba = asks.length ? asks[0].price : null, bb = bids.length ? bids[0].price : null;
    return { price, asks, bids, bestAsk: ba, bestBid: bb, spread: ba != null && bb != null ? ba - bb : null, spreadPct: ba != null && bb != null && price ? (ba - bb) / price : null,
      liquidityAsk: asks.reduce((a, r) => a + r.qty, 0), liquidityBid: bids.reduce((a, r) => a + r.qty, 0), source: C.simulated ? 'SIM' : 'REAL', cfg: C };
  }
  /* walk one side for `qty`: side 'BUY' takes the asks (ascending), 'SELL' takes the bids (descending).  opts.limit = worst acceptable price; opts.maxSlip = cap vs the market price.
   * The result is deterministic: same book + same order = same fills. */
  function walk(book, side, qty, opts) {
    opts = opts || {}; const buy = side === 'BUY', rows = buy ? book.asks : book.bids, cap = opts.maxSlip != null ? opts.maxSlip : book.cfg.maxSlip, px = book.price;
    const worst = buy ? Math.min(opts.limit > 0 ? opts.limit : Infinity, px * (1 + cap) + 1e-9) : Math.max(opts.limit > 0 ? opts.limit : 0, px * (1 - cap) - 1e-9);
    let left = Math.max(0, +qty || 0), filled = 0, cost = 0; const fills = [];
    for (const r of rows) { if (left <= 1e-9) break; if (buy ? r.price > worst : r.price < worst) break; const take = Math.min(left, r.qty); if (take <= 0) continue; fills.push({ price: r.price, qty: take, src: r.src }); filled += take; cost += take * r.price; left -= take; }
    const vwap = filled > 0 ? cost / filled : 0, best = rows.length ? rows[0].price : null;
    return { side, requested: Math.max(0, +qty || 0), filled, unfilled: Math.max(0, (+qty || 0) - filled), partial: filled > 1e-9 && left > 1e-9, vwap, cost, fills, levelsUsed: fills.length, bestPrice: best,
      slippage: best && filled > 0 ? (buy ? vwap / best - 1 : 1 - vwap / best) : 0, slippageVsMarket: filled > 0 && px ? (buy ? vwap / px - 1 : 1 - vwap / px) : 0, reason: filled <= 1e-9 ? (rows.length ? 'limit' : 'noLiquidity') : null };
  }
  return { DEF, build, walk };
});
