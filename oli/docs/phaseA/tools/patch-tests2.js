const fs = require('fs'); const f = '/tmp/wt-b2/oli/test-economy.js';
let s = fs.readFileSync(f, 'utf8');
const a = "for (let d = 0; d < 20; d++) { stockUp(g.co); days(g, 1); }";
const b = "for (let d = 0; d < 20; d++) { for (const [m, cap] of [['CHEM', 20000], ['OPS', 5000]]) { const need = Math.floor(cap - (g.co.mats[m] || 0)); if (need > 0) g.co.buy(m, need, 'A', 'CASH'); } days(g, 1); }";
if (s.split(a).length !== 2) throw new Error('match'); s = s.replace(a, () => b); fs.writeFileSync(f, s); console.log('ok');
