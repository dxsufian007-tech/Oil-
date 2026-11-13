// OLI EMPIRE official APK on a real Android system: the game starts, the Network Diagnostics inspector opens (real touch), scans the oil network and the Central network, and tapping a fault jumps the map to it.
const CDP = require('chrome-remote-interface'), fs = require('fs'); const sleep = ms => new Promise(r => setTimeout(r, ms)); const res = [];
const check = (n, ok, i) => { res.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + n + (i ? ' - ' + i : '')); };
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
  const S = () => ev('return JSON.stringify(__netdiag.st.rep ? { s: __netdiag.st.rep.stats, c: __netdiag.st.rep.central } : null);').then(x => JSON.parse(x));
  let up = false; for (let i = 0; i < 90 && !up; i++) { up = await ev('return !!window.__wp && !!window.__netdiag;').catch(() => false); if (!up) await sleep(1000); } check('the game starts in the WebView with the inspector loaded', up); if (!up) return;
  console.log('ENV ' + JSON.stringify(await ev('return { ua: navigator.userAgent, w: innerWidth, h: innerHeight };'))); await shot('01-start');
  let lab = false; for (let i = 0; i < 90 && !lab; i++) { lab = await ev('return !!(window.__lab && __lab.restored);').catch(() => false); if (!lab) await sleep(1000); } check('the game world is loaded', lab); if (!lab) return;
  if (await ev('return !!window.__homeOpen;').catch(() => false)) await tapUntil('#h-cont', '!window.__homeOpen', 5);
  if (await ev('return !!document.querySelector("#eco-away.open");')) await tapUntil('#away-ok', '!document.querySelector("#eco-away.open")', 4);
  await ev('__lab.company.speed = 0;'); await sleep(1000);
  const built = await ev('const d = await __lab.buildDemo(); __lab.company.advanceHours(24); return { ok: d.ok, total: d.total, pipelines: d.pipelines };'); check('a real oil chain is built in the game', built.ok && built.total === 12, JSON.stringify(built));
  const J0 = await ev('return JSON.stringify({ n: __lab.pipes.toJSON(), cash: __lab.store.cash, h: __lab.company.hours });');
    check('the dev toolbar button is NOT what the player uses (hidden)', await ev('return document.getElementById("ndBtn").getBoundingClientRect().width === 0;'));
  await tapUntil('#eh-menu', 'document.getElementById("eco-sheet").classList.contains("open")'); await tapUntil('#es-tabs [data-tab=company]', 'document.getElementById("es-netdiag")'); check('the Company tab offers «فاحص الشبكة»', await ev('return !!document.getElementById("es-netdiag");')); await shot('02a-company-tab');
  await tapUntil('#es-netdiag', 'document.querySelector("#ndPanel .nd-sum")', 5); await sleep(800); await shot('02-panel');
  let r = await S(); console.log('oil scan: ' + JSON.stringify(r && r.s)); check('the oil network is scanned from the touch: at least the 12 buildings and 11 pipes, 0 faults', r && r.s.buildings >= 12 && r.s.lines >= 11 && r.s.faults === 0, JSON.stringify(r && r.s));
  check('the Central network is scanned too: its own block shows stations, segments, pumps and channels', r && r.c && r.c.present && r.c.stations > 0 && r.c.segments > 0 && r.c.pumps > 0 && r.c.channels === 6 && r.c.checked === r.c.stations + r.c.segments + r.c.pumps + 6, JSON.stringify(r && r.c));
  const cen0 = r && r.c;
  check('the scan changed nothing in the game', (await ev('return JSON.stringify({ n: __lab.pipes.toJSON(), cash: __lab.store.cash, h: __lab.company.hours });')) === J0);
  /* break the oil network (detach one pipe) and add a small Central network with deliberate faults */
  const inj = await ev(`const L = [...__lab.pipes.lines.values()][5]; L.b = null; __lab.pipes.rev++;
    const C = __lab.pipes.central, g = [...C.seg.values()].find(z => z.kind === 'main'), pu = [...C.pumps.values()][0]; C.setFault(g.id, 'GASOLINE', true); C.setPumpFault(pu.id, true); C.setChannel('DIESEL', 'CLOSED');
    return { pipe: L.id, seg: g.id, pump: pu.id };`);
  await sleep(500); check('after a change the panel says the result is stale', /تغيّرت الشبكة منذ آخر فحص/.test(await ev('__netdiag.render(); return __netdiag.panel.textContent;')));
  await tapUntil('#ndPanel [data-nd=scan]', 'document.querySelector("#ndPanel .nd-cen")', 5); await sleep(800); r = await S(); console.log('after: ' + JSON.stringify(r));
  check('the Central network is scanned again with the same element count', r.c && cen0 && r.c.checked === cen0.checked, JSON.stringify(r.c));
  check('the Central faults are found: a segment and a pump (confirmed), the DIESEL channel closed (warning)', r.c.faults >= cen0.faults + 2 && r.c.warnings >= cen0.warnings + 1, JSON.stringify(r.c));
  check('the detached oil pipe is found (confirmed)', r.s.faults >= 1, JSON.stringify(r.s)); await shot('03-panel-faults');
  const list = await ev('return JSON.stringify(__netdiag.st.rep.faults.map(f => ({ no: f.no, code: f.code, id: f.element.id, x: f.x, y: f.y, conf: f.confirmed, cen: !!f.central })));'), F = JSON.parse(list);
  for (const [code, id, shotName] of [['OPEN_END', inj.pipe, '04-jump-oil-pipe'], ['C_SEG_FAULT', inj.seg, '05-jump-central-segment'], ['C_PUMP_FAULT', inj.pump, '06-jump-central-pump']]) {
    const f = F.find(z => z.code === code && z.id === id); check('fault ' + code + ' on ' + id + ' is listed', !!f, JSON.stringify(f)); if (!f) continue;
    await tapUntil('#ndPanel .nd-fh[data-n="' + f.no + '"]', '__netdiag.st.sel === ' + f.no, 5); await sleep(1200);
    const cam = await ev('return { x: __wp.cam.x, y: __wp.cam.y, sel: __netdiag.st.sel };'); const d = Math.hypot(cam.x - (f.x + .5), cam.y - (f.y + .5)); check('tapping the fault jumps the map to (' + f.x + ', ' + f.y + ') and marks it', cam.sel === f.no && d < 6, JSON.stringify({ cam, d: Math.round(d * 10) / 10 }));
    await shot(shotName + '-panel'); await ev('__netdiag.st.open = false; __netdiag.render();'); await sleep(1500); await shot(shotName); await ev('__netdiag.st.open = true; __netdiag.render();'); }
  await tapUntil('#ndPanel [data-nd=flt][data-k=central]', 'document.querySelector("#ndPanel [data-nd=flt][data-k=central].on")', 4); check('the Central filter lists only Central findings', (await ev('return document.querySelectorAll("#ndPanel .nd-f").length;')) >= 3 && !/PIPE-/.test(await ev('return document.querySelector("#ndPanel .nd-list").innerText;')));
  await shot('07-central-filter');
  await tapUntil('#ndPanel [data-nd=close]', 'getComputedStyle(document.getElementById("ndPanel")).display === "none"', 4); check('the panel closes', true);
  check('no JavaScript errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('SUMMARY ' + res.filter(Boolean).length + '/' + res.length + ' PASS'); await c.close();
})().catch(e => console.log('FAIL crashed: ' + e.message));
