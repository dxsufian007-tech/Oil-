// World map preview on a real Android system (emulator, Android 14, the actual APK and its WebView). The page is driven and measured over DevTools:
// generation time, frame times while panning and zooming at FAR / MEDIUM / CLOSE, memory, screenshots. Emulator = software GL: use the numbers as an upper bound, not as a phone.
const CDP = require('chrome-remote-interface'); const fs = require('fs');
const results = []; let fails = 0, out = {};
const check = (n, ok, info) => { results.push({ n, ok: !!ok }); if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (info ? '  — ' + info : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let t = null; for (let i = 0; i < 20 && !t; i++) { try { t = (await CDP.List({ port: 9222 })).find(x => x.type === 'page'); } catch (e) {} if (!t) await sleep(1500); }
  if (!t) { console.log('FAIL no WebView page'); return; }
  const client = await CDP({ port: 9222, target: t, local: true }), { Runtime, Page } = client; await Runtime.enable(); await Page.enable();
  const errors = []; Runtime.exceptionThrown(e => errors.push('exception: ' + (e.exceptionDetails.exception && e.exceptionDetails.exception.description || e.exceptionDetails.text))); Runtime.consoleAPICalled(e => { if (e.type === 'error') errors.push(e.args.map(a => a.value || a.description).join(' ')); });
  const ev = async expr => { const r = await Runtime.evaluate({ expression: '(async () => { ' + expr + ' })()', awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value; };
  const shot = async name => { try { const r = await Page.captureScreenshot({ format: 'png' }); fs.writeFileSync('results/' + name + '.png', Buffer.from(r.data, 'base64')); } catch (e) { console.log('shot failed ' + name); } };
  let ready = false; for (let i = 0; i < 60 && !ready; i++) { ready = await ev('return !!window.__wp;').catch(() => false); if (!ready) await sleep(1000); } check('the preview page is running in the WebView', ready);
  if (!ready) return;
  const env = await ev('return { ua: navigator.userAgent, dpr: devicePixelRatio, w: innerWidth, h: innerHeight, mem: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };'); console.log('ENV ' + JSON.stringify(env)); out.env = env;
  let done = false; for (let i = 0; i < 240 && !done; i++) { done = await ev('return window.__wp.genLeft() === 0;'); if (!done) await sleep(1000); }
  const gen = await ev('return { ms: window.__wp.stats.genDoneMs, built: window.__wp.ready() };'); out.generation = gen; check('the whole world (600 chunks) is generated in the background', done && gen.built >= 600, gen.built + ' chunks, ' + gen.ms + ' ms after page start (software-rendered emulator)');
  const start = await ev('const w = window.__wp.world, r = w.regions.find(r => r.starter); return { x: r.x0 + 160, y: r.y0 + 160 };');
  const level = async (name, z, x, y) => {
    await ev(`window.__wp.goto(${x}, ${y}, ${z});`); let left = 1; for (let i = 0; i < 90 && left; i++) { await sleep(300); left = await ev('return window.__wp.hiLeft();'); }
    const d = await ev('const w = window.__wp, a = []; for (let i = 0; i < 40; i++) { const t = performance.now(); w.draw(); a.push(performance.now() - t); } a.sort((p, q) => p - q); return { avg: a.reduce((p, q) => p + q, 0) / a.length, p95: a[Math.floor(a.length * .95)], max: a[a.length - 1], level: w.level() };');
    const pan = await ev(`return await new Promise(res => { const w = window.__wp, d = []; let last = performance.now(), n = 0, t0 = last; (function f() { const t = performance.now(); d.push(t - last); last = t; w.goto(w.cam.x + (n % 2 ? -1 : 1) * 6 / (w.cam.z * 40 + 1), w.cam.y + 3 / (w.cam.z * 40 + 1)); n++; if (t - t0 < 3000) requestAnimationFrame(f); else { d.shift(); d.sort((a, b) => a - b); res({ frames: d.length, fps: d.length / 3, avg: d.reduce((a, b) => a + b, 0) / d.length, p95: d[Math.floor(d.length * .95)], max: d[d.length - 1], long: d.filter(x => x > 50).length }); } })(); });`);
    out[name] = { draw: d, pan }; await shot('map-' + name);
    check(name.toUpperCase() + ': level is ' + name.toUpperCase() + ', draw avg ' + d.avg.toFixed(1) + ' ms (p95 ' + d.p95.toFixed(1) + ', max ' + d.max.toFixed(1) + '), panning ' + pan.fps.toFixed(0) + ' fps, frame p95 ' + pan.p95.toFixed(0) + ' ms, max ' + pan.max.toFixed(0) + ' ms, frames over 50 ms: ' + pan.long, d.level === name.toUpperCase());
  };
  await level('far', 0.0045, 960, 640); await level('far_regions', 0.03, 960, 640); await level('medium', 0.30, start.x, start.y); await level('close', 1.0, start.x, start.y);
  await ev('window.__wp.ui.scale = true; window.__wp.goto(window.__wp.cam.x, window.__wp.cam.y, 0.9);'); await sleep(1500); await shot('map-scale-chart'); await ev('window.__wp.ui.scale = false;');
  const mem = await ev('return performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;'); out.memoryMB = mem; check('JS heap after the whole test: ' + mem + ' MB', mem == null || mem < 500);
  const worst = Math.max(out.far.draw.avg, out.medium.draw.avg, out.close.draw.avg); check('draw time stays interactive at every level (avg < 60 ms even on the software emulator)', worst < 60, 'worst avg ' + worst.toFixed(1) + ' ms');
  check('no JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  fs.writeFileSync('results/map-perf.json', JSON.stringify(out, null, 1)); console.log('MAP SUMMARY ' + results.filter(r => r.ok).length + '/' + results.length + ' PASS'); await client.close();
})().catch(e => { console.log('FAIL crashed: ' + e.message); });
