/* Oli - credit.js  (Banking Phase 3: the credit rating, 0..1000; owner-approved weights)
 * score = 1000 x ( 30% payment history + 25% cash flows + 15% debt / assets + 15% profitability + 10% liquidity + 5% operational stability ), each part 0..1.
 * The mapping of every indicator to 0..1 is linear between the two limits in CREDIT.limits (a config assumption; the weights are the approved ones).
 * Pure functions: no company access, no random, no clock, no DOM.  Inputs come from Company.creditInputs() once a month.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OliCredit = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lin = (v, lo, hi) => hi === lo ? 0 : clamp((v - lo) / (hi - lo), 0, 1);
  /* in = { onTime, late, arrearsNow, opMargin (operating cash flow / operating cash out, or null), debtToAssets, netMargin (% or null), currentRatio (or null), prodCV (coefficient of variation of the last 6 months crude output, or null) } */
  function parts(inp, C) {
    const L = C.limits, N = C.neutral, n = (inp.onTime | 0) + (inp.late | 0);
    const pay = n === 0 && !(inp.arrearsNow > 0) ? N.pay : clamp((n ? inp.onTime / n : 1) - C.arrearsPenalty * (inp.arrearsNow | 0), 0, 1);
    const cf = inp.opMargin == null ? N.cf : lin(inp.opMargin, L.opMargin[0], L.opMargin[1]);
    const debt = inp.debtToAssets == null ? N.debt : 1 - lin(inp.debtToAssets, L.debtToAssets[0], L.debtToAssets[1]);
    const prof = inp.netMargin == null ? N.prof : lin(inp.netMargin, L.netMargin[0], L.netMargin[1]);
    const liq = inp.currentRatio == null ? N.liq : lin(inp.currentRatio, L.currentRatio[0], L.currentRatio[1]);
    const stab = inp.prodCV == null ? N.stab : 1 - lin(inp.prodCV, L.prodCV[0], L.prodCV[1]);
    return { pay, cf, debt, prof, liq, stab };
  }
  function score(inp, C) {
    const p = parts(inp, C), W = C.weights; let s = 0; for (const k of Object.keys(W)) s += W[k] * p[k];
    return { score: Math.round(clamp(s, 0, 1) * 1000), parts: p };
  }
  const gradeOf = (s, C) => { for (const g of C.grades) if (s >= g.min) return g.id; return C.grades[C.grades.length - 1].id; };
  const premiumOf = (s, C) => { for (const g of C.grades) if (s >= g.min) return g.premium; return C.grades[C.grades.length - 1].premium; };
  /* coefficient of variation (population) of a list of monthly outputs; null with fewer than 3 months */
  function cv(list) { if (!list || list.length < 3) return null; let m = 0; for (const v of list) m += v; m /= list.length; if (!(m > 0)) return 1; let q = 0; for (const v of list) q += (v - m) * (v - m); return Math.sqrt(q / list.length) / m; }
  return { score, parts, gradeOf, premiumOf, cv, lin, clamp };
});
