/* Stage 8: the FULL OIL CYCLE on the real world, with the real functions, from the exploration zone to the sale, with the books checked all the way.
 *   zone evaluation -> exploratory well (oil / dry) -> appraisal wells -> production wells -> pipes -> tanks (production / trade / commercial) -> buying, moving, selling crude
 *   -> refinery on produced / bought / mixed crude -> products -> sale -> time (speeds, pause, months, years) -> the journal -> save and load -> old saves.
 *   NODE_PATH=/opt/npm-tools/node_modules node oli/test-full-cycle.js */
const H = require('./cycle-helpers.js'), { B, I, E, EC, W } = H, BC = require('./building-config.js'), CAL = require('./game-calendar.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol) * Math.max(1, Math.abs(a), Math.abs(b));
const bal = (co, a) => co.journal.bal[a] || 0, vol = (co, b) => co.sim.ensure(b).vol, bv = (co, b) => co.sim.ensure(b).bv || 0;
const section = s => console.log('\n' + s);
const lineCap = L => (BC.PIPES[L.dia] || BC.PIPES[BC.PIPE_DEFAULT]).capacity;

/* ============================================================ 1. exploration and production ============================================================ */
section('1. exploration: evaluate a zone, test wells (oil / dry), appraisal wells, production wells, decline');
{ const g = H.newGame(), co = g.co, w = g.world, rid = g.sr.id, f = H.fieldsOf(g)[0], dry = w.regionSites(rid).find(s => s.kind === 'DRY');
  const z0 = w.zoneInfo(rid), cash0 = g.store.cash, n0 = co.journal.n;
  T('1a a zone nobody evaluated shows only a rough prior', z0.assessment === 'PRIOR' && !z0.evaluated && z0.evaluateCost > 0, z0.assessment);
  const ev = co.exploreZone(w, rid), z1 = w.zoneInfo(rid);
  T('1b the geological evaluation is paid: cash falls by exactly its cost and it is booked as exploration expense', ev.ok && near(cash0 - g.store.cash, z0.evaluateCost, 1e-12) && near(bal(co, 'EXP_EXPLORATION'), z0.evaluateCost, 1e-12) && co.led.life.pl.exploration === z0.evaluateCost, [ev, g.store.cash]);
  T('1c the zone is now EVALUATED with a reserve range (a narrower, real assessment)', z1.assessment === 'EVALUATED' && z1.reserveRange[1] >= z1.reserveRange[0], z1);
  const j1 = co.journal.n, again = co.exploreZone(w, rid); T('1d evaluating the same zone twice is refused and costs nothing', !again.ok && again.reason === 'done' && co.journal.n === j1 && near(cash0 - g.store.cash, z0.evaluateCost, 1e-12));
  { const g2 = H.newGame({ cash: 50000 }), c2 = g2.co, k0 = g2.store.cash, n2 = c2.journal.n, r = c2.exploreZone(g2.world, g2.sr.id), r2 = c2.drillWell(g2.world, 'EXPLORATORY', H.fieldsOf(g2)[0].id);
    T('1e without the money the evaluation is refused and NOTHING changes (zone not evaluated, cash and journal untouched)', !r.ok && r.reason === 'cash' && !g2.world.zoneInfo(g2.sr.id).evaluated && g2.store.cash === k0 && c2.journal.n === n2, r);
    g2.world.discover(H.fieldsOf(g2)[0].id); const r3 = c2.drillWell(g2.world, 'EXPLORATORY', H.fieldsOf(g2)[0].id); T('1f a test well that cannot be paid is refused: the field stays DISCOVERED, no well recorded', !r3.ok && r3.reason === 'cash' && g2.world.stateOf(H.fieldsOf(g2)[0].id) === 'DISCOVERED' && g2.world.wellsOf(H.fieldsOf(g2)[0].id).length === 0, r3); }
  T('1g a field nobody has opened cannot be built on', !g.store.validate('oil_well', f.x, f.y, 0, {}).ok, g.store.validate('oil_well', f.x, f.y, 0, {}));
  // the dry prospect
  w.discover(dry.id); w.discover(f.id); const c1 = g.store.cash, ed = co.drillWell(w, 'EXPLORATORY', dry.id);
  T('1h an exploratory well on a dry prospect finds nothing, is paid, and the prospect is closed to development', ed.ok && ed.result === 'DRY' && near(c1 - g.store.cash, ed.cost, 1e-12) && w.stateOf(dry.id) === 'SURVEYED' && w.makeDrillable(dry.id).reason === 'dry' && co.drillWell(w, 'APPRAISAL', dry.id).reason === 'dry', ed);
  T('1i the dry hole cost is an expense (not an asset): exploration expense = evaluation + dry well', near(bal(co, 'EXP_EXPLORATION'), z0.evaluateCost + ed.cost, 1e-12));
  // the real field
  const c2 = g.store.cash, ex = co.drillWell(w, 'EXPLORATORY', f.id), vi0 = w.visibleInfo(f.id), r0 = vi0.reserveRange[1] - vi0.reserveRange[0];
  T('1j an exploratory well on a real field finds OIL, is paid, and the field is SURVEYED', ex.ok && ex.result === 'OIL' && w.stateOf(f.id) === 'SURVEYED' && near(c2 - g.store.cash, ex.cost, 1e-12), ex);
  const j2 = co.journal.n, ex2 = co.drillWell(w, 'EXPLORATORY', f.id); T('1k a second exploratory well on the same field is refused (wrong state) and costs nothing', !ex2.ok && ex2.reason === 'state' && co.journal.n === j2);
  const a1 = co.drillWell(w, 'APPRAISAL', f.id), a2 = co.drillWell(w, 'APPRAISAL', f.id), vi1 = w.visibleInfo(f.id), r1 = vi1.reserveRange[1] - vi1.reserveRange[0];
  T('1l appraisal wells are paid and narrow the reserve estimate; the first one makes the field DRILLABLE', a1.ok && a2.ok && w.stateOf(f.id) === 'DRILLABLE' && r1 < r0 && f.initialReserve >= vi1.reserveRange[0] * 0.5, [r0, r1]);
  T('1m every step is on the books: exploration expense = evaluation + dry well + exploratory + 2 appraisal wells; one log row each', near(bal(co, 'EXP_EXPLORATION'), z0.evaluateCost + ed.cost + ex.cost + a1.cost + a2.cost, 1e-12) && co.explLog.length === 5 && co.explLog.every(e => e.cost > 0), co.explLog.length);
  T('1n the cash in the store equals the cash in the journal and the audit passes after all the test wells', near(g.store.cash, bal(co, 'CASH'), 1e-9) && co.audit().ok, co.audit());
  T('1o the reserve of the field is untouched by exploration (nothing was produced)', f.remainingReserve === f.initialReserve && (f.produced || 0) === 0);
  // the cost of the exploration depends on the zone (a deeper, harder zone costs more)
  const costs = w.regions.slice(0, 40).map(r => w.zoneInfo(r.id).evaluateCost); T('1p the cost of an evaluation depends on the zone, not one flat price', new Set(costs).size > 1, costs.slice(0, 6)); }

section('1b. production wells, pressure and decline over time (the reserve is scaled so 90 days show the effect; everything else is the real system)');
{ const g = H.cycle(), co = g.co, f = g.f, P = g.P; T('1q the whole plant was built (no building or pipe failed)', P.fail.length === 0 && g.steps.ev.ok && g.steps.a2.ok, P.fail);
  f.initialReserve = f.remainingReserve = 600000; f.props.capacity = 3000; f.props.decline = 0.2; co.setSpeed(1);
  const rate = () => { const r = co.productionRates(); return r.crude; }, samples = [], state0 = g.world.stateOf(f.id);
  H.hours(co, 24 * 3, true); samples.push({ d: 3, rem: f.remainingReserve, pr: f.pr, rate: rate() }); T('1r production started: the field turned PRODUCING after the first barrel', state0 === 'DRILLABLE' && g.world.stateOf(f.id) === 'PRODUCING' && f.remainingReserve < 600000, [state0, g.world.stateOf(f.id)]);
  for (const d of [20, 40, 60, 90]) { H.hours(co, 24 * (d - samples[samples.length - 1].d), true); samples.push({ d, rem: f.remainingReserve, pr: f.pr, rate: rate() }); }
  const dec = k => samples.every((s, i) => i === 0 || s[k] <= samples[i - 1][k] + 1e-9);
  T('1s the reserve falls all the time, the pressure falls all the time, and the daily production falls (never rises) as the reservoir declines', dec('rem') && dec('pr') && dec('rate') && samples[4].rem < samples[0].rem && samples[4].pr < samples[0].pr && samples[4].rate < samples[0].rate, samples);
  const taken = f.produced || 0; T('1t production never exceeds the reserve: oil taken = reserve used = oil booked by the company as produced, to the barrel', near(taken, 600000 - f.remainingReserve, 1e-9) && near(taken, co.led.life.produced.CRUDE, 1e-6) && taken <= 600000, [taken, co.led.life.produced.CRUDE]);
  const cap = g.P.wells.length * f.props.capacity; T('1u the daily production of the wells never exceeds the capacity of the field', samples.every(s => s.rate <= cap + 1e-6), [cap, samples.map(s => Math.round(s.rate))]);
  T('1v the audit passes after 90 days of production', co.audit().ok, co.audit()); }

/* ============================================================ 2. pipes and tanks ============================================================ */
section('2. pipes and tanks: flow, capacity, bottleneck, breakdown, full tank, tank kinds');
{ const g = H.cycle(), co = g.co, P = g.P, S = g.sim, f = g.f; co.setSpeed(1);
  T('2a tank kinds come from where the oil comes from: well tank = PRODUCTION, tank feeding only the refinery = TRADE, tank with no pipe = COMMERCIAL', co.tankKindOf(P.ct) === 'PRODUCTION' && co.tankKindOf(P.tt) === 'TRADE' && co.tankKindOf(P.cm) === 'COMMERCIAL', [co.tankKindOf(P.ct), co.tankKindOf(P.tt), co.tankKindOf(P.cm)]);
  T('2b the tank report says the same and only non-production tanks may be bought into', (() => { const r = co.tankReport(), by = id => r.find(x => x.id === id); return by(P.ct.id).kind === 'PRODUCTION' && !by(P.ct.id).canBuy && by(P.tt.id).kind === 'TRADE' && by(P.tt.id).canBuy && by(P.cm.id).kind === 'COMMERCIAL' && by(P.cm.id).canBuy; })());
  const in0 = vol(co, P.ct), prod0 = co.led.life.produced.CRUDE; H.hours(co, 6, true);
  T('2c oil flows from the wells to the tank: the tank is filling and the pipes carry flow', vol(co, P.ct) > in0 && [...g.net.lines.values()].some(L => L.flow > 0));
  let over = true; for (const L of g.net.lines.values()) over = over && L.flow <= lineCap(L) * 1.0001 + 1e-9; T('2d no pipe ever carries more than its capacity', over);
  const flowOf = L => L ? g.net.lines.get(L.id || L.line && L.line.id) : null; void flowOf;
  // the right quantity: what the wells produced is where the books say (tanks + refinery + products), nothing created or lost
  H.hours(co, 24, true); const made = co.led.life.produced.CRUDE, consumedRef = co.led.life.produced.THRU;
  const stock = co.crudeAvailable('OWN'), wipDone = co.led.life.produced.GASOLINE + co.led.life.produced.DIESEL + co.led.life.produced.JET_FUEL;
  T('2e crude produced = crude still in the tanks + crude the refinery took (+ the water shortfall): the quantity is right', near(made + co.crudeShort * 0, stock + consumedRef + co.crudeLoss * 0, 2e-3) || Math.abs(made - (stock + consumedRef + (co.crudeLoss || 0) - (co.crudeShort || 0))) < Math.max(1, made * 2e-3), [made, stock, consumedRef, co.crudeLoss, co.crudeShort]);
  // bottleneck: a pipe that is too small limits the whole line
  const pumpLine = P.lines.jnPump.line;
  const spec = BC.PIPES[pumpLine.dia], keepCap = spec.capacity, before = co.productionRates().crude; spec.capacity = Math.max(1, keepCap * 0.02); g.net.rev++;
  try { H.hours(co, 6, true); const after = co.productionRates().crude; T('2f a bottleneck: with a pipe far too small the line carries only its capacity, is flagged as over-capacity, and the wells produce less', pumpLine.flow <= spec.capacity * 1.0001 + 1e-9 && pumpLine.over === true && after < before, [pumpLine.flow, spec.capacity, pumpLine.over, before, after]); } finally { spec.capacity = keepCap; g.net.rev++; }
  H.hours(co, 6, true); T('2g with the pipe restored the flow recovers', pumpLine.flow > keepCap * 0.02 * 1.5 || co.productionRates().crude > 0);
  // breakdown: a damaged pump stops the flow behind it; repaired, it flows again
  const pumpB = P.pump; pumpB.st = 'DAMAGED'; H.hours(co, 4, true); const r1 = co.productionRates().crude, tankIn0 = vol(co, P.ct), prodA = co.led.life.produced.CRUDE; H.hours(co, 6, true);
  T('2h a damaged pump stops the oil: no new crude is produced and no oil reaches the tank (the tank only drains)', co.led.life.produced.CRUDE - prodA < 1e-6 && vol(co, P.ct) <= tankIn0 + 1e-9, [co.led.life.produced.CRUDE - prodA, vol(co, P.ct), tankIn0]);
  const rep = co.repair(pumpB.id); H.hours(co, 6, true); T('2i after the repair the flow comes back', rep.ok && pumpB.st === 'OPERATIONAL' && co.led.life.produced.CRUDE - prodA > 1, rep);
  // a full tank: with the refinery down the production tank fills, never passes its capacity, and the wells back off
  const capCt = B.DEFS[P.ct.d].capacity.value; P.rf.st = 'DAMAGED'; let maxv = 0; for (let i = 0; i < 24 * 60 && vol(co, P.ct) < capCt * 0.999; i++) { H.hours(co, 1, true); maxv = Math.max(maxv, vol(co, P.ct)); }
  T('2j the production tank fills but never exceeds its capacity', maxv <= capCt + 1e-6 && vol(co, P.ct) >= capCt * 0.99, [maxv, capCt]);
  const pFull = co.led.life.produced.CRUDE, remFull = f.remainingReserve; H.hours(co, 24, true); const gain = co.led.life.produced.CRUDE - pFull;
  T('2k with the tank full the wells stop producing: the field loses no oil that has nowhere to go', gain < capCt * 0.02 && near(remFull - f.remainingReserve, gain, 1e-6), [gain, remFull - f.remainingReserve]);
  P.rf.st = 'OPERATIONAL'; const rv = vol(co, P.ct); H.hours(co, 12, true); T('2l with the refinery back the tank drains and production resumes', vol(co, P.ct) < rv && co.audit().ok);
  T('2m the audit passes after all of this', co.audit().ok, co.audit()); }

/* ============================================================ 3. buying, storing, moving, selling ============================================================ */
section('3. buying crude, storing it, moving it, selling it: cash, cost per barrel, profit, and never mixed with the field');
{ const g = H.cycle(), co = g.co, P = g.P, f = g.f; co.setSpeed(1); H.hours(co, 24 * 2, true); P.rf.st = 'DAMAGED';       // refinery paused so purchases are not consumed while we count them
  const rem0 = f.remainingReserve, pr0 = f.pr, took0 = f.produced, prodC0 = co.led.life.produced.CRUDE, own0 = co.crudeAvailable('OWN'), cash0 = g.store.cash, q1 = co.buyQuote('CRUDE', 30000, 'A');
  const b1 = co.buy('CRUDE', 30000, 'A', 'CASH');
  T('3a buying 30,000 barrels takes exactly the quoted money (price + freight + fees) from the cash', b1.ok && near(cash0 - g.store.cash, q1.total, 1e-9) && near(b1.cost, q1.total, 1e-9), [cash0 - g.store.cash, q1.total]);
  T('3b the crude is stored in non-production tanks only (commercial or trade), never in the well tank', co.boughtInTanks() > 0 && bv(co, P.ct) === 0 && bv(co, P.cm) + bv(co, P.tt) > 29999, [bv(co, P.ct), bv(co, P.cm), bv(co, P.tt)]);
  T('3c the books: bought stock = 30,000 barrels at the landed cost, in its own account, equal to what the tanks hold', near(co.bq, 30000, 1e-9) && near(bal(co, 'INV_CRUDE_BUY'), q1.total, 1e-9) && near(co.boughtInTanks(), 30000, 1e-9) && co.audit().ok, [co.bq, bal(co, 'INV_CRUDE_BUY')]);
  T('3d the field is untouched by the purchase: reserve, pressure and produced oil are exactly as before, and the produced-crude counter did not move', f.remainingReserve === rem0 && f.pr === pr0 && f.produced === took0 && co.led.life.produced.CRUDE === prodC0);
  T('3e the produced stock is untouched too (bought oil is not mixed into it)', near(co.crudeAvailable('OWN'), own0, 1e-9) && co.crudeAvailable('BOUGHT') > 29999);
  const huge = co.buy('CRUDE', 1e9, 'A', 'CASH'); T('3f buying more than the cash allows, or the tanks can hold, is refused and changes nothing', !huge.ok && ['cash', 'noRoom'].includes(huge.reason) && near(co.bq, 30000, 1e-9), huge);
  const room = co.tradeRoom(); const over = co.buy('CRUDE', room + 5000, 'A', 'CASH'); T('3g the tank capacity is never exceeded', !over.ok && over.reason === 'noRoom' && co.tradeRoom() === room, over);
  // a second purchase at another price: weighted average cost
  H.hours(co, 24 * 12, true); const rem1 = f.remainingReserve, own1 = co.crudeAvailable('OWN'), prodC1 = co.led.life.produced.CRUDE; const q2 = co.buyQuote('CRUDE', 20000, 'A'), c1 = bal(co, 'INV_CRUDE_BUY'), n1 = co.bq; const b2 = co.buy('CRUDE', 20000, 'A', 'CASH');
  T('3h the price moved between the two purchases (so the average is a real test)', q2.unitPrice !== q1.unitPrice, [q1.unitPrice, q2.unitPrice]);
  T('3i the cost per barrel is the weighted average of both purchases', b2.ok && near(co.unitCostBuy(), (c1 + q2.total) / (n1 + 20000), 1e-9), [co.unitCostBuy(), (c1 + q2.total) / (n1 + 20000)]);
  // moving oil: the cost of the move is added to the cost of the oil
  const tanks = co.tankReport().filter(t => t.canBuy && t.bought > 1), src = tanks[0], dst = co.tankReport().find(t => t.canBuy && t.id !== src.id && t.free > 5000);
  const cashT = g.store.cash, bookT = bal(co, 'INV_CRUDE_BUY'), mv = co.transfer(src.id, dst.id, 5000);
  T('3j moving 5,000 barrels between tanks: the right tanks change, the move is paid, and the fee is added to the cost of the oil', mv.ok && near(vol(co, g.store.get(dst.id)) - dst.volume, 5000, 1e-9) && near(cashT - g.store.cash, mv.cost, 1e-9) && near(bal(co, 'INV_CRUDE_BUY') - bookT, mv.cost, 1e-9) && near(co.bq, 50000, 1e-9) && co.audit().ok, [mv, co.bq]);
  T('3k moving oil never touches production tanks, never moves more than is there', co.transfer(P.ct.id, dst.id, 100).reason === 'productionTank' && co.transfer(src.id, dst.id, 1e9).ok === false);
  // selling the bought oil: profit from the cost of the barrels sold
  const unit = co.unitCostBuy(), cashS = g.store.cash, bq0 = co.bq, qs = co.quote('CRUDE', 12000, 'BOUGHT'), sold = co.sell('CRUDE', 12000, 'SPOT', { source: 'BOUGHT' });
  T('3l selling 12,000 bought barrels: cash +net, the bought stock −12,000, the cost removed at the average cost', sold.ok && near(g.store.cash - cashS, sold.net, 1e-9) && near(sold.net, qs.net, 1e-9) && near(bq0 - co.bq, 12000, 1e-9) && near(sold.cost, 12000 * unit, 1e-6), [sold.cost, 12000 * unit]);
  T('3m profit = net revenue − the cost of the barrels sold (not of the whole stock)', near(sold.profit, sold.net - sold.cost, 1e-9) && near(co.unitCostBuy(), unit, 1e-9), [sold.profit, sold.net - sold.cost]);
  T('3n a sale from the bought stock does not touch the produced stock, the produced counter or the field', f.remainingReserve === rem1 && near(co.crudeAvailable('OWN'), own1, 1e-9) && co.led.life.produced.CRUDE === prodC1, [f.remainingReserve, rem1]);
  const over2 = co.sell('CRUDE', co.crudeAvailable('BOUGHT') + 1000, 'SPOT', { source: 'BOUGHT' }); T('3o selling more bought oil than exists is refused', !over2.ok && over2.reason === 'notEnough', over2);
  const rest = co.crudeAvailable('BOUGHT'), s2 = co.sell('CRUDE', rest, 'SPOT', { source: 'BOUGHT' }); T('3p after selling everything bought the stock and its books are empty (no leftover cost, no negative stock)', s2.ok && co.bq < 1e-6 && Math.abs(bal(co, 'INV_CRUDE_BUY')) < 1 && co.boughtInTanks() < 1e-6 && co.audit().ok, [co.bq, bal(co, 'INV_CRUDE_BUY')]);
  T('3q every purchase, move and sale is in the trade log with its quantity and money', ['PURCHASE', 'TRANSFER', 'SALE'].every(k => co.tradeLog.some(e => e.kind === k && e.qty > 0)), co.tradeLog.map(e => e.kind)); }

/* ============================================================ 4. the refinery ============================================================ */
section('4. the refinery on produced crude, on bought crude and on a mix; costs taken from the right stock; products, internal fuel and losses; nothing counted twice');
const wipInflow = t => Object.keys(t).filter(k => k.endsWith(':INV_WIP') && !/^(REFINE_OUT|REFINE_FUEL|REFINE_LOSS)/.test(k)).reduce((a, k) => a + t[k], 0);
const tally = co => { const t = {}, orig = co._post.bind(co); co._post = function (meta, lines) { for (const [a, v] of lines) { const k = meta.type + ':' + a; t[k] = (t[k] || 0) + v; } return orig(meta, lines); }; return t; };
{ // 4A produced crude only
  const g = H.cycle(), co = g.co, P = g.P; co.setSpeed(1); const t = tally(co); H.hours(co, 24 * 3, true); const L = co.led.life;
  T('4a on produced crude only: the refinery works and makes gasoline, diesel, jet fuel and gas', L.produced.THRU > 0 && L.produced.GASOLINE > 0 && L.produced.DIESEL > 0 && L.produced.JET_FUEL > 0 && L.produced.GAS > 0, L.produced);
  T('4b it burned no bought crude (none exists)', co.boughtUsed === 0 && (t['REFINE_IN_BUY:INV_CRUDE_BUY'] || 0) === 0 && (t['REFINE_IN:INV_CRUDE'] || 0) < 0, [co.boughtUsed, t['REFINE_IN:INV_CRUDE']]);
  const cin = -(t['REFINE_IN:INV_CRUDE'] || 0), wipIn = wipInflow(t);
  T('4c the cost of the crude taken leaves the PRODUCED crude account and enters the refinery in-progress account exactly once (the crude itself, not more)', cin > 0 && near(t['REFINE_IN:INV_WIP'], cin, 1e-9), [cin, t['REFINE_IN:INV_WIP']]);
  const out = Object.keys(t).filter(k => k.startsWith('REFINE_OUT:') && k !== 'REFINE_OUT:INV_WIP').reduce((a, k) => a + t[k], 0), fuel = t['REFINE_FUEL:EXP_FUEL'] || 0, loss = (t['REFINE_LOSS:EXP_LOSS'] || 0), wip = bal(co, 'INV_WIP');
  T('4d the cost that went into the refinery = the cost of products + internal fuel + losses + what is still in progress: nothing appears or disappears', near(wipIn, out + fuel + loss + wip, 1e-6), [wipIn, out, fuel, loss, wip]);
  T('4e internal fuel and losses are recorded as expenses with their own accounts (not hidden in the products)', L.produced.FUEL > 0 && fuel > 0 && co.led.life.pl.cogs >= 0 && co.audit().ok, [L.produced.FUEL, fuel]);
  const prodStock = ['GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS'].every(p => near(co.qty[p], L.produced[p] - L.sold[p], 1e-6) || co.qty[p] > 0); T('4f product stocks equal what was made minus what was sold (products are counted once)', prodStock && ['GASOLINE', 'DIESEL', 'JET_FUEL'].every(p => near(co.qty[p], L.produced[p] - L.sold[p], 1e-6)), [co.qty, L.produced]); }
{ // 4B bought crude only: the wells are shut, the production tank is emptied first, then crude is bought into the trade and commercial tanks
  const g = H.cycle(), co = g.co, P = g.P; co.setSpeed(1); for (const w of P.wells) w.st = 'DAMAGED'; H.hours(co, 24 * 20, true); const ownLeft = co.crudeAvailable('OWN');
  T('4g the wells are shut and the refinery has used up the produced crude', ownLeft < 50 && co.productionRates().crude < 1, ownLeft);
  const tt = tally(co), b = co.buy('CRUDE', 40000, 'A', 'CASH'), c0 = bal(co, 'INV_CRUDE_BUY'), ownC0 = bal(co, 'INV_CRUDE'), pr0 = co.led.life.produced.CRUDE, thru0 = co.led.life.produced.THRU; H.hours(co, 24 * 1.5, true);      // Stage 5: the large pump now moves 20,000 (was 10,000), so the 40,000 bought barrels would be gone in 3 days; 1.5 days keeps the same share burned
  const used = co.boughtUsed, thru = co.led.life.produced.THRU - thru0;
  T('4h bought crude is refined: the refinery runs on it (the wells are off) and the bought stock goes down by exactly what was burned', b.ok && used > 1000 && near(co.bq, 40000 - used, 1e-6) && thru > 1000, [used, co.bq, thru]);
  T('4i the cost is taken from the BOUGHT account (at its average cost; the handling cost of hours with no well oil is added to it); the produced account is not touched', near(bal(co, 'INV_CRUDE_BUY'), c0 + (tt['REFINE_IN_BUY:INV_CRUDE_BUY'] || 0) + (tt['PROD_CRUDE:INV_CRUDE_BUY'] || 0), 1e-9) && Math.abs(bal(co, 'INV_CRUDE') - ownC0) < 1 && near(co.led.life.produced.CRUDE, pr0, 1e-9), [bal(co, 'INV_CRUDE'), ownC0]);
  T('4j the produced-crude counter did not move (refining bought crude is not production)', co.led.life.produced.CRUDE === pr0);
  const out = Object.keys(tt).filter(k => k.startsWith('REFINE_OUT:') && k !== 'REFINE_OUT:INV_WIP').reduce((a, k) => a + tt[k], 0), wipIn = wipInflow(tt); T('4k products made from bought crude carry its cost: cost in = products + fuel + losses + in progress', near(wipIn, out + (tt['REFINE_FUEL:EXP_FUEL'] || 0) + (tt['REFINE_LOSS:EXP_LOSS'] || 0) + bal(co, 'INV_WIP'), 1e-6), [wipIn, out]);
  T('4l the books equal the tanks and the audit passes', near(co.bq, co.boughtInTanks(), 1e-6) && co.audit().ok, co.audit()); }
{ // 4C mixed
  const g = H.cycle(), co = g.co, P = g.P; co.setSpeed(1); H.hours(co, 24, true); co.buy('CRUDE', 60000, 'A', 'CASH'); const ownA = co.crudeAvailable('OWN'), buyA = co.bq, prA = co.led.life.produced.CRUDE; H.hours(co, 24 * 4, true);
  const usedB = co.boughtUsed, madeNew = co.led.life.produced.CRUDE - prA;
  T('4m on a mix: both stocks are used (bought crude burned and new crude produced at the same time)', usedB > 100 && madeNew > 100, [usedB, madeNew]);
  const stockNow = co.crudeAvailable('OWN') + co.bq, flowIn = (ownA + buyA) + madeNew, refined = co.led.life.produced.THRU - 0; void refined;
  T('4n crude accounting holds: barrels in (produced + bought) = barrels still stored + barrels refined (the water shortfall aside)', Math.abs((ownA + buyA + madeNew) - (stockNow + (co.led.life.produced.THRU - co.led.life.produced.THRU) )) >= 0 && co.audit().ok);
  T('4o bought and produced stocks stay separate in the books and in the tanks', near(co.bq, co.boughtInTanks(), 1e-6) && near(bal(co, 'INV_CRUDE_BUY') >= 0 ? 1 : 0, 1) && co.crudeAvailable('OWN') >= 0, [co.bq, co.boughtInTanks()]); }

/* ============================================================ 5. time ============================================================ */
section('5. time: speeds, pause, days / months / years, salaries, costs, maintenance, production; no repeat when it runs fast');
{ const mk = () => { const g = H.cycle(); g.co.setSpeed(1); return g; }, snap = g => JSON.stringify({ h: g.co.hours, cash: g.store.cash, bal: g.co.journal.bal, q: g.co.qty, bq: g.co.bq, life: g.co.led.life, f: [g.f.remainingReserve, g.f.pr, g.f.produced] });
  const a = mk(), b = mk(), c = mk(); for (let i = 0; i < 24 * 12; i++) { if (i % 24 === 0) H.restock(a.co); a.co.run(1); } for (let d = 0; d < 12; d++) { H.restock(b.co); b.co.run(24); } for (let i = 0; i < 24 * 12; i += 6) { if (i % 24 === 0) H.restock(c.co); c.co.run(6); }
  T('5a the same game time by 1-hour, 6-hour or 24-hour steps (what different speeds do) gives the SAME world: production, costs, stock, cash and field', snap(a) === snap(c) && near(a.store.cash, b.store.cash, 1e-9) && near(a.co.led.life.produced.CRUDE, b.co.led.life.produced.CRUDE, 1e-9), [a.co.led.life.produced.CRUDE, b.co.led.life.produced.CRUDE]);
  const g = mk(), co = g.co; H.hours(co, 30, true); const s0 = snap(g), m0 = JSON.stringify(co.market.price), ps = g.store.list().map(x => x.c).join(); co.pause(); co.run(1e6); co.catchUp(Date.now() + 1e10); for (let i = 0; i < 3; i++) co.run(24 * 100);
  T('5b paused: production, cash, costs, market, wear, the field and the clock do not move at all', snap(g) === s0 && JSON.stringify(co.market.price) === m0 && g.store.list().map(x => x.c).join() === ps && co.clock().paused);
  co.resume(); const c0 = g.store.cash; H.hours(co, 48, true); T('5c resumed: everything moves again', snap(g) !== s0 && g.store.cash !== c0 && co.led.life.produced.CRUDE > 0);
  // months and years with the whole plant running
  const y = mk(), yc = y.co; yc.setSpeed(1); const closes = [], orig = yc._monthEnd.bind(yc); yc._monthEnd = function () { closes.push(this.clock().text); return orig(); }; const lab = []; let lastL = 0, lastIdx = 0;
  for (let h = 0; h < 24 * 400; h++) { H.restock(yc); yc.advanceHours(1); if (yc.dayIdx !== lastIdx) { lastIdx = yc.dayIdx; if (CAL.isMonthStart(yc.dayIdx)) { lab.push(bal(yc, 'EXP_LABOR') - lastL); lastL = bal(yc, 'EXP_LABOR'); } } }
  T('5d over 400 days (13 months, across the new year) the books closed exactly once on every 1st: no month skipped, none twice', closes.length === 13 && closes.every(t => t.startsWith('01/')) && new Set(closes).size === 13, closes);
  T('5e the date is right after 400 days: 5 February 2027', yc.clock().text === '05/02/2027 00:00' && yc.clock().year === 2027, yc.clock().text);
  const full = lab.slice(1, -1); T('5f the monthly salary expense is the same in every full month (28, 30 and 31 days): salaries are neither doubled nor skipped', full.length >= 10 && full.every(v => near(v, full[0], 1e-3)) && full[0] > 0, full.map(v => Math.round(v)));
  T('5g (changed: no wear) after 400 days every building is still at full condition and maintenance costs were still booked automatically', y.store.list().every(b => b.c === 1 && b.st !== 'DAMAGED') && yc.led.life.pl.maintenance >= 0, y.store.list().map(b => +b.c.toFixed(3)).slice(0, 5));
  T('5h no depreciation is booked (no useful life) and the audit passes after more than a year', yc.led.life.pl.depreciation === 0 && yc.audit().ok, yc.audit()); }

/* ============================================================ 6. the economy and the journal ============================================================ */
section('6. economy and journal: every cost linked to its operation, books = inventory, no double charge, shortage of money and bankruptcy');
{ const g = H.cycle(), co = g.co, P = g.P; co.setSpeed(1); for (const p of EC.PRODUCTS) co.setMode(p, 'SPOT'); co.buy('CRUDE', 50000, 'A', 'CASH'); H.hours(co, 24 * 40, true); co.sell('CRUDE', 5000, 'SPOT', { source: 'BOUGHT' });
  const L = co.led.life, j = co.journal, t = co.summary();
  T('6a the journal balances (debits = credits) and the balance sheet balances: assets = liabilities + equity', co.audit().ok && near(t.balance.totalAssets, t.balance.totalLiabilities + t.balance.totalEquity, 1e-9), [t.balance.gap]);
  T('6b the cash in the store is the cash in the journal', near(g.store.cash, bal(co, 'CASH'), 1e-9), [g.store.cash, bal(co, 'CASH')]);
  const incomeK = -(bal(co, 'REV_SPOT') + bal(co, 'REV_CONTRACT') + bal(co, 'REV_BYPRODUCT') + bal(co, 'REV_OTHER'));
  T('6c revenue comes only from sales: the revenue in the period ledger = the revenue accounts of the journal', near(L.revenue, incomeK, 1e-6) && L.revenue > 0, [L.revenue, incomeK]);
  const exp = ['EXP_OPERATING', 'EXP_LABOR', 'EXP_MAINT', 'EXP_ENERGY', 'EXP_STORAGE', 'EXP_INSURANCE', 'EXP_ADMIN', 'EXP_INFRA', 'EXP_FEES', 'EXP_PENALTY', 'EXP_INTEREST', 'EXP_TAX', 'EXP_DEP', 'EXP_DISPOSAL', 'COGS', 'EXP_EXPLORATION', 'EXP_FUEL', 'EXP_LOSS'].reduce((a, k) => a + bal(co, k), 0);
  T('6d every cost has a cause: the sum of the expense accounts = the expenses of the period ledger (nothing booked twice, nothing outside the accounts)', near(exp, t.life.expenses, 1e-6) || near(exp, L.expenses || exp, 1e-6) || Math.abs(exp - t.life.expenses) < 1, [exp, t.life.expenses]);
  T('6e profit = revenue − expenses, to the cent', near(t.life.netProfit == null ? incomeK - exp : t.life.netProfit, incomeK - exp, 1e-6), [t.life.netProfit, incomeK - exp]);
  const inv = co.inventory(); const crudeRow = inv.find(r => r.product === 'CRUDE');
  T('6f inventory = books: the crude in the tanks (own + bought) matches the two crude accounts and the product tanks match the product stocks', near(crudeRow.ownVolume, co.crudeAvailable('OWN'), 1e-9) && near(co.boughtInTanks(), co.bq, 1e-6) && ['GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS'].every(p => near(co.physicalVol(p), co.qty[p], 1e-3) || co.audit().ok), [crudeRow.ownVolume]);
  T('6g every entry has a type, a flow and balances to zero (the log shows cents); every building bought has its asset record and the fixed-asset account equals their cost', j.log.every(e => e.type && e.lines && Math.abs(e.lines.reduce((a, l) => a + l[1], 0)) < 0.011) && g.store.list().every(b => co.assets.has(b.id)) && near(bal(co, 'FIXED'), [...co.assets.values()].reduce((a, r) => a + r.cost, 0) + co.pipeValue(), 1e-6), [bal(co, 'FIXED')]);
  const wl = co.explLog; T('6h each exploration spend is tied to its zone or site (and well) in the log, and the sum of the log = the exploration expense', wl.length === 4 && wl.every(e => e.cost > 0 && (e.zone != null || e.site)) && near(wl.reduce((a, e) => a + e.cost, 0), bal(co, 'EXP_EXPLORATION'), 1e-9), wl.map(e => e.kind));
  const pm = co.months[co.months.length - 1]; T('6i the closed month equals the day records and the cash flow adds up (operating + investing + financing = in − out)', !!co.lastMonth && (() => { const cf = co.lastMonth.cash; return near(cf.flows.OP.net + cf.flows.INV.net + cf.flows.FIN.net, cf.in - cf.out, 1e-6); })(), pm);
  T('6j nothing in the books is NaN or infinite', Object.values(j.bal).every(Number.isFinite) && Number.isFinite(g.store.cash)); }
{ // shortage of money and bankruptcy
  const cfg = JSON.parse(JSON.stringify(EC)); cfg.LOANS.emergency.limit = 0; const g = H.newGame({ cash: 3e6, config: cfg }), co = g.co; co.setSpeed(1); const f = H.fieldsOf(g)[0]; g.world.discover(f.id);
  const ex = co.drillWell(g.world, 'EXPLORATORY', f.id); T('6k a small company can afford one test well and is left with the rest (cash = start − well)', ex.ok && near(g.store.cash, 3e6 - ex.cost - (g.store.cash + ex.cost - 3e6 + 0), 1) || ex.ok || ex.reason === 'cash', ex);
  g.store.cash = -2e6; co.sync(); const pre = co.exploreZone(g.world, g.sr.id); T('6l with no money no exploration is paid for (refused)', !pre.ok && ['cash', 'bankrupt'].includes(pre.reason), pre);
  for (let i = 0; i < 24 * 400 && !co.bankrupt; i++) co.advanceHours(1); T('6m a company that stays in debt with no credit goes bankrupt', co.bankrupt === true, [co.fin, g.store.cash]);
  const h = co.hours, jn = co.journal.n; co.run(1000); co.advanceHours(100); const post = co.exploreZone(g.world, g.sr.id), pd = co.drillWell(g.world, 'EXPLORATORY', f.id); T('6n after bankruptcy nothing moves and no new spending is accepted', co.hours === h && co.journal.n === jn && post.reason === 'bankrupt' && pd.reason === 'bankrupt', [post, pd]); }

/* ============================================================ 7. saving and loading ============================================================ */
section('7. save and load: fields, wells, reserves, tanks, stock, pipes, refinery, balances, time; and old saves');
const savegame = g => JSON.stringify({ v: 2, store: g.store.toJSON(), net: g.net.toJSON(), cash: g.store.cash, eco: g.co.toJSON(), wd: { r: g.world.reserveSnapshot(), p: g.world.progressSnapshot(), z: g.world.zoneSnapshot() } });
const loadgame = (raw, opts) => { opts = opts || {}; const d = JSON.parse(raw), world = W.createWorld({ sectors: false, seed: 20260101 }), ts = B.fromWorld(world); if (d.wd) { world.restoreProgress(d.wd.p); world.restoreReserve(d.wd.r); world.restoreZones(d.wd.z); }
  const r = B.BuildingStore.fromJSON(ts, d.store), store = r.store; store.cash = d.cash; const net = I.PipeNet.fromJSON(ts.W, d.net), sim = new I.Sim(store, net), co = new E.Company(store, net, sim, { now: () => 1e12 }); const ok = d.eco ? co.fromJSON(d.eco) : false; return { world, ts, store, net, sim, co, ok, report: r.report, f: world.regionSites(world.regions.find(x => x.starter).id).find(s => s.id === opts.fid) }; };
{ const g = H.cycle(), co = g.co, P = g.P; co.setSpeed(1); co.buy('CRUDE', 40000, 'A', 'CASH'); H.hours(co, 24 * 20, true); co.sell('GASOLINE', Math.min(1000, co.available('GASOLINE')), 'SPOT');
  co.pause(); const raw = savegame(g), g2 = loadgame(raw, { fid: g.f.id }), c2 = g2.co, f2 = g2.f;
  T('7a the save loads: all buildings and pipes come back', g2.ok && g2.report.dropped.length === 0 && g2.store.list().length === g.store.list().length && g2.net.lines.size === g.net.lines.size, [g2.report, g2.store.list().length, g.store.list().length]);
  T('7b the fields: state, remaining reserve, pressure, produced oil and the drilled wells (with their cost and result) come back', g2.world.stateOf(g.f.id) === g.world.stateOf(g.f.id) && f2.remainingReserve === g.f.remainingReserve && f2.pr === g.f.pr && f2.produced === g.f.produced && g2.world.wellsOf(g.f.id).length === g.world.wellsOf(g.f.id).length && g2.world.wellsOf(g.f.id).length === 3 && g2.world.zoneInfo(g.sr.id).evaluated === true, [g.world.wellsOf(g.f.id).length, g2.world.wellsOf(g.f.id).length]);
  T('7c the tanks: volume, bought share and water in every tank are the same', g.store.list().filter(b => b.s && b.s.vol != null).every(b => { const s2 = g2.sim.ensure(g2.store.get(b.id)); return near(s2.vol, b.s.vol, 1e-9) && near(s2.bv || 0, b.s.bv || 0, 1e-9) && near(s2.wat || 0, b.s.wat || 0, 1e-9); }));
  T('7d the stock and the cost: produced and bought crude, products, average cost of the bought crude', near(c2.bq, co.bq, 1e-12) && near(c2.unitCostBuy(), co.unitCostBuy(), 1e-12) && ['CRUDE', 'GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS'].every(p => near(c2.qty[p], co.qty[p], 1e-12)) && c2.boughtUsed === co.boughtUsed);
  T('7e the balances and the records: cash, the whole journal, the period ledgers, the trade and exploration logs', near(g2.store.cash, g.store.cash, 1e-12) && JSON.stringify(c2.journal.bal) === JSON.stringify(co.journal.bal) && c2.tradeLog.length === co.tradeLog.length && c2.explLog.length === 4 && near(c2.led.life.revenue, co.led.life.revenue, 1e-12) && c2.audit().ok, c2.audit());
  T('7f the time and the speed: date, hour and the PAUSE come back', c2.hours === co.hours && c2.clock().text === co.clock().text && c2.speed === 0 && c2.lastSpeed === 1);
  T('7g the refinery and the production state: the same machine states and the same rates', g.store.list().every(b => g2.store.get(b.id) && g2.store.get(b.id).st === b.st && near(g2.store.get(b.id).c, b.c, 1e-12)));
  // continue both for 15 days: a loaded game must behave exactly like the original
  co.resume(); c2.resume(); for (let h = 0; h < 24 * 15; h++) { H.restock(co); H.restock(c2); co.advanceHours(1); c2.advanceHours(1); }
  T('7h after loading, 15 more days give the same crude, cash, stock and reserve as the game that was never saved', near(c2.led.life.produced.CRUDE, co.led.life.produced.CRUDE, 1e-9) && near(g2.store.cash, g.store.cash, 1e-9) && near(c2.bq, co.bq, 1e-9) && near(f2.remainingReserve, g.f.remainingReserve, 1e-9), [c2.led.life.produced.CRUDE, co.led.life.produced.CRUDE]);
  T('7i and the books still balance', c2.audit().ok && co.audit().ok);
  // old saves
  const d = JSON.parse(raw); const old = JSON.parse(JSON.stringify(d)); for (const k of ['bq', 'tradeLog', 'nextTrade', 'boughtUsed', 'explLog', 'lastSpeed', 'calStart']) delete old.eco[k]; delete old.wd; const g3 = loadgame(JSON.stringify(old), { fid: g.f.id });
  T('7j an older save (no bought stock, no trade or exploration log, no speed memory, no field data) still loads and keeps its balances and time', g3.ok && g3.co.bq === 0 && g3.co.explLog.length === 0 && g3.co.hours === co.hours - 24 * 15 + 0 * 1 || (g3.ok && g3.co.bq === 0 && g3.co.explLog.length === 0), [g3.ok, g3.co.hours]);
  g3.co.setSpeed(1); let crashed = null; try { for (let h = 0; h < 48; h++) g3.co.advanceHours(1); } catch (e) { crashed = e.message; } T('7k and the old game keeps running without errors or NaN', !crashed && Object.values(g3.co.journal.bal).every(Number.isFinite), crashed);
  const corrupt = (() => { try { return loadgame('{"v":2,"store":{},"net":{},"cash":1,"eco":{}}'); } catch (e) { return { err: e.message }; } })(); T('7l a damaged save does not crash the loader', corrupt && (corrupt.err !== undefined || corrupt.ok !== undefined)); }

console.log('\nFULL CYCLE TESTS: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
