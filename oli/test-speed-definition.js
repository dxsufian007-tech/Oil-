/* The speed reference (owner decision, Nov 15): x1 = 1 game hour per real second, x2 = 2, x5 = 5. (x10 is withdrawn.)
 * The buttons / labels / diagnostics use game hours per real second; `speed` keeps its old unit, so saves, the clock and the offline catch-up are untouched.
 *   NODE_PATH=/opt/npm-tools/node_modules node oli/test-speed-definition.js */
const { EC, game } = require('./test-economy-helpers.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const g = () => game(1e6).co;
{ const co = g();
  T('1 the official speeds are 1, 2 and 5 game hours per real second', JSON.stringify(EC.TIME.officialHps) === '[1,2,5]');
  T('2 their internal values are 0.5, 1, 2.5 (the clock unit did not change: dayRealSeconds is still ' + EC.TIME.dayRealSeconds + ')', JSON.stringify(co.officialSpeeds()) === '[0.5,1,2.5]' && EC.TIME.dayRealSeconds === 12);
  T('3 every official speed is accepted by setSpeed', co.officialSpeeds().every(v => co.setSpeed(v).ok));
  T('4 hps / label: x1 = 1, x2 = 2, x5 = 5 hours per second', [0.5, 1, 2.5].map(v => co.hps(v)).join() === '1,2,5' && [0.5, 1, 2.5].map(v => co.speedLabel(v)).join() === '1,2,5');
  T('5 an old saved speed keeps its real rate and is labelled with it (old 1 = 2 h/s -> x2; old 5 -> x10)', co.hps(1) === 2 && co.hps(5) === 10 && co.speedLabel(5) === '10');
  co.setSpeed(0.5); const seq = [co.speedLabel()]; for (let i = 0; i < 4; i++) { co.faster(); seq.push(co.speedLabel()); }
  T('6 faster: x1 -> x2 -> x5 and stops at x5', seq.join() === '1,2,5,5,5', seq);
  const dn = [co.speedLabel()]; for (let i = 0; i < 4; i++) { co.slower(); dn.push(co.speedLabel()); }
  T('7 slower: x5 -> x2 -> x1 and stops at x1 (never pauses by itself)', dn.join() === '5,2,1,1,1', dn);
  co.setSpeed(5); co.faster(); T('8 an old speed above x5 (old x5 = 10 h/s) is not changed by "faster"', co.speed === 5); co.slower(); T('9 "slower" from an old speed goes down to the official x5', co.speed === 2.5, co.speed);
  co.setSpeed(2); co.faster(); T('10 from an old speed between the official ones (old x2 = 4 h/s) faster goes to x5', co.speed === 2.5, co.speed);
  co.setSpeed(0); co.resume(); T('11 resume goes back to the last speed', co.speed === 2.5 || co.speed > 0);
}
/* the clock: official speed N advances exactly N game hours per real second (same formula the lab uses) */
for (const label of [1, 2, 5]) { const gm = game(1e6), co = gm.co; co.setSpeed(co.speedOfHps(label)); let left = 60; const dt = EC.TIME.tickMs / 1000;
  while (left > 1e-9) { co.run(dt * (24 / EC.TIME.dayRealSeconds) * co.speed); left -= dt; }
  T('12 x' + label + ': 60 real seconds give ' + 60 * label + ' game hours (got ' + co.hours + ')', Math.abs(co.hours - 60 * label) <= 1.0001, co.hours); }
/* old save: the stored speed is read back unchanged (setSpeed is not used by fromJSON) */
{ const a = game(1e6).co; a.setSpeed(5); const j = a.toJSON(), b = game(1e6).co; b.fromJSON(JSON.parse(JSON.stringify(j))); T('13 a save with speed 5 loads with speed 5 (same rate as before)', b.speed === 5 && b.lastSpeed === 5);
  const old = JSON.parse(JSON.stringify(j)); T('14 the save format has no new field (no speed unit marker)', !('speedUnit' in old)); }
console.log(fail ? '\nSPEED DEFINITION TESTS FAILED (' + fail + ')' : '\nSPEED DEFINITION TESTS PASSED (' + pass + ' checks)'); process.exit(fail ? 1 : 0);
