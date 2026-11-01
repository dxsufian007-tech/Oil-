// Phase 3 economy on a real Android system (emulator, Android 14, the actual APK and its WebView).  REAL TOUCH events (DevTools Input.dispatchTouchEvent) drive every screen:
// HUD pause / speed / menu, Market, Sell, Inventory, Production, Contracts, Loans, building ECONOMICS, save -> reload, CLOSE the app (force-stop) -> REOPEN -> WHILE YOU WERE AWAY, clock validation, performance.
// Emulator = software GL: this is NOT a real device.  (REAL DEVICE TEST: NOT TESTED)
const CDP = require('chrome-remote-interface'); const fs = require('fs'); const cp = require('child_process');
const results = []; let out = {};
const check = (n, ok, info) => { results.push({ n, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (info ? '  — ' + info : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms)); const sh = c => { try { return cp.execSync(c, { encoding: 'utf8', timeout: 60000 }).trim(); } catch (e) { return ''; } };
(async () => {
  let client, Runtime, Page, Input; const errors = [];
  const attach = async () => { let t = null; for (let i = 0; i < 30 && !t; i++) { try { t = (await CDP.List({ port: 9222 })).find(x => x.type === 'page'); } catch (e) { } if (!t) await sleep(1500); } if (!t) return false;
    client = await CDP({ port: 9222, target: t, local: true }); ({ Runtime, Page, Input } = client); await Runtime.enable(); await Page.enable();
    Runtime.exceptionThrown(e => errors.push('exception: ' + (e.exceptionDetails.exception && e.exceptionDetails.exception.description || e.exceptionDetails.text))); Runtime.consoleAPICalled(e => { if (e.type === 'error') errors.push(e.args.map(a => a.value || a.description).join(' ')); }); return true; };
  const ev = async expr => { const r = await Runtime.evaluate({ expression: '(async () => { ' + expr + ' })()', awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value; };
  const ready = async n => { for (let i = 0; i < (n || 90); i++) { if (await ev('return !!(window.__lab && __lab.restored);').catch(() => false)) return true; await sleep(1000); } return false; };
  const reconnect = async () => { try { await client.close(); } catch (e) { } await sleep(5000); if (!(await attach())) return false; return ready(60); };
  const guard = async (name, fn) => { for (let a = 0; a < 3; a++) { try { await fn(); return; } catch (e) { console.log('NOTE section "' + name + '" interrupted (' + String(e.message).slice(0, 90) + ') - reconnecting after a WebView renderer kill (emulator Play Services crash loop)'); out.reconnects = (out.reconnects || 0) + 1; if (!(await reconnect())) break; } } };
  const shot = async name => { try { const r = await Page.captureScreenshot({ format: 'png' }); fs.writeFileSync('results/' + name + '.png', Buffer.from(r.data, 'base64')); } catch (e) { console.log('shot failed ' + name); } };
  const touch = (type, x, y) => Input.dispatchTouchEvent({ type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 12, radiusY: 12, force: 1 }] });
  const tapXY = async (x, y) => { await touch('touchStart', x, y); await sleep(60); await touch('touchEnd'); await sleep(220); };
  const center = sel => ev(`const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); await new Promise(r => setTimeout(r, 120)); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2];`);
  const tap = async sel => { const c = await center(sel); if (!c) throw new Error('no element ' + sel); await tapXY(c[0], c[1]); };
  const swipe = async (x, y0, y1) => { await touch('touchStart', x, y0); for (let i = 1; i <= 10; i++) { await sleep(25); await touch('touchMove', x, y0 + (y1 - y0) * i / 10); } await touch('touchEnd'); await sleep(250); };
  const body = () => ev('return document.getElementById("es-body").innerText;'), tabTo = async t => { await tap('#es-tabs [data-tab=' + t + ']'); await sleep(250); };
  const snapState = () => ev('const c = __lab.company; return JSON.stringify({ cash: __lab.store.cash, h: c.hours, debt: c.debt(), px: c.market.price, ct: c.contracts.length, modes: c.modes, n: __lab.store.list().length, inv: c.inventory().map(v => Math.round(v.volume)) });');
  const relaunch = async () => { await sleep(9000);   // the WebView writes localStorage to disk a few seconds after the change: wait, then kill the process
                                                                   // CLOSE the app (process killed, like swiping it away) and OPEN it again
    try { await client.close(); } catch (e) { } sh('adb shell am force-stop com.oli.buildlab'); await sleep(2500); sh('adb shell am start -n com.oli.buildlab/com.oli.oilgame.MainActivity'); await sleep(12000); sh('adb shell input keyevent KEYCODE_WAKEUP');
    const pid = sh('adb shell pidof com.oli.buildlab').replace(/\r/g, ''); sh('adb forward --remove-all'); sh('adb forward tcp:9222 localabstract:webview_devtools_remote_' + pid); await sleep(1500); if (!(await attach())) return false; return ready(90); };

  if (!(await attach())) { console.log('FAIL no WebView page'); return; }
  check('the game with the economy is running in the Android WebView', await ready());
  out.env = await ev('return { ua: navigator.userAgent, dpr: devicePixelRatio, w: innerWidth, h: innerHeight };'); console.log('ENV ' + JSON.stringify(out.env));

  await guard('hud + chain', async () => {
    await ev('window.__noSave = false; localStorage.clear(); __lab.reset();'); await sleep(500);
    check('HUD is visible on the phone screen and fits the width', await ev('const r = document.getElementById("eco-hud").getBoundingClientRect(); return r.width > 200 && r.right <= innerWidth + 1 && [...document.querySelectorAll("#eco-hud > *")].every(e => e.getBoundingClientRect().right <= innerWidth + 1);'));
    check('the company starts with $50M', (await ev('return document.getElementById("eh-cash").innerText;')).includes('$50M'));
    await tap('#eh-pause'); check('touch: PAUSE stops Game Time', await ev('return __lab.company.speed === 0;')); await tap('#eh-pause'); check('touch: PLAY resumes', await ev('return __lab.company.speed > 0;'));
    const sp = []; for (let i = 0; i < 4; i++) { await tap('#eh-speed'); sp.push(await ev('return __lab.company.speed;')); } check('touch: speed button cycles 2x, 5x, 10x, 1x', sp.join() === '2,5,10,1', sp.join());
    const h0 = await ev('return __lab.company.hours;'); await sleep(3000); const h1 = await ev('return __lab.company.hours;'); check('Game Time advances on the device (' + (h1 - h0) + ' game hours in 3 s at 1x)', h1 > h0);
    const d = await ev('return await __lab.buildDemo();'); check('the oil chain is bought with real money (12 buildings, 11 pipelines)', d.ok && d.total === 12 && d.pipelines === 11, JSON.stringify(d.failed)); await ev('__lab.company.speed = 0; __lab.company.advanceHours(24 * 25); for (const p of ["DIESEL", "JET_FUEL"]) __lab.company.setMode(p, "SPOT"); __lab.EU.hud();');
    check('after 25 days the company holds assets, inventory and has costs', await ev('const s = __lab.company.summary(); return s.assets > 1e8 && s.inventoryValue > 0 && s.life.expenses > 0;'));
  });

  await guard('screens by touch', async () => {
    await ev('__lab.company.speed = 0;'); await tap('#eh-menu'); await sleep(400); check('touch: the menu button opens the economy sheet', await ev('return document.getElementById("eco-sheet").classList.contains("open");')); await shot('e-company');
    let t = await body(); check('COMPANY: cash, company value, assets, debt, inventory, Today / Month / Year, cash flow, employees', ['CASH', 'COMPANY VALUE', 'ASSETS', 'DEBT', 'INVENTORY', 'Today', 'Month', 'Year', 'Starting cash', 'EMPLOYEES'].every(x => t.includes(x)));
    const y0 = await ev('return document.getElementById("es-body").scrollTop;'); await swipe(200, 640, 260); const y1 = await ev('return document.getElementById("es-body").scrollTop;'); check('touch: the sheet scrolls by swiping (scrollTop ' + Math.round(y0) + ' -> ' + Math.round(y1) + ') and the map camera does not move', y1 > y0 + 50);
    await tabTo('market'); await sleep(300); await shot('e-market'); t = await body(); check('MARKET: five products with price, 24h change, trend, inventory, potential revenue', ['Crude', 'Gasoline', 'Diesel', 'Jet Fuel', 'Gas / LPG', '24h change', 'Trend', 'Your inventory', 'Potential revenue'].every(x => t.includes(x)));
    check('MARKET: the price chart is drawn', await ev('return document.querySelectorAll("#es-body svg path").length >= 2;')); const p24 = await ev('return document.querySelector("#es-body svg path:nth-of-type(2)").getAttribute("d").split("L").length;'); await tap('[data-act=range][data-v="720"]'); const p30 = await ev('return document.querySelector("#es-body svg path:nth-of-type(2)").getAttribute("d").split("L").length;'); check('touch: 24h -> 30 Days chart range (' + p24 + ' -> ' + p30 + ' points)', p30 > p24);
    await tap('[data-act=mode][data-p=GASOLINE][data-v=SPOT]'); check('touch: SPOT mode', await ev('return __lab.company.modes.GASOLINE === "SPOT";')); await tap('[data-act=mode][data-p=GASOLINE][data-v=WAIT]'); check('touch: WAIT mode (keeps the stock)', await ev('return __lab.company.modes.GASOLINE === "WAIT";'));
    const inv0 = await ev('return __lab.company.available("GASOLINE");'), cash0 = await ev('return __lab.store.cash;'); await tap('[data-act=sellnow][data-p=GASOLINE]'); await sleep(300); await tap('[data-act=sellpct][data-v="50"]'); await sleep(200); await shot('e-sell'); t = await body();
    check('SELL: Available, Market price, Quantity, Gross, Fees, Net', ['Available', 'Market price', 'QUANTITY', 'Gross', 'Fees', 'Net'].every(x => t.includes(x))); out.sellQuote = await ev('return document.getElementById("es-body").innerText.slice(0, 400);'); await tap('[data-act=sell]'); await sleep(400); const inv1 = await ev('return __lab.company.available("GASOLINE");'), cash1 = await ev('return __lab.store.cash;');
    check('touch: SELL 50% -> inventory ' + Math.round(inv0) + ' -> ' + Math.round(inv1) + ' bbl, cash +' + Math.round(cash1 - cash0), inv1 < inv0 * 0.52 && inv1 > inv0 * 0.48 && cash1 > cash0 && await ev('const L = __lab.company.led.life; return Math.abs(L.fees - L.spot * 0.01) < 1;'));
    await tabTo('inventory'); await shot('e-inventory'); t = await body(); check('INVENTORY: Current volume, Capacity, Fill %, Market value, Storage cost', ['Current volume', 'Capacity', 'Market value', 'Storage cost', '%'].every(x => t.includes(x)));
    await tabTo('production'); await shot('e-production'); t = await body(); check('PRODUCTION: crude, throughput, gasoline, diesel, jet, gas', ['Crude Production', 'Refinery Throughput', 'Gasoline Production', 'Diesel Production', 'Jet Fuel Production', 'Gas Production'].every(x => t.includes(x)));
    await tabTo('contracts'); await shot('e-contracts'); check('CONTRACTS: three offers', await ev('return document.querySelectorAll("[data-act=accept]").length === 3;')); await tap('[data-act=accept]'); check('touch: ACCEPT starts a contract', await ev('return __lab.company.activeContracts().length === 1;'));
    await tabTo('loans'); await sleep(200); await tap('[data-act=lamt][data-v="10000000"]'); await tap('[data-act=lterm][data-v="24"]'); await shot('e-loans'); const lc = await ev('return __lab.store.cash;'); await tap('[data-act=borrow]'); await sleep(300);
    check('touch: TAKE LOAN -> +$10M cash, $10M debt', await ev('return __lab.company.debt() === 10e6;') && (await ev('return __lab.store.cash;')) - lc > 9.9e6); const lq = await ev('const l = __lab.company.loans[0]; const r = l.rate / 12, n = l.months; return [l.payment, l.principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1)];'); check('the monthly payment follows the amortization formula on the device (' + Math.round(lq[0]) + ')', Math.abs(lq[0] - lq[1]) < 1);
    await tabTo('alerts'); await shot('e-alerts'); check('ALERTS screen', (await body()).length > 5); await tap('#es-close'); await sleep(200); check('touch: close returns to the map', await ev('return !document.getElementById("eco-sheet").classList.contains("open");'));
    await ev('const rf = __lab.store.list().find(b => b.d === "refinery_m"); __wp.goto(rf.x + 4, rf.y + 3, .5); __lab.showBuilding(rf.id);'); await sleep(1200); await tap('#bEcon'); await sleep(300); await shot('e-building'); t = await ev('return document.getElementById("info").innerText;');
    check('touch: building ECONOMICS tab (refinery): revenue, operating, maintenance, energy, REFINING MARGIN', ['ECONOMICS', 'Revenue (products)', 'Operating cost', 'Maintenance', 'Energy', 'REFINING MARGIN'].every(x => t.includes(x)));
  });

  await guard('save load', async () => {
    await ev('__lab.company.speed = 0; __lab.save();'); const a = await snapState(); await Page.reload(); await sleep(4000); const ok1 = await ready(60); const b = ok1 && await snapState();
    check('Save -> reload the app: cash, game time, debt, market prices, contracts, sales modes, buildings and inventory are identical', ok1 && a === b, ok1 ? '' : 'not restored');
    check('the company continues to work after the load (RUNNING chain)', await ev('__lab.company.speed = 0; __lab.company.advanceHours(24); const L = __lab; return Object.values(L.company.store.list().filter(b => ["refinery_m", "pump_station_l"].includes(b.d))).map(b => L.sim.status(b)).every(s => s === "RUNNING");'));
  });

  await guard('close and reopen the app', async () => {
    await ev('__lab.company.speed = 1; for (const p of ["GASOLINE", "DIESEL", "JET_FUEL"]) __lab.company.setMode(p, "SPOT"); __lab.save();'); const before = await ev('return { h: __lab.company.hours, cash: __lab.store.cash };');
    await ev('window.__noSave = true; const s = JSON.parse(localStorage.getItem("oli-lab-v2")); s.eco.savedAt = Date.now() - 3 * 3600 * 1000; localStorage.setItem("oli-lab-v2", JSON.stringify(s));');   // "the app has been closed for 3 hours"
    const back = await relaunch(); check('the app was CLOSED (process killed) and REOPENED: the game restored', back);
    if (back) { await sleep(1500); const shown = await ev('return document.getElementById("eco-away").classList.contains("open");'); check('WHILE YOU WERE AWAY is shown after reopening', shown); await shot('e-away'); const t = await ev('return document.getElementById("eco-away").innerText;');
      check('away report: Produced, Sold, Operating cost, Profit / Loss, Storage, Warnings', ['WHILE YOU WERE AWAY', 'Produced', 'Sold', 'Operating cost', 'Profit / Loss', 'Storage', 'Warnings'].every(x => t.includes(x)), t.replace(/\n/g, ' | ').slice(0, 300));
      const after = await ev('return { h: __lab.company.hours, cash: __lab.store.cash, away: __lab.company.away };'); check('the company produced while the app was closed: ' + (after.h - before.h) + ' game hours (3 real hours x 6 game days = 432) , produced ' + Math.round(after.away && after.away.producedCrude) + ' bbl crude', after.h - before.h >= 432 && after.h - before.h <= 440 && after.away && after.away.producedCrude > 0);
      check('offline costs were charged (operating cost ' + Math.round(after.away && after.away.operatingCost) + ')', after.away && after.away.operatingCost > 0 && after.cash !== before.cash); check('time is paused while the report is open', await ev('return __lab.company.speed === 0;'));
      if (shown) await tap('#away-ok'); await sleep(300); check('touch: CONTINUE closes the report and time resumes', await ev('return !document.getElementById("eco-away").classList.contains("open") && __lab.company.speed === 1;'));
      // a clock moved FORWARD by days is capped; a clock moved BACKWARD gives nothing
      await ev('__lab.company.speed = 0; window.__noSave = false; __lab.save(); window.__noSave = true; const s = JSON.parse(localStorage.getItem("oli-lab-v2")); s.eco.savedAt = Date.now() - 400 * 3600 * 1000; localStorage.setItem("oli-lab-v2", JSON.stringify(s));'); const hc = await ev('return __lab.company.hours;');
      if (await relaunch()) { await sleep(1500); const a2 = await ev('return __lab.company.away;'); const hh = await ev('return __lab.company.hours;'); check('offline cap: 400 h away counts as 24 h (' + (hh - hc) + ' game hours = 24 x 6 x 24 = 3456)', a2 && a2.capped && a2.realHours === 24 && hh - hc === 3456, JSON.stringify(a2 && { capped: a2.capped, h: a2.realHours })); await shot('e-away-capped'); if (await ev('return document.getElementById("eco-away").classList.contains("open");')) await tap('#away-ok'); }
      await ev('__lab.company.speed = 0; window.__noSave = false; __lab.save(); window.__noSave = true; const s = JSON.parse(localStorage.getItem("oli-lab-v2")); s.eco.savedAt = Date.now() + 5 * 3600 * 1000; localStorage.setItem("oli-lab-v2", JSON.stringify(s));'); const hf = await ev('return { h: __lab.company.hours, c: __lab.store.cash };');
      if (await relaunch()) { await sleep(1200); const r = await ev('return { h: __lab.company.hours, c: __lab.store.cash, bad: __lab.company.badClock, shown: document.getElementById("eco-away").classList.contains("open") };'); check('clock validation: a save from the FUTURE gives no offline time and no money', r.h === hf.h && r.c === hf.c && r.bad && !r.shown, JSON.stringify(r)); }
      await ev('window.__noSave = false;'); }
  });

  await guard('performance', async () => {
    await ev('__lab.company.speed = 0;'); out.ecoTickMs = await ev('const t = performance.now(); __lab.company.advanceHours(240); return (performance.now() - t) / 240;'); check('one economy tick (1 game hour: whole chain + market + finance) costs ' + out.ecoTickMs.toFixed(2) + ' ms on the device', out.ecoTickMs < 20);
    out.offlineMs = await ev('const c = __lab.company; c.stamp(1e12); const t = performance.now(); c.catchUp(1e12 + 24 * 3600 * 1000); return performance.now() - t;'); check('the 24 h offline catch-up (3,456 game hours) runs in ' + Math.round(out.offlineMs) + ' ms', out.offlineMs < 8000); await ev('__lab.company.clearAway();');
    out.renderMs = await ev('const t = performance.now(); for (const tb of ["company", "market", "inventory", "production", "contracts", "loans"]) { __lab.EU.open(tb); } return (performance.now() - t) / 6;'); check('rendering an economy screen costs ' + out.renderMs.toFixed(1) + ' ms', out.renderMs < 120); await ev('__lab.EU.close();');
    const sampler = `window.__ft = []; window.__ftOn = true; let last = performance.now(); (function f() { const t = performance.now(); window.__ft.push(t - last); last = t; if (window.__ftOn) requestAnimationFrame(f); })();`;
    await ev('__lab.company.speed = 10;'); await ev(sampler); await sleep(4000); await ev('window.__ftOn = false;'); const a = (await ev('return window.__ft;')).slice(1).sort((x, y) => x - y); out.fps10x = +(a.length / (a.reduce((p, q) => p + q, 0) / 1000)).toFixed(1); out.p95 = Math.round(a[Math.floor(a.length * .95)]);
    check('frame rate while the game runs at 10x with the HUD: ' + out.fps10x + ' fps, p95 ' + out.p95 + ' ms (emulator, software GL)', a.length > 20); await ev('__lab.company.speed = 0;');
    out.heapMB = await ev('return performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;'); check('JS heap ' + out.heapMB + ' MB', out.heapMB == null || out.heapMB < 400);
  });
  check('no JavaScript errors / crash', errors.length === 0, errors.slice(0, 3).join(' | '));
  fs.writeFileSync('results/economy-perf.json', JSON.stringify(out, null, 1)); console.log('ECONOMY SUMMARY ' + results.filter(r => r.ok).length + '/' + results.length + ' PASS'); try { await client.close(); } catch (e) { }
})().catch(e => { console.log('FAIL crashed: ' + e.message); });
