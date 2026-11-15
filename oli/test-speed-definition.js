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
  T('8 a new game starts at x1 = 1 game hour per real second (internal 0.5)', co.speed === 0.5 && co.lastSpeed === 0.5 && co.hps() === 1 && co.speedLabel() === '1');
  for (const press of ['faster', 'slower', 'cycleSpeed']) for (const old of [2, 5, 10]) { const c2 = g(); c2.setSpeed(old); const before = c2.speed; c2[press](); T('9 old speed ' + old + ' (x' + c2.speedLabel(old) + '): "' + press + '" goes to x1 on the first press', before === old && c2.speed === 0.5, c2.speed); }
  { const c2 = g(); c2.setSpeed(5); c2.cycleSpeed(); const seq = [c2.speedLabel()]; for (let i = 0; i < 3; i++) { c2.cycleSpeed(); seq.push(c2.speedLabel()); } T('10 after the first press the cycle is x1 -> x2 -> x5 -> x1', seq.join() === '1,2,5,1', seq); }
  for (const sv of [0.5, 1, 2, 2.5, 5, 10]) for (const old of [true, false]) { const x = game(1e6).co; x.setSpeed(sv); const d = JSON.parse(JSON.stringify(x.toJSON())); T('10a a saved game carries speedRef 1 (new format)', d.speedRef === 1); if (old) delete d.speedRef; const y = game(1e6).co; y.fromJSON(d); const isX1 = sv === 0.5, offi = [0.5, 1, 2.5].includes(sv); y.faster();
    const e1 = old ? (isX1 ? 1 : 0.5) : (offi ? (isX1 ? 1 : sv === 1 ? 2.5 : 2.5) : 0.5);
    T('10b ' + (old ? 'OLD save (no speedRef)' : 'NEW save') + ' loaded at speed ' + sv + ': the first press goes to internal ' + e1, y.speed === e1, y.speed); y.faster(); T('10c ... the second press follows the normal cycle', y.speed === (e1 === 0.5 ? 1 : 2.5), y.speed); }
  { const x = game(1e6).co; T('10d a NEW game has no pending first press (starts at x1 and cycles normally)', x.speed === 0.5 && (x.faster(), x.speed === 1)); }
  { const c2 = g(); c2.setSpeed(10); c2.pause(); c2.resume(); T('11 pause / play keeps an old speed as it is (not an official press)', c2.speed === 10); c2.cycleSpeed(); T('11b the first speed press after that goes to x1', c2.speed === 0.5); }
}
/* the clock: official speed N advances exactly N game hours per real second (same formula the lab uses) */
for (const label of [1, 2, 5]) { const gm = game(1e6), co = gm.co; co.setSpeed(co.speedOfHps(label)); let left = 60; const dt = EC.TIME.tickMs / 1000;
  while (left > 1e-9) { co.run(dt * (24 / EC.TIME.dayRealSeconds) * co.speed); left -= dt; }
  T('12 x' + label + ': 60 real seconds give ' + 60 * label + ' game hours (got ' + co.hours + ')', Math.abs(co.hours - 60 * label) <= 1.0001, co.hours); }
/* old save: the stored speed is read back unchanged (setSpeed is not used by fromJSON) */
{ const a = game(1e6).co; a.setSpeed(5); const j = a.toJSON(), b = game(1e6).co; b.fromJSON(JSON.parse(JSON.stringify(j))); for (const sv of [0.5, 1, 2, 5, 10, 0]) { const x = game(1e6).co; x.setSpeed(sv); const y = game(1e6).co; y.fromJSON(JSON.parse(JSON.stringify(x.toJSON()))); T('13a a save with speed ' + sv + ' loads with exactly that speed', y.speed === sv && (sv === 0 || y.lastSpeed === sv), [y.speed, y.lastSpeed]); }
  { const x = game(1e6).co, d = JSON.parse(JSON.stringify(x.toJSON())); delete d.speed; delete d.lastSpeed; const y = game(1e6).co; y.fromJSON(d); T('13b a save with no speed field starts at x1', y.speed === 0.5, y.speed); }
  T('13 a save with speed 5 loads with speed 5 (same rate as before)', b.speed === 5 && b.lastSpeed === 5);
  const old = JSON.parse(JSON.stringify(j)); T('14 the only new save field is speedRef = 1 (a marker; older versions ignore it)', old.speedRef === 1 && !('speedUnit' in old)); }
/* pacing when the device is behind the chosen speed (timing only: every game hour is still computed in full and in order) */
{ const TT = EC.TIME; T('15 behind-the-speed pacing: bigger slice and share than the normal live pacing, same for the moving / still map', TT.behindHours > 0 && TT.behindBudgetMs > TT.liveBudgetMs && TT.behindBudgetStillMs > TT.liveBudgetStillMs && TT.behindShare > TT.liveShare && TT.behindShareStill > TT.liveShareStill && TT.behindShareStill < 1 && TT.behindHours < TT.liveBacklogHours, TT); }
console.log(fail ? '\nSPEED DEFINITION TESTS FAILED (' + fail + ')' : '\nSPEED DEFINITION TESTS PASSED (' + pass + ' checks)'); process.exit(fail ? 1 : 0);
