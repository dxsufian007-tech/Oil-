/* offline catch-up: running it in short slices must give EXACTLY the same company as running it in one go */
const { game, put, pipe, reload } = require('./test-reserve-helpers.js');
let ok = 0, bad = 0; const t = (n, c) => { if (c) ok++; else { bad++; console.log('FAIL', n); } };
function mk() { const g = game(); put(g, 'crude_tank_l', 20, 20); g.co.speed = 1; g.co.run(24); return g; }
for (const away of [0.05, 3, 24, 100]) {
  const a = mk(), b = reload(mk()); const base = Date.now(); a.co.stamp(base - away * 3600e3); b.co.stamp(base - away * 3600e3);
  const ra = a.co.catchUp(base), j = b.co.catchUpStart(base); let n = 0, rb;
  if (!j) { t('no job both null ' + away, ra === null); continue; }
  if (!j.job) { t('same non-job ' + away, JSON.stringify(ra) === JSON.stringify(j)); continue; }
  while (b.co.catchUpStep(0) < 1) n++;                                  // 0 ms budget = one tick per slice (the harshest slicing)
  rb = b.co.catchUpFinish();
  t('slices happened ' + away, n >= 1); t('report equal ' + away, JSON.stringify(ra) === JSON.stringify(rb));
  t('cash equal ' + away, a.store.cash === b.store.cash); t('ledger equal ' + away, JSON.stringify(a.co.led) === JSON.stringify(b.co.led));
  t('lastSim equal ' + away, a.co.lastSim === b.co.lastSim); t('no job left ' + away, b.co._cu == null);
}
console.log('CATCHUP SLICED:', ok, 'passed,', bad, 'failed'); process.exit(bad ? 1 : 0);
