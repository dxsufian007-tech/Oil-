/* Game Time & Calendar System: one central clock that every system obeys.
 *   Calendar (real months, leap years, start 1 Jan 2026), pause / speeds, month and year changes, no double days or charges,
 *   everything that depends on time (production, costs, market, construction, contracts, loans, salaries, depreciation) and saving.
 *   NODE_PATH=/opt/npm-tools/node_modules node oli/test-game-time.js */
const { B, I, E, EC, game, put, pipe, chain } = require('./test-economy-helpers.js'), CAL = require('./game-calendar.js'), fs = require('fs'), path = require('path');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-9 : tol) * Math.max(1, Math.abs(a), Math.abs(b));
const stockUp = co => { for (const [m, q] of [['CHEM', 20000], ['OPS', 5000], ['PARTS', 200]]) { const r = co.buy(m, q, 'A', 'CASH'); if (!r.ok) throw new Error('stock ' + m + ' ' + r.reason); } };
const rich = () => { const g = game(500e6); const c = chain(g, true, false); for (const b of g.store.list()) g.sim.ensure(b); stockUp(g.co); return Object.assign(g, { c }); };
const snap = g => JSON.stringify({ h: g.co.hours, cash: g.store.cash, bal: g.co.journal.bal, n: g.co.journal.n, qty: g.co.qty, bq: g.co.bq, life: g.co.led.life, mk: g.co.market.price, pay: g.co.payables.length });

/* ---- 1. the calendar ---- */
{ const c0 = CAL.fromHours(0); T('1 the game starts on 1 January 2026, 00:00', c0.year === 2026 && c0.month === 1 && c0.day === 1 && c0.hour === 0 && c0.text === '01/01/2026 00:00' && c0.textAr === '1 يناير 2026', c0);
  T('1b 1 January 2026 is a Thursday', c0.weekday === 4 && c0.weekdayName === 'الخميس');
  const d1 = CAL.fromHours(23), d2 = CAL.fromHours(24); T('2 a day passes after exactly 24 hours', d1.day === 1 && d1.hour === 23 && d2.day === 2 && d2.hour === 0);
  const L = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; let ok = true; for (let m = 1; m <= 12; m++) ok = ok && CAL.daysInMonth(2026, m) === L[m - 1]; T('3 month lengths of 2026 are the real ones (28 to 31 days)', ok && CAL.daysInYear(2026) === 365);
  T('3b leap years: 2028 has 29 days in February and 366 days; 2100 is not a leap year, 2000 is', CAL.daysInMonth(2028, 2) === 29 && CAL.daysInYear(2028) === 366 && !CAL.isLeap(2100) && CAL.isLeap(2000) && !CAL.isLeap(2027));
  T('4 month change: day 31 is 1 February, day 59 is 1 March (2026)', CAL.dateOfDay(31).month === 2 && CAL.dateOfDay(31).day === 1 && CAL.dateOfDay(58).day === 28 && CAL.dateOfDay(59).month === 3 && CAL.dateOfDay(59).day === 1);
  T('5 year change: day 364 is 31 Dec 2026, day 365 is 1 Jan 2027', CAL.dateOfDay(364).month === 12 && CAL.dateOfDay(364).day === 31 && CAL.dateOfDay(365).year === 2027 && CAL.dateOfDay(365).month === 1 && CAL.dateOfDay(365).day === 1);
  T('5b the leap day exists in 2028 only', (() => { const a = CAL.dayOf(2028, 2, 29); return CAL.dateOfDay(a).day === 29 && CAL.dateOfDay(a + 1).month === 3 && CAL.dateOfDay(a + 1).day === 1; })());
  let rt = true, mon = 0, last = null; for (let d = 0; d < 3000; d++) { const x = CAL.dateOfDay(d); rt = rt && CAL.dayOf(x.year, x.month, x.day) === d; if (x.day === 1) mon++; if (last && x.day !== 1) rt = rt && x.day === last.day + 1 && x.month === last.month; last = x; } T('6 3000 days round-trip through the calendar with no skipped or repeated day (' + mon + ' months)', rt && mon === 99, mon);
  T('6b month starts are exactly the 1st; year starts exactly 1 January', CAL.isMonthStart(31) && !CAL.isMonthStart(30) && CAL.isYearStart(365) && !CAL.isYearStart(31) && CAL.isYearStart(0));
  T('6c days left in the month', near(CAL.daysToMonthEnd(0), 31) && near(CAL.daysToMonthEnd(24 * 30 + 12), 0.5) && near(CAL.daysToMonthEnd(24 * 31), 28));
  T('6d "N months later" follows real months', CAL.addMonths(0, 1) === 31 * 24 && CAL.addMonths(24 * 30, 1) === CAL.dayOf(2026, 2, 28) * 24 && CAL.addMonths(0, 12) === 365 * 24); }

/* ---- 2. one full day, and the clock the company shows ---- */
{ const g = rich(); const k0 = g.co.clock(); T('7 a new company shows 1 January 2026, speed x1, running', k0.year === 2026 && k0.month === 1 && k0.dayOfMonth === 1 && k0.hour === 0 && k0.speed === 1 && !k0.paused && g.co.dayIdx === 0, k0);
  const d0 = g.co.days.length; g.co.advanceHours(24); const k1 = g.co.clock(); T('8 one whole day: 2 January, exactly one day closed, no double day', k1.dayOfMonth === 2 && k1.hour === 0 && g.co.dayIdx === 1 && g.co.days.length === d0 + 1 && g.co.days[g.co.days.length - 1].d === 0, [k1.text, g.co.days.length]);
  g.co.advanceHours(5); T('8b hours inside a day change only the time of day', g.co.clock().dayOfMonth === 2 && g.co.clock().hour === 5 && g.co.dayIdx === 1); }

/* ---- 3. months and years: the books close on the real 1st ---- */
{ const g = rich(); let closes = [], ye = []; const orig = g.co._monthEnd.bind(g.co); g.co._monthEnd = function () { closes.push(this.clock().text); return orig(); };
  const y0 = g.co.led.year; g.co.advanceHours(24 * 30); T('9 after 30 days nothing closed (January has 31): the old 30-day month is gone', closes.length === 0 && g.co.clock().dayOfMonth === 31, closes);
  g.co.advanceHours(24); T('10 on 1 February at 00:00 January closes, once', closes.length === 1 && closes[0] === '01/02/2026 00:00' && g.co.months.length === 1, closes);
  g.co.advanceHours(24 * 28); T('11 February (28 days) closes on 1 March', closes.length === 2 && closes[1] === '01/03/2026 00:00', closes);
  g.co.advanceHours(24 * (365 - 59 - 1)); const before = closes.length; T('12 one second before the new year (31 Dec 2026, 23:00) there are 11 closes and the year ledger is untouched', before === 11 && g.co.led.year === y0 && g.co.clock().text.startsWith('31/12/2026'), [before, g.co.clock().text]);
  g.co.advanceHours(24); T('13 on 1 January 2027 December closes (12 closes), the year ledger restarts and the date shows 2027', closes.length === 12 && closes[11] === '01/01/2027 00:00' && g.co.led.year !== y0 && g.co.clock().year === 2027 && g.co.clock().month === 1);
  g.co.advanceHours(24 * 731); T('14 three years later every month closed exactly once: 12 per year, on the 1st', closes.length === 36 && closes.every(t => t.startsWith('01/')), closes.length);
  T('14b the closes are the 1st of consecutive months with no gap or repeat', (() => { let ok = true; for (let i = 1; i < closes.length; i++) { const [d1, m1, y1] = closes[i - 1].slice(0, 10).split('/').map(Number), [d2, m2, y2] = closes[i].slice(0, 10).split('/').map(Number); ok = ok && ((y2 * 12 + m2) - (y1 * 12 + m1) === 1) && d1 === 1 && d2 === 1; } return ok; })());
  T('14c the audit still passes after 3 years', g.co.audit().ok, g.co.audit()); }

/* ---- 4. a month always costs the same salary, whatever its length ---- */
{ const g = rich(); g.co.advanceHours(24 * 31); const lab0 = g.co.journal.bal.EXP_LABOR; T('15 there is a payroll to test', g.co.staff.payroll > 0, g.co.staff.payroll);
  const r = []; for (const days of [28, 31, 30]) { const a = g.co.journal.bal.EXP_LABOR; g.co.advanceHours(24 * days); r.push(g.co.journal.bal.EXP_LABOR - a); }
  T('16 salary expense of February (28 days), March (31) and April (30) is the same monthly payroll', near(r[0], r[1], 1e-6) && near(r[1], r[2], 1e-6) && near(r[0], g.co.staff.payroll, 1e-6), r.concat(g.co.staff.payroll));
  T('16b the cash leaves on the 1st: nothing owed to staff right after a close', Math.abs(g.co.journal.bal.PAY_PAYROLL) < g.co.staff.payroll * 0.1, g.co.journal.bal.PAY_PAYROLL);
  T('16c next payment in days follows the calendar', near(g.co.nextPaymentInDays(), CAL.daysToMonthEnd(g.co.hours))); }
{ const g = game(500e6); g.co.takeLoan(10e6, 24, 'Storage'); const l = g.co.loans[0]; g.co.advanceHours(24 * 30); const p0 = l.paid; g.co.advanceHours(24); T('17 a loan instalment falls due on the 1st of the month, not after 30 days', p0 === 0 && l.paid === 1); }

/* ---- 5. pause: nothing that depends on time moves ---- */
{ const g = rich(); g.co.advanceHours(30); const s0 = snap(g), prod0 = g.co.led.life.produced.CRUDE + g.co.led.life.produced.THRU, cl0 = g.co.clock().text, st0 = g.store.time;
  const r = g.co.pause(); T('18 pausing sets speed 0 and remembers the old one', r.ok && g.co.speed === 0 && g.co.lastSpeed === 1 && g.co.clock().paused);
  const n = g.co.run(100000); g.co.catchUp(Date.now() + 1e9); g.co.run(24 * 400);
  T('19 while paused run() and offline catch-up advance nothing: clock, cash, ledger, stock, market all unchanged', n === 0 && snap(g) === s0 && g.co.clock().text === cl0 && g.store.time === st0, g.co.clock().text);
  T('19b no production and no cost while paused', g.co.led.life.produced.CRUDE + g.co.led.life.produced.THRU === prod0);
  g.co.resume(); const n2 = g.co.run(48); g.co.run(48); T('20 resuming continues at the same speed and the clock moves again', g.co.speed === 1 && g.co.hours > 30 + 40 && snap(g) !== s0 && g.co.led.life.produced.CRUDE > 0, g.co.hours);
  g.co.togglePause(); T('20b toggle pauses', g.co.speed === 0); g.co.togglePause(); T('20c toggle resumes the speed before the pause', g.co.speed === 1);
  g.co.setSpeed(5); g.co.togglePause(); g.co.togglePause(); T('20d x5 is restored after pause and resume', g.co.speed === 5); }

/* ---- 6. speeds: every system advances by the same ratio ---- */
{ const SP = EC.TIME.speeds; T('21 the speeds are pause, 0.5x, 1x, 2x, 5x, 10x', JSON.stringify(SP) === JSON.stringify([0, 0.5, 1, 2, 5, 10]), SP);
  const run = (sp, realS) => { const g = rich(); g.co.setSpeed(sp); let left = realS; const dt = EC.TIME.tickMs / 1000; while (left > 1e-9) { g.co.run(dt * (24 / EC.TIME.dayRealSeconds) * g.co.speed); left -= dt; } return g; };
  const base = run(1, 120); const hrs = {}; for (const sp of [0.5, 1, 2, 5, 10]) { const g = run(sp, 120); hrs[sp] = g.co.hours; }
  T('22 game time moves in proportion to speed (120 s of play)', Object.keys(hrs).every(sp => Math.abs(hrs[sp] - 240 * sp) <= 1.0001), hrs);
  const slow = run(0.5, 480), fast = run(2, 120), faster = run(10, 24); T('23 the same game time reached at different speeds gives the SAME world (' + slow.co.hours + ' h): no duplicated production or charges', slow.co.hours === fast.co.hours && fast.co.hours === faster.co.hours && snap(slow) === snap(fast) && snap(fast) === snap(faster), [slow.co.hours, fast.co.hours, faster.co.hours]);
  const a = rich(), b = rich(); for (let i = 0; i < 24 * 40; i++) a.co.run(1); for (let i = 0; i < 40; i++) b.co.run(24); T('24 tick size does not matter: 960 one-hour calls = 40 one-day calls', snap(a) === snap(b));
  const c = rich(); for (let i = 0; i < 700; i++) c.co.run(1.37); T('24b fractional chunks keep the remainder and lose none of the time', Math.abs(c.co.hours + c.co.acc - 700 * 1.37) < 1e-6, [c.co.hours, c.co.acc]);
  const e = rich(); e.co.run(1e9); T('25 a huge jump is capped by the tick limit (no freeze) and never skips or repeats a day', e.co.hours <= EC.TIME.maxCatchUpHours && e.co.days.length === e.co.dayIdx && e.co.days.every((x, i) => x.d === i), [e.co.hours, e.co.days.length]);
  T('25b only legal speeds are accepted', !g0().co.setSpeed(3).ok && !g0().co.setSpeed(-1).ok && g0().co.setSpeed(2).ok); function g0() { return game(1e6); }
  const f = game(1e6); f.co.setSpeed(10); T('25c faster stops at the top, slower stops at 0.5x', (f.co.faster(), f.co.speed === 10) && (() => { for (let i = 0; i < 9; i++) f.co.slower(); return f.co.speed === 0.5; })()); }

/* ---- 7. everything that depends on time uses this clock ---- */
{ const g = rich(); const m0 = JSON.stringify(g.co.market.price); g.co.pause(); g.co.run(500); T('26 market prices are frozen while paused', JSON.stringify(g.co.market.price) === m0);
  g.co.resume(); const mk = JSON.stringify(g.co.market.price); g.co.run(24 * 10); T('26b and move when time runs', JSON.stringify(g.co.market.price) !== mk); }
{ const g = game(500e6); const v = g.store.place('crude_tank_l', 120, 150, 0, {}); T('27 construction starts', v.ok && v.building.st === 'UNDER_CONSTRUCTION', v); const id = v.building.id, bt = B.DEFS.crude_tank_l.buildTime;
  g.co.pause(); g.co.run(24 * 365); T('27b construction does not progress while paused', g.store.get(id).st === 'UNDER_CONSTRUCTION' && g.store.time === 0);
  g.co.resume(); g.co.run(Math.ceil(bt) - 1); T('27c and is not finished early', g.store.get(id).st === 'UNDER_CONSTRUCTION'); g.co.run(2); T('27d it finishes by game time', g.store.get(id).st === 'OPERATIONAL', [bt, g.store.time]); }
{ const g = rich(); g.co.advanceHours(24 * 3); const of = g.co.offers[0]; const r = g.co.acceptContract(of.id); T('28 a supply contract is accepted', r.ok, r); const c = g.co.contracts[g.co.contracts.length - 1], dl = c.deadline;
  g.co.pause(); g.co.run(24 * 400); T('28b a paused game never reaches the deadline', c.status === 'ACTIVE' && g.co.hours < dl); g.co.resume(); g.co.advanceHours(dl - g.co.hours - 1); T('28c one hour before the deadline it is still active', c.status === 'ACTIVE'); g.co.advanceHours(2); T('28d past the deadline it fails exactly once (moves to the history, penalty booked once)', c.status === 'FAILED' && g.co.contracts.filter(x => x.id === c.id).length === 0 && g.co.history.filter(x => x.id === c.id).length === 1 && g.co.journal.log.filter(e => /Contract #' + c.id + ' failed/.test(e.desc || '')).length <= 1); }
{ const g = rich(); const b = g.c.wells[0]; const a0 = g.co.assetRec(b).t; g.co.advanceHours(24 * 20); const age = g.co.hours - g.co.assetRec(b).t; g.co.pause(); g.co.run(10000); T('29 building age and depreciation follow the same clock (age = game hours)', near(age, 24 * 20) && g.co.hours === 480); const dep0 = g.co.assetRec(b).dep; g.co.advanceHours(24 * 62); T('29b depreciation is booked on the 1st of the month only (3 closes passed), never twice', g.co.assetRec(b).dep > dep0 && g.co.audit().ok); }
{ const g = rich(); g.co.advanceHours(24 * 60); const bal = JSON.stringify(g.co.journal.bal), L = JSON.stringify(g.co.led.life); const g2 = rich(); for (let i = 0; i < 60; i++) g2.co.advanceHours(24); T('30 stepping by days or by one call gives identical books (no charge booked twice or skipped)', JSON.stringify(g2.co.journal.bal) === bal && JSON.stringify(g2.co.led.life) === L); }

/* ---- 8. saving ---- */
{ const g = rich(); g.co.advanceHours(24 * 45 + 7); g.co.setSpeed(5); const j = JSON.parse(JSON.stringify(g.co.toJSON())); const g2 = game(500e6);
  const ok = g2.co.fromJSON(j); T('31 the date, the hour and the speed are saved and restored', ok && g2.co.hours === g.co.hours && g2.co.dayIdx === g.co.dayIdx && g2.co.speed === 5 && g2.co.lastSpeed === 5 && g2.co.clock().text === g.co.clock().text && g2.co.clock().text === '15/02/2026 07:00', g2.co.clock().text);
  const p = rich(); p.co.advanceHours(100); p.co.pause(); const j2 = JSON.parse(JSON.stringify(p.co.toJSON())); const p2 = game(500e6); p2.co.fromJSON(j2); T('32 a game saved while paused is still paused after loading', p2.co.speed === 0 && p2.co.lastSpeed === 1 && p2.co.clock().paused && p2.co.resume().ok && p2.co.speed === 1);
  const old = JSON.parse(JSON.stringify(g.co.toJSON())); delete old.lastSpeed; delete old.calStart; const o = game(500e6); o.co.fromJSON(old); T('33 an older save (no lastSpeed, no calendar field) still loads on the same hours', o.co.hours === g.co.hours && o.co.speed === 5 && o.co.lastSpeed === 5);
  g.co.advanceHours(24 * 20); g2.co.advanceHours(24 * 20); T('34 after loading, the calendar continues exactly where it was (the buildings are saved by the lab, not by the company)', g.co.hours === g2.co.hours && g.co.clock().text === g2.co.clock().text && g2.co.clock().text === '07/03/2026 07:00' && g.co.dayIdx === g2.co.dayIdx, [g.co.clock().text, g2.co.clock().text]);
  T('34b the saved calendar start is 1 January 2026', JSON.stringify(g.co.toJSON().calStart) === JSON.stringify({ year: 2026, month: 1, day: 1 })); }

/* ---- 9. there is no second clock ---- */
{ const src = f => fs.readFileSync(path.join(__dirname, f), 'utf8'), count = (s, re) => (s.match(re) || []).length;
  for (const f of ['buildings.js', 'industry.js', 'ledger.js', 'game-calendar.js', 'economy-config.js']) T('35 ' + f + ' has no wall clock or timer', count(src(f).replace(/new Date\(\(ORIGIN[^;]*;/g, ''), /Date\.now|performance\.now|setInterval|setTimeout|requestAnimationFrame/g) === 0);
  const eco = src('economy.js'); T('36 economy.js reads the real clock in ONE place only (the default offline reader) and has no timer', count(eco, /Date\.now/g) === 1 && count(eco, /performance\.now|setInterval|setTimeout|requestAnimationFrame/g) === 0, count(eco, /Date\.now/g));
  const lab = src('building-lab.js'); T('37 the lab drives the company from ONE loop (COMPANY.run) and from the offline catch-up; nothing else steps the simulation', count(lab, /COMPANY\.run\(/g) === 1 && count(lab, /SIM\.step\(|\bsim\.step\(|STORE\.tick\(/g) === 0, [count(lab, /COMPANY\.run\(/g)]);
  T('38 the UI changes speed only through the company (setSpeed / pause / resume / faster / slower)', count(src('economy-ui.js'), /CO\.speed\s*=[^=]/g) === 0, count(src('economy-ui.js'), /CO\.speed\s*=[^=]/g)); }

console.log('\n' + (fail ? 'GAME TIME TESTS FAILED: ' + fail + ' of ' + (pass + fail) : 'GAME TIME TESTS PASSED (' + pass + ' checks)')); process.exit(fail ? 1 : 0);
