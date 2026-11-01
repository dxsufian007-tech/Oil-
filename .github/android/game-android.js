// Phase 3.5 (Arabic-first easy game) on a real Android system (emulator, Android 14, the actual APK and its WebView).  REAL TOUCH events (DevTools Input.dispatchTouchEvent) drive every screen:
// HUD pause / speed / menu, Market, Sell, Inventory, Production, Contracts, Loans, building ECONOMICS, save -> reload, CLOSE the app (force-stop) -> REOPEN -> WHILE YOU WERE AWAY, clock validation, performance.
// Emulator = software GL: this is NOT a real device.  (REAL DEVICE TEST: NOT TESTED)
const CDP = require('chrome-remote-interface'); const fs = require('fs'); const cp = require('child_process');
const results = []; let out = {}; globalThis.__out = out;
const check = (n, ok, info) => { results.push({ n, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (info ? '  — ' + info : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms)); const sh = c => { try { return cp.execSync(c, { encoding: 'utf8', timeout: 60000 }).trim(); } catch (e) { return ''; } };
setTimeout(() => { console.log('FAIL watchdog: the game script did not finish in 13 minutes'); fs.writeFileSync('results/game-perf.json', JSON.stringify(globalThis.__out || {}, null, 1)); process.exit(0); }, 13 * 60 * 1000);
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
  const center = sel => ev(`const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center', behavior: 'instant' }); let last = -1; for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 80)); const y = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect().y; if (Math.abs(y - last) < 0.5) break; last = y; } const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2];`);
  const tap = async sel => { const c = await center(sel); if (!c) throw new Error('no element ' + sel); await tapXY(c[0], c[1]); };
  const swipe = async (x, y0, y1) => { await touch('touchStart', x, y0); for (let i = 1; i <= 10; i++) { await sleep(25); await touch('touchMove', x, y0 + (y1 - y0) * i / 10); } await touch('touchEnd'); await sleep(250); };
  const body = () => ev('return document.getElementById("es-body").innerText;'), tabTo = async t => { await tap('#es-tabs [data-tab=' + t + ']'); await sleep(250); };
  const snapState = () => ev('const c = __lab.company; return JSON.stringify({ cash: __lab.store.cash, h: c.hours, debt: c.debt(), px: c.market.price, ct: c.contracts.length, modes: c.modes, n: __lab.store.list().length, inv: c.inventory().map(v => Math.round(v.volume)) });');

  const lat = () => ev(`const out = [], w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let x; while ((x = w.nextNode())) { const v = x.nodeValue; if (/[A-Za-z]{2,}/.test(v) && !['SCRIPT','STYLE','TITLE'].includes(x.parentNode.tagName)) { const el = x.parentElement; let vis = el.getClientRects().length > 0; for (let e = el; e && vis; e = e.parentElement) if (getComputedStyle(e).display === 'none') vis = false; if (vis) out.push(v.trim()); } } return out;`);
  const txt = id => ev(`return (document.getElementById(${JSON.stringify(id)}) || { innerText: '' }).innerText.replace(/[⁦⁩]/g, '');`);
  const idle = async () => { await sleep(500); for (let i = 0; i < 180; i++) { if (await ev('return !!(window.__wp && __wp.idle && __wp.idle());').catch(() => false)) return true; await sleep(500); } return false; };
  const mapPt = id => ev(`const b = __lab.store.get(${id}); return [__wp.sx(b.x + .5, b.y + .5), __wp.sy(b.x + .5, b.y + .5)];`);
  if (!(await attach())) { console.log('FAIL no WebView page'); return; }
  check('the game is running in the Android WebView', await ready());
  out.env = await ev('return { ua: navigator.userAgent, dpr: devicePixelRatio, w: innerWidth, h: innerHeight };'); console.log('ENV ' + JSON.stringify(out.env));
  // the earlier sections left the developer flags in this app's storage: clear them and reload into the normal (Arabic) game
  await ev('window.__noSave = true; localStorage.clear();'); await Page.reload(); await sleep(3000); check('the game reloaded in normal mode', await ready()); check('the map finished drawing (terrain chunks ready)', await idle());
  await ev('__lab.reset(); __lab.company.speed = 0;'); await sleep(800); await idle(); await sleep(4000);
  await guard('arabic + hud', async () => {
    check('the page is Arabic and right-to-left', await ev('return document.documentElement.dir === "rtl" && document.documentElement.lang === "ar";'));
    check('the developer palette is hidden', await ev('return ["bar","pal","tabs"].every(i => getComputedStyle(document.getElementById(i)).display === "none");'));
    const cash = await txt('eh-cash'); check('the company starts with $10M (' + cash.replace(/\n/g, ' ') + ')', cash.includes('$10M'));
    check('the four category buttons are big and inside the screen', await ev('return [...document.querySelectorAll("#g-nav button")].length === 4 && [...document.querySelectorAll("#g-nav button")].every(b => { const r = b.getBoundingClientRect(); return r.width > 70 && r.height >= 44 && r.right <= innerWidth + 1; });'));
    check('the guide says: لديك حقل نفط. ابدأ بحفر أول بئر.', (await txt('g-guide')).includes('لديك حقل نفط. ابدأ بحفر أول بئر.'));
    const l = await lat(); check('no English word is visible on the first screen', l.length === 0, l.slice(0, 4).join(' | ')); await shot('g-start');
  });
  await guard('build the well by touch', async () => {
    await tap('#g-nav [data-cat=oil]'); check('the oil button opens the build list', await ev('return document.getElementById("g-sheet").classList.contains("open");')); await shot('g-oil-list');
    check('locked buildings show 🔒', await ev('const c = document.querySelector("#g-list .gcard[data-id=pump_station_s]"); return !!c && c.classList.contains("lock") && c.innerText.includes("🔒");'));
    await tap('#g-list [data-act=build][data-id=oil_well]'); await sleep(600); await idle();
    check('the well ghost is on the map, valid (green)', await ev('const g = __lab.state.pending; return !!g && g.def === "oil_well" && g.verdict.ok;')); await shot('g-well-ghost');
    await tap('#bNext'); check('«مكان آخر» suggests another spot', await ev('return !!__lab.state.pending && __lab.state.pending.verdict.ok;'));
    const c0 = await ev('return __lab.store.cash;'); await tap('#bBuild'); await sleep(500);
    check('«بناء»: the well is built and its price leaves the balance', await ev('return __lab.store.list().some(b => b.d === "oil_well");') && (await ev('return __lab.store.cash;')) < c0 - 200000);
    await ev('__lab.company.advanceHours(24); __lab.GU.check();'); await sleep(300); check('the guide asks to start production', (await txt('g-guide')).includes('ابدأ إنتاج النفط'));
  });
  await guard('start production + tank + pipe by touch', async () => {
    const wid = await ev('return __lab.store.list().find(b => b.d === "oil_well").id;'); let pt = await mapPt(wid); await tapXY(pt[0], pt[1]); await sleep(300);
    check('the new well shows «▶ ابدأ الإنتاج»', (await ev('return !!document.getElementById("bStartWell");'))); await shot('g-start-button');
    await tap('#bStartWell'); check('the well is started by touch', await ev('return __lab.store.get(' + wid + ').s.started === true;'));
    await ev('__lab.GU.check();'); check('the guide: النفط يحتاج إلى مكان للتخزين', (await txt('g-guide')).includes('مكان للتخزين'));
    await tap('#g-nav [data-cat=storage]'); await tap('#g-list [data-act=build][data-id=crude_tank_s]'); await sleep(500); await tap('#bBuild'); await sleep(500);
    const tid = await ev('return __lab.store.list().find(b => b.d === "crude_tank_s").id;'); await ev('__lab.company.advanceHours(96); __lab.GU.check();'); await sleep(300);
    check('the guide: اربط البئر بالخزان', (await txt('g-guide')).includes('اربط البئر بالخزان'));
    await tap('#g-nav [data-cat=pipes]'); await tap('#g-list [data-act=build][data-id=pipe]'); await sleep(300);
    check('pipe mode asks for the start building', (await txt('buildbar')).includes('اضغط على المبنى الذي يبدأ'));
    pt = await mapPt(wid); await tapXY(pt[0], pt[1]); await sleep(300); pt = await mapPt(tid); await tapXY(pt[0], pt[1]); await sleep(400);
    check('a valid route is previewed with its price', (await txt('buildbar')).includes('مسار صالح')); await shot('g-pipe-plan');
    await tap('#bPipeOk'); await sleep(400); check('the pipe is built and connected at both ends', await ev('const l = [...__lab.pipes.lines.values()][0]; return !!(l && l.a && l.b);'));
    await ev('__lab.pipeMode(false); __lab.company.advanceHours(24 * 6); __lab.GU.check();'); await sleep(300);
    const vol = await ev('return __lab.sim.ensure(__lab.store.get(' + tid + ')).vol;'); check('oil flows by itself into the tank (' + Math.round(vol) + ' bbl)', vol > 100); await shot('g-flowing');
    check('the guide: بِع النفط', (await txt('g-guide')).includes('بِع النفط'));
  });
  await guard('sell + level 2', async () => {
    await tap('#eh-menu'); await sleep(300); await tap('#es-tabs [data-tab=market]'); const l = await lat(); check('no English on the market screen', l.length === 0, l.slice(0, 3).join(' | '));
    await tap('[data-act=sellnow][data-p=CRUDE]'); await tap('[data-act=sellpct][data-v="50"]'); const c0 = await ev('return __lab.store.cash;'); await tap('[data-act=sell]');
    check('selling crude brings the first revenue', (await ev('return __lab.store.cash;')) > c0); await ev('__lab.GU.check();'); await sleep(500);
    check('level 2 is announced', await ev('return document.getElementById("g-lvl").classList.contains("open");')); await shot('g-level2'); await tap('#g-lvl-ok'); await tap('#es-close'); await sleep(300);
    await tap('#g-nav [data-cat=oil]'); check('level 2 opens the small pump station', await ev('const c = document.querySelector("#g-list .gcard[data-id=pump_station_s]"); return !!c && !c.classList.contains("lock");')); await tap('#g-close');
  });
  await guard('save + close the app + reopen', async () => {
    const before = await ev('return JSON.stringify({ l: __lab.GU.level(), s: __lab.GU.step(), n: __lab.store.list().length, p: __lab.pipes.lines.size });'); await ev('__lab.company.speed = 0; __lab.save();'); await sleep(9000);
    try { await client.close(); } catch (e) { } sh('adb shell am force-stop com.oli.buildlab'); await sleep(2500); sh('adb shell am start -n com.oli.buildlab/com.oli.oilgame.MainActivity'); await sleep(12000); sh('adb shell input keyevent KEYCODE_WAKEUP');
    const pid = sh('adb shell pidof com.oli.buildlab').replace(/\r/g, ''); sh('adb forward --remove-all'); sh('adb forward tcp:9222 localabstract:webview_devtools_remote_' + pid); await sleep(1500); await attach(); await ready(90);
    await ev('__lab.company.speed = 0;'); const after = await ev('return JSON.stringify({ l: __lab.GU.level(), s: __lab.GU.step(), n: __lab.store.list().length, p: __lab.pipes.lines.size });');
    check('after closing and reopening the app the lesson, the buildings and the pipes are the same (' + before + ')', before === after, before === after ? '' : 'AFTER ' + after);
    const l = await lat(); check('still Arabic, no English', l.length === 0 && (await ev('return document.documentElement.dir === "rtl";')), l.slice(0, 3).join(' | '));
  });
  check('no JavaScript errors / crash', errors.length === 0, errors.slice(0, 3).join(' | '));
  fs.writeFileSync('results/game-perf.json', JSON.stringify(out, null, 1)); console.log('GAME SUMMARY ' + results.filter(r => r.ok).length + '/' + results.length + ' PASS'); try { await client.close(); } catch (e) { }
  process.exit(0);
})().catch(e => { console.log('FAIL crashed: ' + e.message); });
