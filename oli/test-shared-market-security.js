/* S5 security: account takeover, token reuse, session expiry, lockout, rate limits, tampering with balances / oil / trade log, data-file integrity. Real HTTP server. */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), crypto = require('crypto');
const { createServer } = require('./shared-market/server.js'), { SharedClient } = require('./shared-market/client.js');
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
const SECRET = 'security-test-secret-0123456789', PW = 'correct-horse-battery', f = path.join(os.tmpdir(), 'oli-sec-' + process.pid + '.json'); let clock = 1e12; const now = () => clock;
const raw = (port, p, body, headers, method) => new Promise((res, rej) => { const d = typeof body === 'string' ? body : JSON.stringify(body || {}); const q = http.request({ host: '127.0.0.1', port, path: p, method: method || 'POST', headers: Object.assign({ 'content-type': 'application/json', 'content-length': Buffer.byteLength(d) }, headers || {}) }, r => { let s = ''; r.on('data', c => s += c); r.on('end', () => { let j = {}; try { j = JSON.parse(s); } catch (e) {} j.status = r.statusCode; res(j); }); }); q.on('error', rej); q.end(d); });
(async () => {
  try { fs.unlinkSync(f); } catch (e) {}
  const mk = (o) => createServer(Object.assign({ file: f, secret: SECRET, now, cfg: { startOil: 10000 }, rateLimit: 5000, auth: { regPerIpHour: 1000, authPerIpMin: 100000 } }, o || {}));
  let srv = mk(); await new Promise(r => srv.listen(0, r)); const P = () => srv.address().port, base = () => 'http://127.0.0.1:' + P();
  const reg = async (id, pw) => { const c = new SharedClient(base(), id); const r = await c.register(pw || PW); assert(r.ok, JSON.stringify(r)); const l = await c.login(pw || PW); assert(l.ok); return c; };
  const alice = await reg('alice'), bobby = await reg('bobby'); await alice.place({ side: 'SELL', type: 'LIMIT', price: 80, qty: 500 }); await bobby.place({ side: 'BUY', type: 'MARKET', qty: 200 });
  // 1 takeover
  const evil = new SharedClient(base(), 'alice'); let r = await evil.register('attacker-password-1'); ok(!r.ok && r.code === 'EXISTS', '1a registering an existing id is refused (no takeover by knowing the name)');
  r = await new SharedClient(base(), 'ALICE').register('attacker-password-1'); ok(!r.ok && r.code === 'EXISTS', '1b the same with different letter case is refused');
  r = await raw(P(), '/join', { id: 'alice' }); ok(r.status !== 200 && !r.token && !r.access, '1c the old open /join endpoint no longer hands out anything');
  r = await evil.login('attacker-password-1'); ok(!r.ok && r.code === 'BAD_LOGIN' && !evil.access, '1d wrong password does not log in');
  const un = await new SharedClient(base(), 'nobodyhere').login('whatever-password'); ok(JSON.stringify({ c: un.code, e: un.error, s: un.status }) === JSON.stringify({ c: r.code, e: r.error, s: r.status }), '1e unknown id and wrong password give the identical answer (no account enumeration by login)');
  r = await raw(P(), '/account', {}, { 'x-player': 'alice', 'x-token': 'x'.repeat(64) }); ok(r.status === 401, '1f the old x-player / x-token headers give nothing');
  r = await raw(P(), '/account', {}, { authorization: 'Bearer ' + bobby.access, 'x-player': 'alice' }); ok(r.ok && r.account.id === 'bobby', '1g identity comes from the token only: a spoofed x-player header is ignored');
  for (const t of ['', 'Bearer ', 'Bearer abc', 'Bearer ' + 'A'.repeat(43), 'Basic ' + alice.access, alice.access]) r = await raw(P(), '/account', {}, t ? { authorization: t } : {}), assert(r.status === 401, 'bad auth ' + t);
  ok(true, '1h missing / malformed / random / wrong-scheme tokens are all 401');
  // 2 passwords & ids
  r = await new SharedClient(base(), 'weakling').register('short'); ok(r.code === 'WEAK_PASSWORD', '2a short password refused');
  r = await new SharedClient(base(), 'mallory1').register('xxMallory1xx'); ok(r.code === 'WEAK_PASSWORD', '2b password containing the id refused');
  for (const id of ['__proto__', 'constructor', 'prototype', 'a', '1abc', 'x y z', '../etc', 'a'.repeat(40)]) { const q = await raw(P(), '/register', { id, password: PW }); assert(!q.ok, 'id ' + id); } ok(true, '2c reserved / malformed ids refused (incl. __proto__, constructor)');
  const u1 = await reg('twin1', 'same-password-123'), u2 = await reg('twin2', 'same-password-123'); const U = srv.auth().users; ok(U.twin1.hash !== U.twin2.hash && U.twin1.salt !== U.twin2.salt && U.twin1.hash.length === 64, '2d the same password gives different salted scrypt hashes');
  // 3 files
  srv.saveNow(); const disk = fs.readFileSync(f, 'utf8'); ok(!disk.includes(PW) && !disk.includes(alice.access) && !disk.includes(alice.refreshTok) && !disk.includes(SECRET), '3a the data file holds no password, no access/refresh token and no server secret in clear'); ok((fs.statSync(f).mode & 0o077) === 0, '3b the data file is readable by its owner only (0600)');
  // 4 lockout
  const vic = await reg('victim1'); const att = new SharedClient(base(), 'victim1'); for (let i = 0; i < 5; i++) await att.login('wrong-password-' + i);
  r = await att.login(PW); ok(!r.ok && r.code === 'LOCKED', '4a after 5 wrong passwords the account is locked, even the right password is refused');
  clock += 16 * 60e3; r = await att.login(PW); ok(r.ok, '4b the lock expires after 15 minutes');
  const par = await Promise.all(Array.from({ length: 30 }, (_, i) => new SharedClient(base(), 'bobby').login('guess-number-' + i))); ok(par.every(x => !x.ok) && (await new SharedClient(base(), 'bobby').login(PW)).code === 'LOCKED', '4c 30 parallel password guesses cannot get in and lock the account');
  clock += 16 * 60e3;
  // 5 expiry / refresh / reuse
  const sess = new SharedClient(base(), 'alice'); await sess.login(PW); const a1 = sess.access, r1 = sess.refreshTok; ok((await raw(P(), '/account', {}, { authorization: 'Bearer ' + a1 })).ok, '5a a fresh access token works');
  clock += 16 * 60e3; ok((await raw(P(), '/account', {}, { authorization: 'Bearer ' + a1 })).status === 401, '5b the access token expires after 15 minutes');
  const rf = await sess.refresh(); ok(rf.ok && rf.access !== a1 && rf.refresh !== r1, '5c a refresh token gives a NEW access and a NEW refresh token');
  ok((await raw(P(), '/account', {}, { authorization: 'Bearer ' + rf.access })).ok && (await raw(P(), '/account', {}, { authorization: 'Bearer ' + a1 })).status === 401, '5d the new access works, the old one stays dead');
  const stolen = await raw(P(), '/refresh', { refresh: r1 }); ok(stolen.code === 'REUSE_DETECTED', '5e re-using an already-used refresh token is detected');
  ok((await raw(P(), '/account', {}, { authorization: 'Bearer ' + rf.access })).status === 401 && (await raw(P(), '/refresh', { refresh: rf.refresh })).status === 401, '5f ...and the whole session (including the legitimate newer tokens) is revoked');
  await sess.login(PW); clock += 8 * 864e5; ok((await raw(P(), '/refresh', { refresh: sess.refreshTok })).code === 'EXPIRED' || (await raw(P(), '/refresh', { refresh: sess.refreshTok })).status === 401, '5g a refresh token expires after 7 days');
  const abs = new SharedClient(base(), 'alice'); await abs.login(PW); let t0 = clock; for (let i = 0; i < 5; i++) { clock += 6 * 864e5; const x = await abs.refresh(); if (!x.ok) break; } clock = t0 + 31 * 864e5; ok(!(await abs.refresh()).ok && (await raw(P(), '/account', {}, { authorization: 'Bearer ' + abs.access })).status === 401, '5h a session can never be kept alive beyond 30 days by refreshing');
  const lo = new SharedClient(base(), 'alice'); await lo.login(PW); await lo.logout(); ok((await raw(P(), '/account', {}, { authorization: 'Bearer ' + lo.access })).status === 401 && (await raw(P(), '/refresh', { refresh: lo.refreshTok })).status === 401, '5i logout kills the access token and the refresh token');
  const tokens = new SharedClient(base(), 'alice'); await tokens.login(PW); const oth = new SharedClient(base(), 'bobby'); await oth.login(PW); ok((await raw(P(), '/account', {}, { authorization: 'Bearer ' + tokens.refreshTok })).status === 401, '5j a refresh token cannot be used as an access token');
  // 6 rate limits
  const s2 = createServer({ secret: SECRET, now, auth: { regPerIpHour: 2, authPerIpMin: 100000 } }); await new Promise(r => s2.listen(0, r)); const p2 = s2.address().port;
  const rr = []; for (let i = 0; i < 4; i++) rr.push(await raw(p2, '/register', { id: 'newuser' + i, password: PW }, { 'x-forwarded-for': '9.9.9.' + i })); ok(rr[0].ok && rr[1].ok && rr[2].code === 'RATE' && rr[3].code === 'RATE', '6a registrations are capped per address, and a spoofed X-Forwarded-For does not evade it');
  s2.close(); const s3 = createServer({ secret: SECRET, now, auth: { authPerIpMin: 5 } }); await new Promise(r => s3.listen(0, r)); const p3 = s3.address().port; const lr = []; for (let i = 0; i < 8; i++) lr.push((await raw(p3, '/login', { id: 'ghost', password: 'x' + i })).code); ok(lr.slice(5).every(c => c === 'RATE'), '6b login attempts are capped per address'); s3.close();
  // 7 input abuse
  ok((await raw(P(), '/register', '{bad json')).code === 'BAD_JSON' && (await raw(P(), '/register', '[1,2]')).code === 'BAD_JSON' && (await raw(P(), '/depth', 'null', {}, 'POST')).code === 'BAD_JSON', '7a malformed JSON / arrays / null are rejected cleanly');
  const big = await raw(P(), '/register', JSON.stringify({ id: 'bigone', password: 'x'.repeat(30000) })).catch(e => ({ status: 0 })); ok(big.status !== 200, '7b an oversized body is cut off');
  ok((await raw(P(), '/depth', {}, {}, 'DELETE')).status === 405, '7c unexpected HTTP methods are refused'); ok((await raw(P(), '/health', {}, {}, 'GET')).ok, '7d health answers');
  // 8 tampering through the API
  const A = new SharedClient(base(), 'alice'); await A.login(PW); const B = new SharedClient(base(), 'bobby'); await B.login(PW); const cash0 = (await A.account()).account.cash, oil0 = (await A.account()).account.oil;
  r = await A.place({ side: 'SELL', type: 'LIMIT', price: 80, qty: 1e12, oil: 1e12 }); ok(!r.ok, '8a selling oil you do not have is refused');
  r = await A._req('/place', { key: 'abcdef123456', side: 'BUY', type: 'MARKET', qty: 1, cash: 1e15, oil: 1e15, fee: 0, price: 0.01, id: 'bobby', pid: 'bobby' }, true); const aa = (await A.account()).account; ok(aa.cash <= cash0 && aa.oil <= oil0 + 1, '8b extra body fields (cash / oil / fee / price / id) change nothing');
  const bo = await B.place({ side: 'SELL', type: 'LIMIT', price: 99, qty: 10 }); r = await A.cancel(bo.order.id); ok(!r.ok && (await B.account()).orders.some(o => o.id === bo.order.id), '8c a player cannot cancel another player\'s order');
  const kk = 'shared-key-123456'; const ra = await A.place({ side: 'SELL', type: 'LIMIT', price: 120, qty: 1 }, kk), rb = await B.place({ side: 'SELL', type: 'LIMIT', price: 121, qty: 1 }, kk); ok(ra.ok && rb.ok && ra.order.id !== rb.order.id && !rb.replayed, '8d the same idempotency key used by two different players never collides or leaks the other\'s result');
  r = await A.place({ side: 'BUY', type: 'LIMIT', price: 0.001, qty: 1 }); ok(!r.ok, '8e prices off the tick grid are refused');
  r = await A.trades(); ok(r.trades.every(t => t.buyer === 'alice' || t.seller === 'alice'), '8f a player only reads their own trades');
  ok(srv.check().ok, '8h books still close after all attack attempts: ' + srv.check().bad);
  // 9 data-file integrity
  srv.saveNow(); await new Promise(r => srv.close(r)); const good = fs.readFileSync(f, 'utf8'); const tryStart = (txt, secret) => { fs.writeFileSync(f, txt); try { const s = createServer({ file: f, secret: secret || SECRET, now }); s.close && 0; return 'started'; } catch (e) { return e.message; } };
  ok(tryStart(good) === 'started', '9a the untouched file starts fine');
  const ed = (fn) => { const j = JSON.parse(good), m = JSON.parse(j.market); fn(m); j.market = JSON.stringify(m); return JSON.stringify(j); };
  ok(/verification/.test(tryStart(ed(m => { m.players.alice.cash += 1e6; }))), '9b adding cash to a player by editing the file -> refuses to start');
  ok(/verification/.test(tryStart(ed(m => { m.players.alice.oil += 1000; }))), '9c adding oil by editing the file -> refuses to start');
  ok(/verification/.test(tryStart(ed(m => { m.players.alice.cash += 1e6; m.players.bobby.cash -= 1e6; }))), '9d moving money between two players (total unchanged) is caught by replaying the trade log');
  ok(/verification/.test(tryStart(ed(m => { m.trades[0].qty = 1; }))), '9e editing a trade -> refuses to start');
  ok(/verification/.test(tryStart(ed(m => { const t = m.trades[0]; t.qty = 1; t.hash = crypto.createHash('sha256').update(JSON.stringify((({ hash, ...x }) => x)(t))).digest('hex'); }))), '9f editing a trade AND recomputing a plain hash (no key) -> still caught');
  ok(/verification/.test(tryStart(ed(m => { m.trades.pop(); }))), '9g deleting the last trade from the log -> refuses to start');
  ok(/verification/.test(tryStart(good, 'a-different-secret-0123456789')), '9h the right data under a wrong secret does not verify');
  ok(/OLI_SECRET/.test((() => { try { createServer({ file: null }); } catch (e) { return e.message; } })()) && /OLI_SECRET/.test((() => { try { createServer({ secret: 'short' }); } catch (e) { return e.message; } })()), '9i the server refuses to run without a real secret');
  fs.writeFileSync(f, good); srv = mk(); await new Promise(r => srv.listen(0, r)); const A3 = new SharedClient(base(), 'alice'); A3.access = A.access; ok((await A3.account()).ok, '9j after a clean restart live sessions still work');
  console.log(n + ' passed'); srv.close(); try { fs.unlinkSync(f); } catch (e) {} process.exit(0);
})().catch(e => { console.error('FAIL', e.message, (e.stack || '').split('\n')[1]); process.exit(1); });
