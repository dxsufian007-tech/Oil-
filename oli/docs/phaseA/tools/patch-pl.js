const fs = require('fs'); const f = '/tmp/wt-b2/oli/test-refinery-v2.js'; let s = fs.readFileSync(f, 'utf8');
const anchor = "console.log('\\nREFINERY V2 TESTS: '";
if (s.split(anchor).length !== 2) throw new Error('anchor');
const add = `/* 9. physical loss is its own line: 2% of the crude processed, efficiency and yields unchanged */
{ const old = BC.REFINERY.physicalLoss; BC.REFINERY.physicalLoss = 0.02; try { const P = plant('x', fullCfg()); const R = run(P, 5); report('9. فاقد فيزيائي 2% (منفصل عن الكفاءة)', R); CHECKS('9', R);
  CHK('9 physical loss = 2% of the crude processed', near(R.tot.loss, R.tot.processed * 0.02, 1e-6), { loss: R.tot.loss, processed: R.tot.processed });
  CHK('9 efficiency unchanged by the loss rate', near(R.eff, S1.eff, 1e-9), { loss9: R.eff, s1: S1.eff });
  CHK('9 gasoline = 45% of processed minus the loss share (yields unchanged)', near(R.tot.products.GASOLINE, R.tot.processed * 0.45 * 0.98 / 1, 1e-3) || near(R.tot.products.GASOLINE, R.tot.processed * 0.45, 1e-3), R.tot.products);
} finally { BC.REFINERY.physicalLoss = old; } }

`;
s = s.replace(anchor, () => add + anchor); fs.writeFileSync(f, s); console.log('ok');
