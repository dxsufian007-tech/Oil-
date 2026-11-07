// Strategic Reserve buy / sell: the quantity choices run from 100,000 to 5,000,000 barrels and the quotes accept them.   node test-reserve-qty.js
const fs = require('fs'), assert = require('assert'); let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
const ui = fs.readFileSync(__dirname + '/economy-ui.js', 'utf8');
ok(/RVQ = \[100000, 250000, 500000, 1000000, 2500000, 5000000\]/.test(ui), 'the reserve quantity list is 100k, 250k, 500k, 1M, 2.5M, 5M');
ok(/pick\('rvq', rvQ, RVQ\)/.test(ui) && /pick\('rvsq', rvSellQ, RVQ\)/.test(ui), 'both the buy and the sell pickers use it');
ok(/rvQ = 100000,/.test(ui) && /rvSellQ = 100000/.test(ui), 'the default order is the smallest one (100,000)');
const H = require('./test-reserve-helpers.js'); const g = H.game(1e13), co = g.co;
for (const q of [100000, 5000000]) { const t = co.buyQuote('CRUDE', q, 'A'); ok(t.ok && t.qty === q && t.total > 0, 'a purchase quote for ' + q.toLocaleString() + ' bbl is accepted (total $' + Math.round(t.total).toLocaleString() + ')'); }
console.log('RESERVE QTY TESTS PASSED (' + n + ' checks)');
