const fs = require('fs');
function patch(file, pairs) {
  let s = fs.readFileSync(file, 'utf8');
  for (const [a, b] of pairs) { const n = s.split(a).length - 1; if (n !== 1) throw new Error(file + ': expected 1 match, got ' + n + ' for ' + a.slice(0, 60)); s = s.replace(a, () => b); }
  fs.writeFileSync(file, s); console.log('patched', file);
}
patch('/tmp/wt-b2/oli/test-economy.js', [
  ["const g = rich(true, true); for (const p of EC.PRODUCTS) g.co.setMode(p, 'SPOT'); days(g, 20);",
   "const g = rich(true, true); for (const p of EC.PRODUCTS) g.co.setMode(p, 'SPOT'); for (let d = 0; d < 20; d++) { stockUp(g.co); days(g, 1); } /* the refinery uses chemicals every day: restock as a company buys them */"],
  ["const gp = game(500e6, small); const cp2 = chain(gp, true); days(gp, 4);",
   "const gp = game(500e6, small); const cp2 = chain(gp, true); stockUp(gp.co); days(gp, 4);"],
]);
patch('/tmp/wt-b2/oli/test-building-lab.js', [
  ["await p.evaluate(() => __lab.sim.run(3)); const st",
   "await p.evaluate(() => { for (const [m, q] of [['CHEM', 20000], ['OPS', 5000], ['PARTS', 200]]) __lab.company.buy(m, q, 'A', 'CASH'); }); await p.evaluate(() => __lab.sim.run(3)); const st"],
]);
