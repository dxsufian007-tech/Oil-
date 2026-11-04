/* Oli - test-ratios.js  (Economy Phase 13: financial ratios - margins, ROA and ROE on average balances, current ratio, debt to assets, cost per barrel)
 * Run: NODE_PATH=/opt/npm-tools/node_modules node test-ratios.js
 */
const { B, I, E, EC, game, put, pipe, chain } = require('./test-economy-helpers.js');
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol) * Math.max(1, Math.abs(a), Math.abs(b));
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); } };
const quietCfg = () => { const c = JSON.parse(JSON.stringify(EC)); c.FIXED = { insurancePerMonth: 0, adminBase: 0, adminPerAsset: 0, infraPerYear: 0 }; c.POWER.tiers[0].monthly = 0; c.STORAGE_COST = { CRUDE: 0, GASOLINE: 0, DIESEL: 0, JET_FUEL: 0, GAS: 0 }; return c; };

// one closed month with known figures: sales 100,000 - cost of goods 60,000 - operating 20,000 - tax 4,000 = net 16,000
function month() { const g = game(1e6, quietCfg()), co = g.co; co.openSnap = co._snap();
  co._post({ type: 'PROD_CRUDE', flow: 'OP', desc: 'production cost' }, [['INV_CRUDE', 60000], ['CASH', -60000]]); co.qty.CRUDE = 1000;
  co._post({ type: 'SALE_SPOT', flow: 'OP', desc: 'sales' }, [['CASH', 100000], ['REV_SPOT', -100000]]);
  co._post({ type: 'COGS', desc: 'cost of goods sold' }, [['COGS', 60000], ['INV_CRUDE', -60000]]); co.qty.CRUDE = 0;
  co._expense('operating', 20000, 'operating'); co._monthEnd(); return co; }

/* Q1-Q2. margins: net margin = net / revenue; operating margin = operating profit (before interest and tax) / revenue */
{ const co = month(), r = co.lastMonth.ratios;
  T('Q1 net margin = 16,000 / 100,000 = 16%', near(r.netMargin, 16, 1e-6), r.netMargin);
  T('Q2 operating margin = (gross - operating costs) / revenue = 20%', near(r.operatingMargin, 20, 1e-6), r.operatingMargin); }

/* Q3-Q4. ROA and ROE use the average balance (start and end), not the closing balance */
{ const co = month(), r = co.lastMonth.ratios, i = r.inputs;
  T('Q3 ROA = net / average assets', near(r.roa, i.netProfit / i.avgAssets * 100, 1e-9), [r.roa, i.netProfit / i.avgAssets * 100]);
  T('Q4 ROE = net / average equity', near(r.roe, i.netProfit / i.avgEquity * 100, 1e-9), [r.roe, i.netProfit / i.avgEquity * 100]);
  T('Q4a the averages are the mean of the start and end balances of the month', near(i.avgAssets, (co.openSnap.assets + co.bsStart.assets) / 2, 1e-6), [i.avgAssets, co.openSnap.assets, co.bsStart.assets]); }
{ // averages differ from closing balances when a month changes the balance sheet
  const co = month(); const start = { assets: 100, equity: 100, liabilities: 0, current: 60, currentLiab: 0 }, end = { assets: 300, equity: 300, liabilities: 0, current: 260, currentLiab: 0 };
  const r = co._ratios(co.lastMonth, start, end); T('Q4b with start 100 and end 300 the average is 200, so ROA = net / 200', near(r.inputs.avgAssets, 200, 1e-9) && near(r.roa, r.inputs.netProfit / 200 * 100, 1e-9), [r.inputs.avgAssets, r.roa]); }

/* Q5. current ratio = current assets / current liabilities; not available with no current liabilities */
{ const co = month(); const end = { assets: 1000, equity: 500, liabilities: 500, current: 600, currentLiab: 200 }, start = end; const r = co._ratios(co.lastMonth, start, end);
  T('Q5 current ratio = 600 / 200 = 3', near(r.currentRatio, 3, 1e-9), r.currentRatio);
  const r2 = co._ratios(co.lastMonth, start, Object.assign({}, end, { currentLiab: 0 })); T('Q5a no current liabilities: not available (null)', r2.currentRatio === null, r2.currentRatio); }

/* Q6. debt to assets = liabilities / assets; not available with zero assets */
{ const co = month(); const end = { assets: 1000, equity: 500, liabilities: 500, current: 1, currentLiab: 1 }; const r = co._ratios(co.lastMonth, end, end);
  T('Q6 debt to assets = 500 / 1000 = 0.5', near(r.debtToAssets, 0.5, 1e-9), r.debtToAssets);
  const z = co._ratios(co.lastMonth, { assets: 0, equity: 0, liabilities: 0, current: 0, currentLiab: 0 }, { assets: 0, equity: 0, liabilities: 0, current: 0, currentLiab: 0 });
  T('Q6a zero assets: debt to assets and ROA are not available', z.debtToAssets === null && z.roa === null && z.roe === null, z); }

/* Q7. cost per barrel = costs / barrels produced; not available without production */
{ const co = month(); const r = co.lastMonth.ratios; T('Q7 cost per barrel is available when barrels were produced', r.inputs.barrels > 0 ? r.costPerBarrel !== null : true, [r.inputs.barrels, r.costPerBarrel]);
  const z = co._ratios({ revenue: 0, netProfit: 0, grossProfit: 0, opex: 0, variable: 0, L: { produced: { CRUDE: 0, GASOLINE: 0, DIESEL: 0, JET_FUEL: 0, GAS: 0 } } }, { assets: 1, equity: 1, liabilities: 0, current: 1, currentLiab: 1 }, { assets: 1, equity: 1, liabilities: 0, current: 1, currentLiab: 1 });
  T('Q7a no barrels: cost per barrel not available (null), net margin not available (no sales)', z.costPerBarrel === null && z.netMargin === null && z.operatingMargin === null, z); }

/* Q8. a company with no sales: margins not available */
{ const g = game(1e6, quietCfg()), co = g.co; co._monthEnd(); T('Q8 no sales: net margin not available', co.lastMonth.ratios.netMargin === null, co.lastMonth.ratios.netMargin); }

/* Q9. the ratios are the same after a save and load */
{ const co = month(); const sd = JSON.parse(JSON.stringify(co.toJSON())), co2 = game(1).co; co2.fromJSON(sd);
  T('Q9 ratios and the start balance survive save and load', co2.lastMonth.ratios.netMargin === co.lastMonth.ratios.netMargin && co2.bsStart && near(co2.bsStart.assets, co.bsStart.assets, 1e-9), [co2.lastMonth && co2.lastMonth.ratios.netMargin]); }

/* Q10. two years of play: every ratio is a finite number or null, never NaN or Infinity */
{ const g = game(500e6, quietCfg()), co = g.co; chain(g, true, true); co.injectEquity(1e6, 'test'); let bad = null;
  for (let m = 0; m < 24 && !bad; m++) { co.advanceHours(24 * 30); const r = co.lastMonth && co.lastMonth.ratios; if (r) for (const k of ['netMargin', 'operatingMargin', 'roa', 'roe', 'currentRatio', 'debtToAssets', 'costPerBarrel']) if (r[k] !== null && !isFinite(r[k])) bad = { m, k, v: r[k] }; }
  T('Q10 no NaN or Infinity in any ratio over two years', !bad, bad); }

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
