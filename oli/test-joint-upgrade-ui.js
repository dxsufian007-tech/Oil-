/* Joint upgrade + giant tank menu on the phone (412px): the button on the pipe card, the dialog (current / new / increase / cost / downtime / real limit), the confirmation, the refreshed card.
 *   NODE_PATH=/opt/npm-tools/node_modules node test-joint-upgrade-ui.js [shotDir] */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'); let ok = 0, bad = 0; const t = (n, c, x) => { if (c) { ok++; console.log('  ok  ' + n); } else { bad++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x).slice(0, 400)); } };
const SHOT = process.argv[2] || null;
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : f.endsWith('.webp') ? 'image/webp' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream' }); r.end(d); }); });
srv.listen(0, async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 412, height: 866 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }), p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message));
  const shot = async nm => { if (SHOT) await p.screenshot({ path: path.join(SHOT, nm + '.png') }); }, idle = () => p.waitForFunction(() => __wp.idle && __wp.idle(), null, { timeout: 60000 }), ev = (f, a) => p.evaluate(f, a), tx = sel => ev(s => (document.querySelector(s) || {}).innerText || '', sel), clean = s => s.replace(/[⁦-⁩‎‏]/g, '');
  await p.goto('http://localhost:' + srv.address().port + '/?lab=1&lang=ar'); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 }); await ev(() => { localStorage.clear(); __lab.reset(); __lab.store.cash = 5e9; __lab.company.speed = 0; });
  t('demo chain built', (await ev(() => __lab.buildDemo())).ok);
  const pick = await ev(() => { let best = null; for (const L of __lab.pipes.lines.values()) { if (!L.a || !L.b || L.path.length < 8) continue; if (!best || L.path.length > best.len) best = { id: L.id, len: L.path.length, mid: L.path[Math.floor(L.path.length / 2)] }; } if (best) { const L = __lab.pipes.lines.get(best.id); L.dia = 8; __lab.pipes.rev++; } return best; });
  const scr = (x, y) => ev(a => { const r = document.querySelector('canvas').getBoundingClientRect(); return [r.left + __wp.sx(a[0] + .5, a[1] + .5), r.top + __wp.sy(a[0] + .5, a[1] + .5)]; }, [x, y]);

  /* A. the giant tank is in the lab palette AND in the game's storage menu (root cause of "it disappeared": the old APK was built from a branch without it) */
  await p.getByText('تخزين النفط الخام', { exact: true }).first().tap(); await p.waitForTimeout(500);
  const pal = await ev(() => [...document.querySelectorAll('#bottombar [data-id], #palette [data-id], .cards [data-id]')].map(c => c.dataset.id)); const palTxt = await ev(() => document.body.innerText.includes('80,000,000') || document.body.innerText.includes('80M') || document.body.innerText.includes('$3B'));
  await ev(() => { const c = [...document.querySelectorAll('[data-id=crude_tank_g], [data-b=crude_tank_g], [data-k=crude_tank_g]')][0]; if (c) c.scrollIntoView({ inline: 'center' }); }); await shot('jt-0a-lab-palette');
  const pg = await ctx.newPage(); await pg.goto('http://localhost:' + srv.address().port + '/?lang=ar'); await pg.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 }); await pg.waitForTimeout(1500);
  await pg.evaluate(() => { document.querySelector('#g-nav [data-cat=storage]').click(); }); await pg.waitForTimeout(500);
  const menu = await pg.evaluate(() => [...document.querySelectorAll('#g-list .gcard')].map(c => c.dataset.id + (c.classList.contains('lock') ? '(lock)' : '')));
  t('A1 the game storage menu lists the giant tank crude_tank_g (once)', menu.filter(x => x.startsWith('crude_tank_g')).length === 1, menu);
  t('A2 it comes after the central crude tank, and the old tanks are all still listed', menu.findIndex(x => x.startsWith('crude_tank_g')) > menu.findIndex(x => x.startsWith('crude_tank_c')) && ['crude_tank_s', 'crude_tank_m', 'crude_tank_l', 'crude_tank_c'].every(k => menu.some(x => x.startsWith(k))), menu);
  await pg.evaluate(() => { const c = document.querySelector('#g-list [data-id=crude_tank_g]'); if (c) c.scrollIntoView({ block: 'center' }); }); await pg.waitForTimeout(300); if (SHOT) await pg.screenshot({ path: path.join(SHOT, 'jt-0-storage-menu.png') });
  const card = await pg.evaluate(() => { const c = document.querySelector('#g-list [data-id=crude_tank_g]'); return c ? c.innerText : ''; }); t('A3 the giant card states 22×22 and the price $3,000M', /22\s*[×x]\s*22/.test(card) && /3[,.]?0?0?0?M|3B|3,000/.test(card), card.slice(0, 160));
  await pg.close();
  /* B. put a junction on the pipe, then open the pipe card -> «تطوير الوصلات» */
  const scrT = scr; await ev(m => __wp.goto(m[0], m[1], .9), pick.mid); await idle(); await p.waitForTimeout(500); let q = await scrT(pick.mid[0], pick.mid[1]); await p.touchscreen.tap(q[0], q[1]); await p.waitForTimeout(400);
  const nb0 = await ev(() => __lab.store.list().length);
  await ev(() => { try { localStorage.setItem('x', '1'); } catch (e) {} }); const hasJ = await ev(() => !!document.getElementById('bPipeJoint'));
  if (hasJ) { await p.locator('#bPipeJoint').tap(); await p.waitForTimeout(800); }
  const J = await ev(() => { const l = __lab.store.list().filter(b => b.d === 'junction'); return l.length ? { id: l[l.length - 1].id, x: l[l.length - 1].x, y: l[l.length - 1].y } : null; });
  t('B0 a junction now sits on the pipe', !!J && (await ev(() => __lab.store.list().length)) === nb0 + 1, J);
  await ev(j => __wp.goto(j.x, j.y, .9), J); await idle(); await p.waitForTimeout(500);
  const near = await ev(j => { const out = []; for (const L of __lab.pipes.lines.values()) if ((L.a && L.a.b === j.id) || (L.b && L.b.b === j.id)) out.push({ id: L.id, p: L.path[Math.floor(L.path.length / 2)], len: L.path.length }); out.sort((a, b) => b.len - a.len); return out; }, J);
  t('B1 the junction has two pipes attached', near.length === 2, near);
  if (await ev(() => !!document.getElementById('bPipeEnd'))) { await p.locator('#bPipeEnd').tap(); await p.waitForTimeout(300); }
  q = await scrT(near[0].p[0], near[0].p[1]); await ev(m => __wp.goto(m[0], m[1], .9), near[0].p); await idle(); await p.waitForTimeout(400); q = await scrT(near[0].p[0], near[0].p[1]); await p.touchscreen.tap(q[0], q[1]); await p.waitForTimeout(400);
  const jb = await ev(() => { const e = document.getElementById('bJointUp'); return e ? e.textContent : null; }); t('B2 the pipe card has the separate button «🔩 تطوير الوصلات»', jb === '🔩 تطوير الوصلات', jb); await shot('jt-1-pipe-card');
  const cashB = await ev(() => __lab.store.cash), geoB = await ev(() => JSON.stringify([...__lab.pipes.lines.values()].map(L => [L.id, L.a, L.b, L.path, L.dia])));
  await p.locator('#bJointUp').tap(); await p.waitForTimeout(300); let d = clean(await tx('#jointUp'));
  t('C1 the dialog shows the level (1 of 3), nominal capacity 60,000 and the ports', /المستوى 1 من 3/.test(d) && /60,000/.test(d) && /المنافذ 2 مستخدمة من 4/.test(d), d.slice(0, 400));
  t('C2 it shows 60,000 ← 100,000 (+40,000), the price $80,000, balance before/after, before confirming', /60,000 ← 100,000/.test(d) && /\+40,000/.test(d) && /\$80,000/.test(d) && /الرصيد/.test(d), d);
  t('C3 it separates nominal capacity from real flow and names the limiting element', /السعة الاسمية ليست تدفقاً/.test(d) && /القيد الحالي/.test(d) && /أقصى تدفق ممكن عبرها/.test(d), d);
  t('C4 nothing was changed yet (level still 1)', (await ev(id => !__lab.store.get(id).lv, J.id))); await shot('jt-2-dialog');
  await ev(() => { const o = OliIndustry.upgradeJoint; window.__rj = null; window.__o = o; OliIndustry.upgradeJoint = (...a) => { const c0 = __lab.store.cash, r = o(...a); window.__rj = { c0, c1: __lab.store.cash, r }; return r; }; });
  await p.locator('#jointUp [data-ju="x"]').first().tap(); await p.waitForTimeout(250);
  t('C5 cancel closes the dialog and changes nothing (no upgrade call, level unchanged)', !(await ev(() => document.getElementById('jointUp'))) && (await ev(() => window.__rj)) == null && (await ev(id => !__lab.store.get(id).lv, J.id)));
  await p.locator('#bJointUp').tap(); await p.waitForTimeout(250);
  await p.locator('#jointUp [data-ju="go"]').tap(); await p.waitForTimeout(400);
  t('D1 confirm: level 2, charged exactly $80,000 once, capacity 100,000', (await ev(id => __lab.store.get(id).lv, J.id)) === 2 && (await ev(() => __rj.c0 - __rj.c1)) === 80000 && (await ev(() => __rj.r.capacityAfter)) === 100000);
  t('D2 pipes, ends, paths and diameters are byte-identical after the upgrade', (await ev(() => JSON.stringify([...__lab.pipes.lines.values()].map(L => [L.id, L.a, L.b, L.path, L.dia])))) === geoB);
  t('D3 the dialog closed', !(await ev(() => document.getElementById('jointUp')))); await shot('jt-3-after');
  await p.locator('#bJointUp').tap(); await p.waitForTimeout(250); d = clean(await tx('#jointUp')); t('D4 reopening shows level 2 of 3 and 100,000 ← 300,000 for $240,000 (the second tier is charged separately)', /المستوى 2 من 3/.test(d) && /100,000 ← 300,000/.test(d) && /\$240,000/.test(d), d.slice(0, 300)); await shot('jt-4-level2');
  await ev(() => { __lab.store.cash = 1000; }); await p.locator('#jointUp [data-ju="x"]').first().tap(); await p.locator('#bJointUp').tap(); await p.waitForTimeout(250);
  t('E1 without cash the confirm button is disabled', await ev(() => document.querySelector('#jointUp [data-ju="go"]').disabled)); await shot('jt-5-nocash'); await p.locator('#jointUp [data-ju="x"]').first().tap();
  t('F1 the dialog fits 412px with no sideways scroll', await ev(() => document.documentElement.scrollWidth <= innerWidth + 1));
  t('no page errors', !errs.length, errs); console.log(ok + ' passed, ' + bad + ' failed'); await b.close(); srv.close(); process.exit(bad ? 1 : 0);
});
