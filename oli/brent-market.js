/* Oli - brent-market.js : the historical Brent market (pure functions, no DOM, no clock of its own)
 *
 *  - Prices come ONLY from brent-data.js (EIA daily spot, 2000-01-04 .. last published day). Nothing is invented or interpolated.
 *  - The cycle: market day n of the game = START + (n mod L), cycle number = floor(n / L) + 1.  L = number of calendar days from the first to the last record.
 *    When the last record is passed the market starts again from the first (cycle + 1).  The original rows are frozen and are never written to.
 *  - A calendar day with no record (weekend / holiday) carries the last official close ("closed day"); it has no candle.
 *  - Candles: the source has ONE price per trading day, so  Close = last official close of the period,  Open = last close of the PREVIOUS period (the first
 *    period opens at its own first close),  High / Low = highest / lowest official close among the period's closes and its Open.  Volume is not in the source: null.
 *  - The game clock is the only clock: position(gameDay) is a pure function of the central day counter.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./brent-data.js'));
  else root.OliBrentMarket = factory(root.OliBrentData);
})(typeof self !== 'undefined' ? self : this, function (DATA) {
  'use strict';
  const ROWS = DATA.ROWS, META = DATA.META, DAY = 86400000;
  const num = s => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / DAY);              // days since 1970-01-01 (no time zones)
  const iso = n => new Date(n * DAY).toISOString().slice(0, 10);
  const dn = ROWS.map(r => num(r[0])), START = dn[0], END = dn[dn.length - 1], L = END - START + 1;
  const byPos = new Float64Array(L), trading = new Uint8Array(L), rowAt = new Int32Array(L);                       // price / is-trading-day / row index (last record at or before the day)
  { let k = 0; for (let i = 0; i < L; i++) { while (k + 1 < dn.length && dn[k + 1] <= START + i) k++; rowAt[i] = k; byPos[i] = ROWS[k][1]; trading[i] = dn[k] === START + i ? 1 : 0; } }

  /* where the market is on game day n (n = days since the game began, from the central calendar) */
  function position(n, offset) {
    n = Math.max(0, Math.floor(n || 0)) + (offset || 0); const pos = n % L, cycle = Math.floor(n / L) + 1;
    return { cycle, pos, dayNum: START + pos, date: iso(START + pos), price: byPos[pos], trading: !!trading[pos], recordDate: ROWS[rowAt[pos]][0], cycleDays: L, lastOfCycle: pos === L - 1 };
  }
  const priceAtPos = pos => byPos[((pos % L) + L) % L];
  const priceOn = date => { const n = num(date) - START; return n < 0 || n >= L ? null : byPos[n]; };                  // the carried close for a non-trading day; null outside the data
  const closeOn = date => { const n = num(date) - START; return n >= 0 && n < L && trading[n] ? byPos[n] : null; };    // the official close ON that day (null = no record that day)

  /* ---- candles ---- */
  const FRAMES = { D: 'يومي', W: 'أسبوعي', M: 'شهري', Y: 'سنوي' };
  const keyOf = (date, frame) => { if (frame === 'D') return date; if (frame === 'M') return date.slice(0, 7); if (frame === 'Y') return date.slice(0, 4);
    const n = num(date), dow = (n + 3) % 7; return iso(n - dow); };                                                 // week = Monday..Sunday, keyed by its Monday (1970-01-01 was a Thursday: (0+3)%7 = 3)
  function aggregate(frame, upto) {                                                                                  // upto = last day number included (the market 'now'); null = all history
    const out = []; let cur = null, prevClose = null;
    for (let i = 0; i < ROWS.length; i++) {
      if (upto != null && dn[i] > upto) break; const d = ROWS[i][0], c = ROWS[i][1], k = keyOf(d, frame);
      if (!cur || cur.key !== k) { if (cur) prevClose = cur.c; cur = { key: k, start: d, end: d, o: prevClose != null ? prevClose : c, h: 0, l: Infinity, c, v: null, n: 0 }; cur.h = cur.o; cur.l = cur.o; out.push(cur); }
      cur.end = d; cur.c = c; cur.n++; if (c > cur.h) cur.h = c; if (c < cur.l) cur.l = c;
    }
    return out;
  }
  const cache = {};
  function candles(frame, opt) {
    opt = opt || {}; frame = FRAMES[frame] ? frame : 'D'; let all;
    if (opt.upto != null) all = aggregate(frame, opt.upto); else all = cache[frame] || (cache[frame] = aggregate(frame, null));
    let a = all; if (opt.from) a = a.filter(c => c.end >= opt.from); if (opt.to) a = a.filter(c => c.start <= opt.to); return a.map(c => Object.assign({}, c));
  }
  /* compare two periods (e.g. 2008 vs 2020): change, range and average of the official closes inside each */
  function period(from, to) {
    const rows = ROWS.filter(r => r[0] >= from && r[0] <= to); if (!rows.length) return null; const px = rows.map(r => r[1]), first = px[0], last = px[px.length - 1];
    let hi = px[0], lo = px[0], hiD = rows[0][0], loD = rows[0][0]; for (const r of rows) { if (r[1] > hi) { hi = r[1]; hiD = r[0]; } if (r[1] < lo) { lo = r[1]; loD = r[0]; } }
    return { from, to, days: rows.length, first, last, change: last / first - 1, high: hi, highDate: hiD, low: lo, lowDate: loD, avg: px.reduce((a, b) => a + b, 0) / px.length };
  }
  return { META, START, END, L, FIRST: ROWS[0][0], LAST: ROWS[ROWS.length - 1][0], FRAMES, position, priceAtPos, priceOn, closeOn, candles, period, num, iso, count: ROWS.length };
});
