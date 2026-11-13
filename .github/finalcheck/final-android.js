const CDP = require('chrome-remote-interface'), fs = require('fs'); const sleep = ms => new Promise(r => setTimeout(r, ms)); const res = [];
const check = (n, ok, i) => { res.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + n + (i ? ' - ' + i : '')); };
setTimeout(() => { console.log('FAIL watchdog'); process.exit(0); }, 9 * 60 * 1000);
const PHASE = process.argv[2] || 'A';
setTimeout(() => { console.log('FAIL watchdog'); process.exit(0); }, 9 * 60 * 1000);
(async () => {
  let t = null; for (let i = 0; i < 30 && !t; i++) { try { t = (await CDP.List({ port: 9222 })).find(x => x.type === 'page'); } catch (e) {} if (!t) await sleep(1500); }
  if (!t) { console.log('FAIL no WebView page'); return; }
  const c = await CDP({ port: 9222, target: t, local: true }), { Runtime, Page, Input } = c; await Runtime.enable(); await Page.enable(); const errs = [];
  Runtime.exceptionThrown(e => errs.push('exception: ' + (e.exceptionDetails.exception && e.exceptionDetails.exception.description || e.exceptionDetails.text))); Runtime.consoleAPICalled(e => { if (e.type === 'error') errs.push(e.args.map(a => a.value || a.description).join(' ')); });
  const ev = async x => { const r = await Runtime.evaluate({ expression: '(async () => { ' + x + ' })()', awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value; };
  const shot = async n => { try { const r = await Page.captureScreenshot({ format: 'png' }); fs.writeFileSync('results/' + n + '.png', Buffer.from(r.data, 'base64')); } catch (e) {} };
  const touch = (type, x, y) => Input.dispatchTouchEvent({ type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 12, radiusY: 12, force: 1 }] });
  const tap = async sel => { const p = await ev(`const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center', behavior: 'instant' }); let last = ''; for (let i = 0; i < 25; i++) { await new Promise(r => setTimeout(r, 80)); const b = e.getBoundingClientRect(), k = b.x + ',' + b.y; if (k === last) break; last = k; } const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2];`); if (!p) throw new Error('no element ' + sel); console.log('tap ' + sel + ' at ' + p.map(Math.round).join(',') + ' hit: ' + await ev(`const h = document.elementFromPoint(${p[0]}, ${p[1]}); return h ? h.tagName + '#' + h.id + '.' + h.className + ' act=' + (h.closest('[data-act]') ? h.closest('[data-act]').dataset.act + '/' + h.closest('[data-act]').dataset.v : '-') : 'null';`)); await touch('touchStart', p[0], p[1]); await sleep(70); await touch('touchEnd'); await sleep(500); };
  const tapUntil = async (sel, cond, tries) => { for (let k = 0; k < (tries || 4); k++) { try { await tap(sel); } catch (e) { console.log('tapUntil: ' + e.message); } for (let i = 0; i < 12; i++) { await sleep(500); if (await ev('return !!(' + cond + ');').catch(() => false)) return true; } console.log('retry tap ' + sel + ' (' + (k + 1) + ')'); } return false; };
  let up = false; for (let i = 0; i < 90 && !up; i++) { up = await ev('return !!window.__wp && !!window.__lab;').catch(() => false); if (!up) await sleep(1000); } check('the game starts in the WebView', up);
  let lab = false; for (let i = 0; i < 120 && !lab; i++) { lab = await ev('return !!(window.__lab && __lab.restored);').catch(() => false); if (!lab) await sleep(1000); } check('the game world is loaded', lab);
  console.log('ENV ' + JSON.stringify(await ev('return { ua: navigator.userAgent, w: innerWidth, h: innerHeight, v: window.OLI_VERSION };')));
  if (await ev('return !!window.__homeOpen;').catch(() => false)) await tapUntil('#h-cont', '!window.__homeOpen', 5);
  if (await ev('return !!document.querySelector("#eco-away.open");')) await tapUntil('#away-ok', '!document.querySelector("#eco-away.open")', 4);
  await ev('__lab.company.speed = 0;'); await sleep(800);
  const body = () => ev('return document.getElementById("es-body").textContent;');
  const back = async () => { await ev('const b = [...document.querySelectorAll("#es-body button[data-act=screen]")].find(x => x.dataset.v === ""); if (b) b.click();'); await sleep(600); };
  const openCompany = async () => { await tapUntil('#eh-menu', 'document.getElementById("eco-sheet").classList.contains("open")'); await tapUntil('#es-tabs [data-tab=company]', 'document.querySelector("#es-body [data-act=screen][data-v=loans2]")'); };
  await openCompany(); await shot('01-company');
  const order = await ev('return [...document.querySelectorAll("#es-body button[data-act=screen]")].map(x => x.dataset.v).join(",");'); check('Company tab: loans & financing, then investment, then the bank screen', /loans2.*invest.*bank/.test(order), order);
  if (PHASE === 'A') {
    await ev('__lab.company.injectEquity(2e9, "device-test");'); const c0 = await ev('return __lab.company.store.cash;');
    await tapUntil('[data-act=screen][data-v=loans2]', 'document.querySelector("#es-body [data-act=lnSec]")'); check('loans screen opens on the debt summary', /ملخص الديون/.test(await body()) && /إجمالي الدين/.test(await body())); await shot('02-loans-summary');
    for (const s of ['active', 'sched', 'log', 'arrears', 'banks', 'calc']) { await tapUntil('[data-act=lnSec][data-v=' + s + ']', 'document.querySelector("#es-body [data-act=lnSec].on[data-v=' + s + ']")'); check('section ' + s + ' opens with no NaN', !/NaN|undefined|Infinity/.test(await body())); }
    await tapUntil('[data-act=lnSec][data-v=new]', 'document.querySelector("#es-body [data-act=lnBank]")'); await tapUntil('[data-act=lnBank][data-v=COMMERCIAL]', 'document.querySelector("#es-body [data-act=lnType]")'); await tapUntil('[data-act=lnType][data-v=WORKING_CAPITAL]', 'document.querySelector("#es-body [data-act=lnAmount]")');
    await tapUntil('[data-act=lnAmount][data-v="10000000"]', 'document.querySelector("#es-body .es-card [data-act=lnStep][data-v=\\"4\\"]")'); await tapUntil('.es-card [data-act=lnStep][data-v="4"]', 'document.querySelector("#es-body [data-act=lnTerm]")'); await tapUntil('[data-act=lnTerm][data-v="24"]', 'document.querySelector("#es-body [data-act=lnFreq]")'); await tapUntil('.es-card [data-act=lnStep][data-v="6"]', 'document.querySelector("#es-body [data-act=lnTake]")');
    check('the review shows the final rate and needs a confirm', /سعر الفائدة النهائي/.test(await body()) && /موعد أول قسط/.test(await body())); await shot('03-review');
    check('no loan before the confirm', await ev('return __lab.company.bank.loans.length === 0;'));
    await tapUntil('[data-act=lnTake]', '__lab.company.bank.loans.length === 1', 4); const l = await ev('const l = __lab.company.bank.loans[0]; return { n: __lab.company.bank.loans.length, bal: l.bal, pmt: l.pmt, id: l.id, cash: __lab.company.store.cash };');
    check('confirming creates exactly one bank loan and pays out 10,000,000', l.n === 1 && Math.abs(l.cash - c0 - 10e6) < 1, JSON.stringify(l)); await shot('04-active');
    await tapUntil('[data-act=lnPanel][data-v^="b"][data-v$="|pay"]', 'document.querySelector("#es-body [data-act=lnAmt]")'); await tapUntil('[data-act=lnAmt][data-v^="b"][data-v$="|25"]', 'document.querySelector("#es-body [data-act=lnPay]")'); await tapUntil('[data-act=lnPay][data-v^="b"]', 'Math.abs(__lab.company.bank.loans[0].bal - 7500000) < 1', 4);
    check('a 25% early repayment cuts the balance to 7,500,000', await ev('return Math.abs(__lab.company.bank.loans[0].bal - 7500000) < 1;')); await shot('05-prepaid');
    await back();
    await tapUntil('[data-act=screen][data-v=invest]', 'document.querySelector("#es-body [data-act=ivSec]")'); check('investment opens', /نظرة عامة/.test(await body())); await shot('06-invest');
    await tapUntil('[data-act=ivSec][data-v=bonds]', 'document.querySelector("#es-body [data-act=ivBuy]")'); check('the bond market shows Ask and Bid', /Ask/.test(await body()) && /Bid/.test(await body())); await shot('07-market');
    await tapUntil('[data-act=ivBuy]', 'document.querySelector("#es-body [data-act=ivUnits]")'); await tapUntil('[data-act=ivUnits][data-v="1000"]', 'document.querySelector("#es-body [data-act=ivConfirm]")'); await shot('08-buy'); await tapUntil('[data-act=ivConfirm]', '__lab.company.bank.bonds.pos.length === 1', 4);
    check('a bond was bought through the engine', await ev('return __lab.company.bank.bonds.pos.length === 1 && __lab.company.bank.bonds.pos[0].units === 1000;'));
    await tapUntil('[data-act=ivSec][data-v=log]', 'document.querySelector("#es-body [data-act=ivSec].on[data-v=log]")'); check('the log lists the purchase', /شراء سند/.test(await body())); await shot('09-log');
    const snap = await ev('const c = __lab.company, l = c.bank.loans[0], p = c.bank.bonds.pos[0]; __lab.save(); return JSON.stringify({ loans: c.bank.loans.length, bal: l.bal, pmt: l.pmt, paidPrin: l.paidPrin, units: p.units, carry: p.carry, bought: c.bank.bonds.acct.bought, tx: c.bank.tx.length, btx: c.bank.bonds.tx.length });'); console.log('SNAP ' + snap); fs.writeFileSync('results/snap.json', snap);
    check('the game was saved', await ev('return !window.__saveError;'), await ev('return String(window.__saveError);'));
  } else {
    const s0 = JSON.parse(fs.readFileSync('results/snap.json', 'utf8')); const s1 = JSON.parse(await ev('const c = __lab.company, l = c.bank.loans[0], p = c.bank.bonds.pos[0]; return JSON.stringify({ loans: c.bank.loans.length, bal: l && l.bal, pmt: l && l.pmt, paidPrin: l && l.paidPrin, units: p && p.units, carry: p && p.carry, bought: c.bank.bonds.acct.bought, tx: c.bank.tx.length, btx: c.bank.bonds.tx.length });'));
    console.log('AFTER ' + JSON.stringify(s1)); check('after the app was killed and started again the loan and the bond are there, nothing lost', s1.loans === 1 && s1.units === 1000 && Math.abs(s1.bal - s0.bal) < 1 && Math.abs(s1.carry - s0.carry) < 1, JSON.stringify([s0, s1]));
    check('nothing was repeated by the load (instalments, interest, coupons, log lines)', s1.paidPrin === s0.paidPrin && s1.bought === s0.bought && s1.btx === s0.btx, JSON.stringify([s0, s1]));
    await tapUntil('[data-act=screen][data-v=loans2]', 'document.querySelector("#es-body [data-act=lnSec]")'); await tapUntil('[data-act=lnSec][data-v=active]', 'document.querySelector("#es-body [data-act=lnSec].on[data-v=active]")'); check('the loan is listed after the restart', /القروض المصرفية/.test(await body())); await shot('10-after-restart-loans');
    await back();
    await tapUntil('[data-act=screen][data-v=invest]', 'document.querySelector("#es-body [data-act=ivSec]")'); await tapUntil('[data-act=ivSec][data-v=port]', 'document.querySelector("#es-body [data-act=ivSec].on[data-v=port]")'); check('the holding is listed after the restart', /#/.test(await body()) && !/لا استثمارات حالية/.test(await body())); await shot('11-after-restart-invest');
    await ev('__lab.company.advanceHours(24 * 40);'); await sleep(500); check('40 more days run without errors and without a second loan appearing', await ev('return __lab.company.bank.loans.length === 1 && __lab.company.bank.loans[0].m >= 1;'));
    await ev('document.getElementById("eco-sheet").classList.remove("open");'); await sleep(300);
    const nd = await ev('return !!window.__netdiag;'); check('the network inspector is present', nd);
  }
  check('no JavaScript errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('SUMMARY ' + res.filter(Boolean).length + '/' + res.length + ' PASS'); await c.close();
})().catch(e => console.log('FAIL crashed: ' + e.message));
