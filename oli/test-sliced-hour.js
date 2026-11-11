/* Oli - test-sliced-hour.js  (an hour spread over many frames is bit-for-bit the hour computed at once; settle() and the guards around it)
 *   node test-sliced-hour.js
 */
const { execFileSync } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oli-slice-')), run = (env, args) => execFileSync(process.execPath, [path.join(__dirname, 'econ-compare.js'), ...args], { env: Object.assign({}, process.env, env), encoding: 'utf8' });
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('ok ' + m); };
for (const [scen, hours] of [['flat:400', 72], ['central', 48]]) {
  const a = path.join(dir, 'a.json'), b = path.join(dir, 'b.json'); run({}, [__dirname, scen, String(hours), a]); const out = run({ SLICED: '1' }, [__dirname, scen, String(hours), b]);
  let diff = ''; try { diff = run({}, ['--diff', a, b]); } catch (e) { diff = String(e.stdout || e.message); }
  ok(/^IDENTICAL/.test(diff), scen + ' ' + hours + ' h: every hour in the smallest slices, with screen reads while the hour is open = the hours run at once (' + diff.trim().split('\n')[0] + '; ' + (out.match(/slices \d+/) || [''])[0] + ')');
}
{ // settle(), toJSON(), advanceHours() and a pause never leave half an hour behind
  const { build } = require('./bench-full.js'), g = build(300), co = g.co; co.advanceHours(3); co.speed = 1;
  const h0 = co.hours; co.run(1, 1e-9); ok(co.midHour && co.hours === h0, 'run() with a tiny budget leaves the hour open (not yet counted)');
  co.settle(); ok(!co.midHour && co.hours === h0 + 1, 'settle() finishes the open hour');
  co.run(1, 1e-9); const j = co.toJSON(); ok(!co.midHour && j.hours === h0 + 2, 'a save finishes the open hour first (a save never holds half an hour)');
  co.run(1, 1e-9); co.advanceHours(1); ok(!co.midHour && co.hours === h0 + 4, 'advanceHours() finishes the open hour, then runs its own');
  co.run(1, 1e-9); co.speed = 0; co.run(1, 30); ok(!co.midHour && co.hours === h0 + 5, 'pausing finishes the open hour (a paused game shows whole hours)');
  co.speed = 1; co.run(1, 1e-9); co.fromJSON(co.toJSON()); ok(!co.midHour, 'loading drops nothing half-done');
  ok(co.audit().ok, 'books balance after all of it');
}
console.log('SLICED HOUR TESTS PASSED (' + n + ' checks)');
