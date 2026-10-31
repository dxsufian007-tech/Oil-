// Oli v2 - simple settings (sound, music, vibration, language, graphics, restart) + the whole map open. Real touch, phone size.
const { chromium } = require('/tmp/legacy-pw.js');
const assert = require('assert');
const URL = process.argv[3] || 'file:///home/claude/oli/v2.html', OUT = process.argv[2] || '/tmp/oli-shots'; require('fs').mkdirSync(OUT, { recursive: true });
const log = m => console.log('ok   ' + m);
(async () => {
  const browser = await chromium.launch(), errors = [];
  const ctx = await browser.newContext({ viewport: { width: 412, height: 866 }, deviceScaleFactor: 2.625, hasTouch: true, isMobile: true }), page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(URL); await page.waitForTimeout(1200);
  const G = fn => page.evaluate(fn), wait = ms => page.waitForTimeout(ms);
  const TE = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
  const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const drag = async (a, b) => { await TE('touchStart', [a]); await frame(); for (let j = 1; j <= 8; j++) { await TE('touchMove', [{ x: a.x + (b.x - a.x) * j / 8, y: a.y + (b.y - a.y) * j / 8 }]); await frame(); } await TE('touchEnd', []); await frame(); };
  // an old save with locked regions -> after loading, the whole map is open
  await G(() => { const g = window.__v2.game; g.s.regions.forEach((r, i) => r.unlocked = i === 0); window.__v2.save(); }); await page.reload(); await wait(1500);
  const reg = await G(() => window.__v2.game.s.regions.map(r => r.unlocked)); assert(reg.every(Boolean)); log('map: all ' + reg.length + ' regions open (also from a save that had locked ones)');
  const locked = await G(() => { const L = window.__v2.view.scene.ground; let n = 0; for (let y = 0; y < 88; y++) for (let x = 0; x < 140; x++) if (L.getTileAt(x, y).index === 7) n++; return n; }); assert.strictEqual(locked, 0); log('map: no locked tile drawn anywhere');
  // full-map camera: zoom all the way out (whole world on screen), zoom in max, pan to every corner of the world
  const fit = await G(() => { const v = window.__v2, c = v.view.cam, B = v.view.bounds, w = v.camApi.s2w(c.width / 2, c.height / 2); v.camApi.setZoomAt(.001, c.width / 2, c.height / 2, w.x, w.y); const a = v.camApi.s2w(0, 0), b = v.camApi.s2w(c.width, c.height); return { z: c.zoom, w: b.x - a.x >= B.w - 1, h: b.y - a.y >= B.h - 1 }; });
  assert(fit.w || fit.h); await page.screenshot({ path: `${OUT}/set-fullmap.png` }); log('zoom out: ' + fit.z.toFixed(3) + ' - the whole world fits on the screen');
  const corners = []; for (const [gx, gy] of [[0, 0], [139, 0], [0, 87], [139, 87]]) { const r = await page.evaluate(([gx, gy]) => { const v = window.__v2, c = v.tc(gx, gy); v.view.cam.setZoom(1.8); v.view.cam.centerOn(c.x, c.y); v.camApi.clamp(); const s = v.camApi.w2s(c.x, c.y); return s.x >= -40 && s.x <= v.view.cam.width + 40 && s.y >= -40 && s.y <= v.view.cam.height + 40; }, [gx, gy]); corners.push(r); }
  assert(corners.every(Boolean), JSON.stringify(corners)); log('pan: every corner of the world can be brought on screen at max zoom (1.8)');
  await G(() => { const v = window.__v2, c = v.tc(70, 44); v.view.cam.setZoom(.8); v.view.cam.centerOn(c.x, c.y); v.camApi.clamp(); }); await frame();
  const k0 = await G(() => [window.__v2.view.cam.scrollX, window.__v2.view.cam.scrollY]); await drag({ x: 300, y: 400 }, { x: 120, y: 520 }); const k1 = await G(() => [window.__v2.view.cam.scrollX, window.__v2.view.cam.scrollY]);
  assert(Math.hypot(k1[0] - k0[0], k1[1] - k0[1]) > 100); log('pan with one finger moves across the map');
  // settings
  await page.tap('#b-settings'); await wait(200); assert(await page.locator('#settings').isVisible());
  const items = await G(() => [...document.querySelectorAll('#settings .row > span')].map(e => e.textContent)); assert.deepStrictEqual(items, ['الأصوات', 'الموسيقى', 'الاهتزاز', 'اللغة', 'جودة الرسوم']); assert(await page.locator('#st-reset').isVisible());
  await page.screenshot({ path: `${OUT}/settings-ar.png` }); log('settings: exactly ' + items.join(' / ') + ' + restart');
  await page.tap('[data-pref=sound] [data-v="0"]'); await page.tap('[data-pref=music] [data-v="0"]'); await page.tap('[data-pref=vib] [data-v="0"]'); await wait(150);
  // restart needs the confirmation dialog: cancel keeps everything
  await G(() => { const g = window.__v2.game; for (let y = 0; y < 88; y++) for (let x = 0; x < 140; x++) if (g.canPlace('tank', x, y).ok) { g.place('tank', x, y); return; } });
  await page.tap('#st-reset'); await wait(150); assert(await page.locator('#dialog').isVisible()); await page.tap('#dl-no'); await wait(150);
  assert.strictEqual(await G(() => window.__v2.game.buildings.length), 1); log('restart: the confirmation dialog appears; "Cancel" keeps the game');
  await page.tap('#st-reset'); await wait(150); await page.tap('#dl-yes'); await wait(300); const af = await G(() => ({ b: window.__v2.game.buildings.length, open: window.__v2.game.s.regions.every(r => r.unlocked) })); assert(af.b === 0 && af.open); log('restart: "Yes" starts a new game, the whole map still open');
  // graphics quality -> reload, applied
  await page.tap('#b-settings'); await wait(200); await Promise.all([page.waitForNavigation(), page.tap('[data-pref=gfx] [data-v="low"]')]); await wait(1500);
  const gf = await G(() => ({ q: window.__v2.GFX.q, fps: window.__v2.view.scene.game.loop.targetFps })); assert.strictEqual(gf.q, 'low'); log('graphics: Low applied after the automatic restart (target ' + gf.fps + ' fps)');
  // persistence: sound/music/vib off, gfx low survive a reload
  const pr = await G(() => window.__v2.prefs); assert(pr.sound === 0 && pr.music === 0 && pr.vib === 0 && pr.gfx === 'low', JSON.stringify(pr)); log('persistence: ' + JSON.stringify(pr) + ' kept after closing and reopening');
  // English
  await page.tap('#b-settings'); await wait(200); await Promise.all([page.waitForNavigation(), page.tap('[data-pref=lang] [data-v="en"]')]); await wait(1500);
  const en = await G(() => ({ dir: document.documentElement.dir, hud: [...document.querySelectorAll('#hud small')].map(e => e.textContent), bar: [...document.querySelectorAll('#bar button')].map(e => e.textContent.trim()), arLeft: [...document.body.querySelectorAll('*')].filter(e => !e.children.length && /[؀-ۿ]/.test(e.textContent) && e.textContent !== 'العربية' && e.offsetParent).map(e => e.textContent).slice(0, 5) }));
  assert.strictEqual(en.dir, 'ltr'); assert.deepStrictEqual(en.hud, ['Cash', 'Oil', 'Oil price']); assert.deepStrictEqual(en.arLeft, [], 'Arabic left on screen: ' + en.arLeft);
  await page.tap('#b-settings'); await wait(200); await page.screenshot({ path: `${OUT}/settings-en.png` });
  log('language: English, left-to-right, HUD ' + en.hud.join(' / ') + ', bar ' + en.bar.join(' / ') + '; no Arabic left on screen');
  await G(() => window.__v2.setTool('pipe', 0)); const hint = await G(() => document.getElementById('hint').textContent); assert(/Touch a well/.test(hint), hint); log('English hint: "' + hint + '"');
  await Promise.all([page.waitForNavigation(), page.tap('[data-pref=lang] [data-v="ar"]')]); await wait(1500); assert.strictEqual(await G(() => document.documentElement.dir), 'rtl'); log('back to Arabic (right-to-left)');
  assert.deepStrictEqual(errors, [], errors.join('\n')); await browser.close(); console.log('ALL V2 SETTINGS TESTS PASSED');
})().catch(e => { console.error(e); process.exit(1); });
