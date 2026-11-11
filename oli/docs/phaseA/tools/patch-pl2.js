const fs = require('fs'); const f = '/tmp/wt-b2/oli/test-refinery-v2.js'; let s = fs.readFileSync(f, 'utf8');
const a = "  CHK('9 gasoline = 45% of processed minus the loss share (yields unchanged)', near(R.tot.products.GASOLINE, R.tot.processed * 0.45 * 0.98 / 1, 1e-3) || near(R.tot.products.GASOLINE, R.tot.processed * 0.45, 1e-3), R.tot.products);";
const b = "  CHK('9 gasoline = processed x (1 - loss rate) x 45%: the yield is applied to what is not lost', near(R.tot.products.GASOLINE, R.tot.processed * 0.98 * 0.45, 1e-6), R.tot.products);";
if (s.split(a).length !== 2) throw new Error('match'); s = s.replace(a, () => b); fs.writeFileSync(f, s); console.log('ok');
