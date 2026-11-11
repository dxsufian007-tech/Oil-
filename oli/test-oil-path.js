/* Phase 1 of the oil system work: crude really travels from the wells to the refinery, with no invented stock and no shortcut around the pipes.
 *   NODE_PATH=/opt/npm-tools/node_modules node oli/test-oil-path.js
 * Every building and every pipe is placed with the same functions the game uses (store.place, layPipe); the numbers are read from the simulation hour by hour. */
const { B, I, E, EC, game, put, pipe, chain } = require('./test-economy-helpers.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol) * Math.max(1, Math.abs(a), Math.abs(b));
const stockUp = co => { for (const [m, q] of [['CHEM', 20000], ['OPS', 5000], ['PARTS', 200]]) { const r = co.buy(m, q, 'A', 'CASH'); if (!r.ok) throw new Error('stock ' + m + ' ' + r.reason); } };
const prep = (nWells, mats, cfg) => { const g = game(500e6, cfg), c = chain(g, true, true); for (const w of c.wells.slice(nWells)) { g.store.demolish(w.id, { building: true, pipes: true, pipeSet: g.net }); } c.wells = c.wells.slice(0, nWells); for (const b of g.store.list()) g.sim.ensure(b); if (mats !== false) stockUp(g.co); return Object.assign(g, { c }); };
/* run `hours` one at a time and add up the flow (bbl/day -> bbl per hour) at every stage */
const run = (g, hours) => { const c = g.c, t = { wells: 0, sepIn: 0, sepOut: 0, ctIn: 0, ctOut: 0, refIn: 0 }, v0 = c.ct.s.vol || 0, tot0 = c.ct.s.total || 0; for (let h = 0; h < hours; h++) { g.co.advanceHours(1); t.wells += c.wells.reduce((a, w) => a + (w.s._out || 0), 0) / 24; t.sepIn += (c.sep.s._in || 0) / 24; t.ctIn += (c.ct.s._in || 0) / 24; t.ctOut += (c.ct.s._out || 0) / 24; t.refIn += (c.ref.s._in || 0) / 24; } t.v0 = v0; t.v1 = c.ct.s.vol || 0; t.rcv = (c.ct.s.total || 0) - tot0; return t; };

console.log('1. the whole chain moves crude, hour by hour');
{ const g = prep(3), t = run(g, 240);
  T('1a the wells produce', t.wells > 0, t.wells);
  T('1b the separator receives what the wells produce (through the junction, the pump and the pipes)', near(t.sepIn, t.wells, 0.02), [t.sepIn, t.wells]);
  T('1c the crude tank receives oil from the separator, never more than it was given (the water is taken out)', t.ctIn > 0 && t.ctIn <= t.sepIn + 1e-6, [t.ctIn, t.sepIn]);
  T('1d the refinery takes crude out of the tank, not out of thin air: refinery intake = tank outflow', near(t.refIn, t.ctOut, 0.01) && t.refIn > 0, [t.refIn, t.ctOut]);
  T('1e tank balance: volume now = volume before + what the tank really received - what the refinery took', near(t.v1, t.v0 + t.rcv - t.ctOut, 0.002), [t.v1, t.v0, t.rcv, t.ctOut]);
  T('1e2 the displayed inflow rate matches what the tank received (within 1%)', near(t.rcv, t.ctIn, 0.01), [t.rcv, t.ctIn]);
  T('1f the refinery never consumed more crude than ever arrived', t.refIn <= t.ctIn + t.v0 + 1e-6);
  T('1g the books agree with the tank: crude in stock = crude in the tank', near(g.co.qty.CRUDE, g.c.ct.s.vol, 0.01), [g.co.qty.CRUDE, g.c.ct.s.vol]);
  T('1h the refinery turned it into products and nothing went missing', g.co.audit().ok && g.co.crudeShort === 0 && g.c.tg.s.vol > 0 && g.c.td.s.vol > 0, g.co.audit());
  T('1i every stage reports RUNNING', [g.c.wells[0], g.c.jn, g.c.pump, g.c.sep, g.c.ct, g.c.ref].every(b => g.sim.status(b) === 'RUNNING'), [g.c.jn, g.c.pump, g.c.sep, g.c.ct, g.c.ref].map(b => g.sim.status(b))); }

console.log('2. different field sizes (1 well and 3 wells)');
{ const one = prep(1), three = prep(3), a = run(one, 120), b = run(three, 120);
  T('2a one well feeds the refinery', a.refIn > 0 && a.wells > 0, a);
  T('2b three wells deliver more, in proportion to what the wells produce (the wells differ in output)', b.refIn > 1.5 * a.refIn && near(b.refIn / b.wells, a.refIn / a.wells, 0.05), [a.refIn / a.wells, b.refIn / b.wells, a.refIn, b.refIn]); }

console.log('3. (changed) no wear and no breakdowns: a pump never stops by itself, a leftover damaged state from an old save is cleared');
{ const g = prep(3); run(g, 24); const pump = g.c.pump;
  const t = run(g, 24 * 5);
  T('3a the pump keeps working: oil reaches the separator and the refinery', t.sepIn > 0 && t.refIn > 0 && pump.c === 1 && pump.st !== 'DAMAGED', t);
  T('3b the refinery runs and the company has no broken-building alert', g.sim.status(g.c.ref) === 'RUNNING' && g.sim.status(pump) !== 'DAMAGED' && !g.co.alerts().some(a => a.key === 'broken'), [g.sim.status(g.c.ref), g.sim.status(pump)]);
  const r = g.co.repair(pump.id); T('3c the repair call is free (nothing to repair)', r.ok && r.cost === 0 && pump.c === 1, r);
  const t2 = run(g, 24); T('3d oil still flows to the refinery', t2.sepIn > 0 && t2.refIn > 0 && g.sim.status(g.c.ref) === 'RUNNING', t2);
  T('3e no broken warning ever appears', !g.co.alerts().some(a => a.key === 'broken')); }

{ const g = prep(3); run(g, 24); g.c.pump.c = 0; g.c.pump.st = 'DAMAGED'; g.co.fromJSON(JSON.parse(JSON.stringify(g.co.toJSON()))); const t = run(g, 24);
  T('3f a save with a damaged pump: the state is cleared on load and the oil keeps coming', g.c.pump.st !== 'DAMAGED' && g.c.pump.c === 1 && t.refIn > 0, [g.c.pump.st, t]); }

console.log('4. (changed) maintenance needs no spare parts from the player: it is an automatic running cost, never blocks work, no alert');
{ const g = prep(3, false); for (const [m, q] of [['CHEM', 20000], ['OPS', 5000]]) g.co.buy(m, q, 'A', 'CASH'); run(g, 24);
  const m0 = g.co.led.life.maintenance; g.co.advanceHours(24 * 3);
  T('4a with no spare parts in stock the pump keeps working and maintenance is still charged', g.c.pump.c === 1 && g.c.pump.st !== 'DAMAGED' && g.co.led.life.maintenance > m0);
  T('4b there is no spare-part / repair alert', !g.co.alerts().some(a => a.key === 'noparts' || a.key === 'broken'), g.co.alerts());
  T('4c the repair call stays harmless', g.co.repair(g.c.pump.id).ok && g.c.pump.c === 1);
  T('4d and no alert about it', !g.co.alerts().some(a => a.key === 'noparts')); }

console.log('5. (old rule, MATERIALS_REQUIRED = true) a refinery with no chemicals / operating materials refuses crude and says so');
{ const g = prep(3, false, Object.assign({}, EC, { MATERIALS_REQUIRED: true })), t0 = run(g, 48);   // the old rule (still an option)
  T('5a oil reaches the refinery but it takes none', t0.ctIn > 0 && t0.refIn === 0, t0);
  T('5b the status says it lacks materials, not that no oil reaches it', g.sim.status(g.c.ref) === 'NO_MATERIALS', g.sim.status(g.c.ref));
  T('5c the company is warned', g.co.alerts().some(a => a.key === 'nomat'));
  stockUp(g.co); const t1 = run(g, 24);
  T('5d after buying them the refinery runs and uses the oil waiting in the tank', t1.refIn > 0 && ['RUNNING', 'OVER_CAPACITY'].includes(g.sim.status(g.c.ref)), [t1, g.sim.status(g.c.ref)]);   /* with oil waiting in the tank the refinery works at its full capacity */
  T('5e the warning is gone', !g.co.alerts().some(a => a.key === 'nomat')); }

console.log('6. a narrow pipe limits the flow (nothing bypasses the pipes)');
{ const g = game(500e6), c = {}; c.wells = [put(g, 'oil_well', 20, 36), put(g, 'oil_well', 20, 40), put(g, 'oil_well', 20, 44)]; c.jn = put(g, 'junction', 28, 40); c.pump = put(g, 'pump_station_l', 34, 40); c.sep = put(g, 'separator', 50, 38); c.ct = put(g, 'crude_tank_m', 68, 36); c.ref = put(g, 'refinery_s', 86, 36);
  const L = []; ['PORT_N', 'PORT_W', 'PORT_S'].forEach((p, i) => L.push(pipe(g, c.wells[i], 'OIL_OUT_E', c.jn, p))); L.push(pipe(g, c.jn, 'PORT_E', c.pump, 'INPUT'), pipe(g, c.pump, 'OUTPUT', c.sep, 'MIXTURE_IN'), pipe(g, c.sep, 'OIL_OUT', c.ct, 'INPUT_W'));
  const narrow = pipe(g, c.ct, 'OUTPUT_E', c.ref, 'CRUDE_IN', 4); for (const b of g.store.list()) g.sim.ensure(b); stockUp(g.co); g.c = c;
  const t = run(g, 120); const wide = prep(3), tw = run(wide, 120);
  T('6a the narrow pipe delivers less than a normal one (the pipe really limits the flow)', t.refIn < tw.refIn, [t.refIn, tw.refIn]);
  T('6b the rest stays in the tank instead of vanishing', t.ctIn - t.ctOut > 0 && near(t.v1, t.v0 + t.ctIn - t.ctOut, 0.01), t); }

console.log('\nOIL PATH TESTS: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
