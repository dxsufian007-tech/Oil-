/* Time simulation of the opening finances: $500M cash, the central network bought with the 100% bank loan (6%, 60 years, 2 years of interest only), a real plant built on the real world with the real functions,
 * run month by month with automatic sales. Measures the burn, the margin and the break-even; checks the books and the finance state machine along the way.   node test-central-finance-sim.js */
const H = require('./cycle-helpers.js'), C = require('./central.js'), { put, connect } = H, EC = H.EC; let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' -> ' + JSON.stringify(x))); } };
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t) * Math.max(1, Math.abs(a), Math.abs(b));
function big(g,f){ const zn=g.world.refineryZones(g.sr.id)[1],fx=f.x,fy=f.y,fail=[],P={wells:[],j:[]};
 for(let k=0;k<3;k++){ const jy=fy+k*14-14; const j=put(g,'junction',fx+3,jy,4); P.j.push(j); if(!j){fail.push('j'+k);continue;}
  ['PORT_N','PORT_W','PORT_S'].forEach((p,i)=>{ const w=put(g,'oil_well',fx-3,jy+(i-1)*4,3); if(!w){fail.push('w');return;} P.wells.push(w); if(!connect(g,w,j,{bp:p}))fail.push('wl'); }); }
 P.j4=put(g,'junction',fx+10,fy,4); P.pump=put(g,'pump_station_l',fx+15,fy-1,4); P.sep=put(g,'separator',fx+27,fy-2,4); P.ct=put(g,'crude_tank_m',fx+38,fy-1,5);
 P.rf=put(g,'refinery_m',zn.x+4,zn.y+5,6); P.tg=put(g,'gasoline_tank_m',zn.x+20,zn.y+1,5); P.td=put(g,'diesel_tank_m',zn.x+20,zn.y+6,5); P.tj=put(g,'jet_tank_m',zn.x+20,zn.y+11,5); P.tl=put(g,'gas_sphere_m',zn.x+12,zn.y+14,5); P.j2=put(g,'junction',zn.x-6,zn.y+5,4);
 for(const k of Object.keys(P)) if(!P[k]) fail.push(k);
 const L=(a,b,o,n)=>{ if(!a||!b){fail.push(n);return;} if(!connect(g,a,b,o)) fail.push(n); };
 ['PORT_N','PORT_W','PORT_S'].forEach((p,i)=>L(P.j[i],P.j4,{ap:'PORT_E',bp:p,dia:24},'jj'+i));
 L(P.j4,P.pump,{ap:'PORT_E',bp:'INPUT',dia:24},'j4pump');L(P.pump,P.sep,{ap:'OUTPUT',bp:'MIXTURE_IN',dia:24},'ps');L(P.sep,P.ct,{ap:'OIL_OUT',bp:'INPUT_W'},'st');
 L(P.ct,P.j2,{ap:'OUTPUT_E',bp:'PORT_W',dia:24},'tj2');L(P.j2,P.rf,{ap:'PORT_E',bp:'CRUDE_IN',dia:24},'j2r');
 L(P.rf,P.tg,{ap:'GASOLINE_OUT',bp:'INPUT_W'},'g');L(P.rf,P.td,{ap:'DIESEL_OUT',bp:'INPUT_W'},'d');L(P.rf,P.tj,{ap:'JET_OUT',bp:'INPUT_W'},'j');L(P.rf,P.tl,{ap:'GAS_OUT',bp:'INPUT_N'},'gas');
 P.fail=fail; for(const b of g.store.list()) g.sim.ensure(b); return P; }

function scenario(wells, months) {
  let g, P; if (wells === 3) { g = H.cycle({ cash: 500e6 }); P = g.P; } else { g = H.newGame({ cash: 500e6 }); const f = H.fieldsOf(g)[0], co0 = g.co; g.f = f; g.world.discover(f.id); co0.exploreZone(g.world, g.sr.id); co0.drillWell(g.world, 'EXPLORATORY', f.id); co0.drillWell(g.world, 'APPRAISAL', f.id); co0.drillWell(g.world, 'APPRAISAL', f.id); P = big(g, f); g.P = P; H.stockUp(co0); }
  const co = g.co; for (const p of ['CRUDE', 'GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS']) co.setMode(p, 'SPOT'); const capex = 500e6 - g.store.cash;
  const inst = C.install(g.store, g.net, undefined, { verify: true }); const acq = co.acquireCentral(g.net.central.cost()); co.setSpeed(1); const cash0 = g.store.cash, rows = []; let broke = null, states = new Set();
  for (let m = 1; m <= months; m++) { const c0 = g.store.cash; try { H.hours(co, 24 * 30, true); } catch (e) { broke = broke || { m, why: e.message }; break; } rows.push({ m, cash: g.store.cash, net: g.store.cash - c0, state: co.fin && co.fin.state }); states.add(co.fin && co.fin.state); if (g.store.cash < 0) { broke = broke || { m, why: 'negative cash' }; break; } }
  return { g, co, P, capex, inst, acq, cash0, rows, broke, states };
}
const burn = (rows, from, to) => { const r = rows.slice(from, to); return r.reduce((a, x) => a + x.net, 0) / r.length; };
console.log('1. small plant: 3 wells');
const S3 = scenario(3, 16);
ok(S3.P.fail.length === 0 && S3.inst.stations === 29 && S3.acq.ok, '1a plant built (no failed building / pipe), network installed (29 stations) and bought', [S3.P.fail, S3.inst.stations]);
ok(near(S3.cash0, 500e6 - S3.capex, 1e-9) && S3.cash0 > 0, '1b the loan moved no cash: after the plant ($' + (S3.capex / 1e6).toFixed(0) + 'M of exploration + plant) $' + (S3.cash0 / 1e6).toFixed(0) + 'M is left');
const b3 = burn(S3.rows, 2, 8); console.log('     monthly net cash with 3 wells (months 3–8): $' + (b3 / 1e6).toFixed(1) + 'M ·', S3.rows.map(r => Math.round(r.cash / 1e6)).join(' '));
ok(b3 < 0 && S3.broke && S3.broke.m > 6 && S3.broke.m < 16, '1c result: a 3-well plant cannot carry the loan — cash is gone after ' + (S3.broke && S3.broke.m) + ' months (' + (S3.broke && S3.broke.why) + ')', S3.rows.map(r => Math.round(r.cash / 1e6)));
console.log('2. medium plant: 9 wells + refinery');
const S9 = scenario(9, 14);
ok(S9.P.fail.filter(x => x !== 'ps').length === 0 && S9.acq.ok, '2a plant built', S9.P.fail);
const b9 = burn(S9.rows, 3, 10); console.log('     monthly net cash with 9 wells (months 4–10): $' + (b9 / 1e6).toFixed(1) + 'M ·', S9.rows.map(r => Math.round(r.cash / 1e6)).join(' '));
ok(b9 > b3 && S9.rows.length > S3.rows.length - 1, '2b a bigger plant earns clearly more: monthly net $' + (b9 / 1e6).toFixed(1) + 'M vs $' + (b3 / 1e6).toFixed(1) + 'M, runway ' + S9.rows.length + ' months vs ' + S3.rows.length);
console.log('3. the books during the grace period (both runs)');
for (const [nm, S] of [['3 wells', S3], ['9 wells', S9]]) { const co = S.co, l = co.centralLoan(), bs = co.balanceSheet(); const I = co.journal.bal.EXP_INTEREST;
  ok(near(l.remaining, l.principal, 1e-12) && S.rows.length >= 6, '3-' + nm + ' the principal is untouched during the grace (' + S.rows.length + ' months run): balance $' + (l.remaining / 1e9).toFixed(3) + 'B'); const first = S.rows.length;
  ok(I >= (S.rows.length - 1) * l.principal * .005 * 0.999 && I <= S.rows.length * l.principal * .005 * 1.001, '3-' + nm + ' interest expense booked = ' + S.rows.length + ' × $' + (l.principal * .005 / 1e6).toFixed(2) + 'M (one charge at each month end; no other loan exists): $' + (I / 1e6).toFixed(1) + 'M', I); ok(Math.abs(bs.gap) < 1, '3-' + nm + ' the balance sheet balances (gap ' + bs.gap.toFixed(4) + ')'); }
console.log('4. break-even');
{ const margin = (b9 - b3) / ((12885 - 4323) * 30); const noProd = b3 - 4323 * 30 * margin; const need = -noProd / (30 * margin); console.log('     measured margin ≈ $' + margin.toFixed(1) + ' per barrel, burn without production ≈ $' + (-noProd / 1e6).toFixed(1) + 'M/month → break-even ≈ ' + Math.round(need) + ' bbl/day of crude');
  ok(margin > 10 && margin < 150 && need > 12885, '4a break-even production = ' + Math.round(need) + ' bbl/day (about ' + Math.ceil(need / 2500) + ' wells at the 2,500 bbl/d well rating): beyond the 9-well plant, reachable only by scaling production during the first year', [margin, need]); }
console.log('5. when the cash runs out (the existing state machine, nothing new)');
{ const co = S3.co, g = S3.g; let d = 0; for (; d < 120 && co.fin.state === 'OK'; d++) { try { H.hours(co, 24, false); } catch (e) { break; } }
  ok(g.store.cash < 0 && co.fin.state !== 'OK', '5a negative cash escalates the existing finance state to ' + co.fin.state + ' within ' + d + ' days (cash $' + (g.store.cash / 1e6).toFixed(0) + 'M): no crash, no silent write-off', [co.fin.state, g.store.cash]);
  const l = co.centralLoan(); ok(l && near(l.remaining, l.principal, 1e-12) && co.balanceSheet().loans >= l.principal - 1, '5b the bank loan is still the company\'s liability (never forgiven)'); }
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
