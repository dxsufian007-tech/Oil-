/* Oli - test-employees.js  (Economy Phase 9: employees - hiring, dismissal, training, hours, engineers, team efficiency and their effect on output)
 * Run: NODE_PATH=/opt/npm-tools/node_modules node test-employees.js
 */
const { B, I, E, EC, game, put, pipe, chain } = require('./test-economy-helpers.js');
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol) * Math.max(1, Math.abs(a), Math.abs(b));
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); } };
const quietCfg = () => { const c = JSON.parse(JSON.stringify(EC)); c.FIXED = { insurancePerMonth: 0, adminBase: 0, adminPerAsset: 0, infraPerYear: 0 }; c.POWER.tiers[0].monthly = 0; c.STORAGE_COST = { CRUDE: 0, GASOLINE: 0, DIESEL: 0, JET_FUEL: 0, GAS: 0 }; return c; };
// a crude chain: wells, pump, separator, tank.  Returns the company after `hours` with a setup function applied first
function run(setup, hours) { const g = game(500e6, quietCfg()), co = g.co; chain(g, false, false); co.computeStaff(); if (setup) setup(co); co.advanceHours(hours || 96); return { co, g }; }

/* 1. fully staffed and trained: nothing changes (the old numbers stay) */
{ const { co } = run(null, 24); T('E1 fully staffed and trained: team efficiency 1.0', near(co.teamEff, 1, 1e-9) && co.staffF === 1, [co.teamEff, co.staffF]); T('E1a no extra failure risk', co.engMult === 1, co.engMult); }

/* 2. hiring raises payroll by the salary of the new people */
{ const g = game(500e6, quietCfg()), co = g.co; chain(g, false, false); co.computeStaff(); const p0 = co.staff.payroll, r = co.hire('operators', 1);
  T('E2 hire accepted', r.ok, r); T('E2a payroll rises by one operator salary', near(co.staff.payroll - p0, EC.LABOR.salary.operators, 1e-9), [co.staff.payroll - p0]); }

/* 3. staff shortage lowers output (same plant, one operator missing) */
{ const full = run(null, 96), short = run(co => { co.dismiss('operators', 2); }, 96);
  const pf = full.co.led.life.produced.CRUDE, ps = short.co.led.life.produced.CRUDE;
  T('E3 a shortage lowers production', ps < pf && ps > 0, [pf, ps]);
  T('E3a shortage factor is bounded (not below the floor)', short.co.staffF >= EC.HR.shortageFloor - 1e-9 && short.co.staffF < 1, short.co.staffF); }

/* 4. missing engineers raise the failure risk; extra engineers lower it, within the bounds */
{ const g = game(500e6, quietCfg()), co = g.co; const c = chain(g, false, false); co.sync(); co.computeStaff();
  const req = co.staff.required.engineers; co.hr.engineers.extra = -req; co.computeStaff();
  T('E4 no engineers: failure risk rises (multiplier > 1, within bounds)', co.engMult > 1 && co.engMult <= EC.HR.decayBounds[1] + 1e-9, co.engMult);
  co.hr.engineers.extra = 0; co.computeStaff(); T('E4a back to the required crew: multiplier 1', co.engMult === 1, co.engMult); }
{ const g = game(500e6, quietCfg()), co = g.co; chain(g, false, false); co.hr.engineers.extra = 1; co.computeStaff();
  T('E4b one extra engineer lowers the failure risk, not below the bound', co.engMult < 1 && co.engMult >= EC.HR.decayBounds[0] - 1e-9, co.engMult); }

/* 5. training raises efficiency gradually: new hires start less trained, and gain over time */
{ const g = game(500e6, quietCfg()), co = g.co; chain(g, false, false); co.computeStaff(); co.dismiss('operators', 0);
  const r = co.hire('operators', 2); const e0 = co.teamEff; T('E5 new hires lower team efficiency at once', r.ok && co.teamEff < 1, [co.teamEff, e0]);
  let prev = co.teamEff, mono = true; for (let d = 0; d < 20; d++) { co.advanceHours(24); if (co.teamEff < prev - 1e-9) mono = false; prev = co.teamEff; }
  T('E5a efficiency rises every day while they train (gradual)', mono && co.teamEff > e0, [e0, co.teamEff]); }

/* 6. extra staff cannot push efficiency above the facility's capacity; hiring is capped */
{ const g = game(500e6, quietCfg()), co = g.co; chain(g, false, false); co.computeStaff(); let last = null; for (let i = 0; i < 20; i++) { last = co.hire('operators', 1); if (!last.ok) break; }
  T('E6 hiring stops at the cap', last && last.reason === 'cap' && co.hr.operators.extra <= EC.HR.surplusMin + 1e-9 + Math.ceil(EC.HR.surplusShare * co.staff.required.operators), [last, co.hr.operators.extra]);
  co.hr.operators.training = 1; co.computeStaff(); T('E6a extra trained staff: efficiency stays at 1.0 (no output above capacity)', co.staffF === 1, co.staffF); }

/* 7. hours above the standard tire the crew, bounded */
{ const g = game(500e6, quietCfg()), co = g.co; chain(g, false, false); const r = co.setHours('operators', 60); T('E7 hours accepted within limits', r.ok && r.hours === 60, r);
  T('E7a long hours lower efficiency (fatigue, bounded)', co.teamEff < 1 && co.teamEff >= EC.HR.fatigueMin * 0.85 - 1e-9, co.teamEff);
  co.setHours('operators', 48); T('E7b back to 48 hours: efficiency 1.0', near(co.teamEff, 1, 1e-9), co.teamEff); }

/* 8. training costs cash and raises training; not possible without people */
{ const g = game(500e6, quietCfg()), co = g.co; chain(g, false, false); co.hr.operators.training = 0.5; co.computeStaff(); const c0 = g.store.cash, n = co.staff.operators, r = co.train('operators');
  T('E8 training accepted', r.ok, r); T('E8a training costs heads x training cost', near(c0 - g.store.cash, n * EC.HR.trainingCost, 1e-6), [c0 - g.store.cash, n]); T('E8b training rises', co.hr.operators.training > 0.5, co.hr.operators.training);
  T('E8c the audit passes after hiring and training', co.audit().ok, co.audit()); }

/* 9. a dismissal below the crew is refused when there is nobody left */
{ const g = game(500e6, quietCfg()), co = g.co; const r = co.dismiss('managers', 1000); T('E9 nobody left to dismiss: refused, headcount stays at zero', !r.ok && r.reason === 'none' && co.staff.managers === 0, [r, co.staff.managers]); }

/* 10. the books stay right: audit passes after two years with hiring, dismissal and training every quarter */
{ const g = game(500e6, quietCfg()), co = g.co; chain(g, false, false); let bad = null;
  for (let m = 0; m < 24 && !bad; m++) { if (m % 3 === 0) { co.hire('maintenance', 1); co.train('operators'); } if (m % 3 === 2) co.dismiss('maintenance', 1); co.advanceHours(24 * 30); const a = co.audit(); if (!a.ok) bad = { m, e: a.errors }; }
  T('E10 audit passes for two years of staff changes', !bad, bad); }

/* 11. save and load keep the crew */
{ const g = game(500e6, quietCfg()), co = g.co; chain(g, false, false); co.hire('operators', 1); co.setHours('maintenance', 55); const sd = JSON.parse(JSON.stringify(co.toJSON())), co2 = game(1).co; co2.fromJSON(sd);
  T('E11 crew, hours and training survive save and load', co2.hr.operators.extra === 1 && co2.hr.maintenance.hours === 55 && near(co2.teamEff, co.teamEff, 1e-9), [co2.hr.operators, co2.hr.maintenance]); }

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
