/* Phase A: wrapper edge cases on a tiny fake game: `this`, arguments (fewer and more than declared), return values, exceptions, generator protocol (next/return/throw), install/remove restores the originals. */
const path = require('path'), ROOT = process.env.ROOT || path.join(__dirname, '../../..'); global.window = global; global.document = { addEventListener() { }, createElement() { return { style: {}, setAttribute() { }, appendChild() { }, querySelector() { return null; }, addEventListener() { } }; }, body: { appendChild() { } } };
const si = global.setInterval; global.setInterval = () => 0; require(path.join(ROOT, 'live-diag.js')); global.setInterval = si; const PA = window.OliLiveDiag.pa; let fail = 0; const T = (n, c) => { console.log((c ? '  ok  ' : 'FAIL ') + n); if (!c) fail++; };
class Sim { constructor() { this.tag = 's'; } offer(a, b, c) { return [this.tag, a, b, c, arguments.length]; } }       // reads `arguments` -> must take the slow path
class Store { tick() { return 1; } } class Market { _engineTick() { } } class Net { }
class Co { constructor() { this.sim = new Sim(); this.store = new Store(); this.market = new Market(); this.net = new Net(); this.tag = 'c'; this.hours = 0; this.dayIdx = 0; }
  echo(a, b, c, d) { return [this.tag, a, b, c, d, arguments.length]; } plain(a, b) { return [this.tag, a, b]; } boom(m) { throw new TypeError(m); } sync() { return this.plain(1, 2); }
  *_tickGen(h, sl) { const out = []; out.push(this.echo(1, 2), this.plain(1), this.sim.offer('x')); try { this.boom('inside'); } catch (e) { out.push(e instanceof TypeError && e.message); } yield out.length; try { yield 'second'; } finally { this.closed = true; } this.hours += h; return out; } }
const before = { echo: Co.prototype.echo, plain: Co.prototype.plain, offer: Sim.prototype.offer, tg: Co.prototype._tickGen }; const co = new Co(), L = { company: co, store: co.store, sim: co.sim };
const ref = (() => { const c = new Co(), g = c._tickGen(1, true); return [g.next().value, g.next().value, g.next()]; })();
for (const mode of ['count', 't1', 't2all']) { const cfg = mode === 'count' ? PA.cfg.count() : mode === 't1' ? PA.cfg.t1() : PA.cfg.t2(new Map([['Company.echo', 1], ['Company.plain', 1], ['Company.boom', 1], ['Sim.offer', 1], ['Company.sync', 1]]), 1e9);
  const inst = PA.install(L, cfg), c = new Co(); c.sim = new Sim(); L.company = c; const g = c._tickGen(1, true), r1 = g.next(), r2 = g.next(), r3 = g.next();
  T(mode + ': generator yields/returns the same values', JSON.stringify([r1.value, r2.value, r3]) === JSON.stringify(ref)); const bare = c.echo('a');
  T(mode + ': outside an hour: this/arguments/return untouched (extra and missing args)', JSON.stringify(bare) === JSON.stringify(['c', 'a', undefined, undefined, undefined, 1]) && JSON.stringify(c.echo(1, 2, 3, 4, 5)) === JSON.stringify(['c', 1, 2, 3, 4, 5]));
  let thrown = null; try { c.boom('x'); } catch (e) { thrown = e; } T(mode + ': exception passes through unchanged', thrown instanceof TypeError && thrown.message === 'x');
  const g2 = c._tickGen(1, true); g2.next(); g2.next(); const rr = g2.return('stop'); T(mode + ': generator return() closes it (finally ran) and keeps the value', rr.done === true && rr.value === 'stop' && c.closed === true);
  const g3 = c._tickGen(1, true); g3.next(); let t3 = null; try { g3.throw(new RangeError('t')); } catch (e) { t3 = e; } T(mode + ': generator throw() propagates', t3 instanceof RangeError);
  T(mode + ': wrapped during', Co.prototype.echo !== before.echo || mode === 't1' && Co.prototype._tickGen !== before.tg); inst.remove(); L.company = co;
  T(mode + ': originals restored', Co.prototype.echo === before.echo && Co.prototype.plain === before.plain && Sim.prototype.offer === before.offer && Co.prototype._tickGen === before.tg); }
console.log(fail ? 'FAILED ' + fail : 'ALL OK'); process.exit(fail ? 1 : 0);
