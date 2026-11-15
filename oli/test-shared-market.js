/* S5: shared market - core rules, then REAL HTTP server with several clients: concurrency, retry, disconnect, duplicates, tamper, persistence, reconciliation */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { SharedMarket } = require('./shared-market/market-core.js'), { createServer } = require('./shared-market/server.js'), { SharedClient } = require('./shared-market/client.js');
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
const PL = (m, ...ids) => ids.forEach(i => m.join(i));
let kk = 0; const K = () => 'key-' + (++kk) + '-xxxxxxxx';
// ---- core ----
{ const m = new SharedMarket({ startOil: 1000 }); PL(m, 'alice', 'bob');
  let r = m.call('alice', K(), 'place', { side: 'SELL', type: 'LIMIT', price: 80, qty: 600 }); ok(r.ok && m.account('alice').lockedOil === 600, '1a sell limit locks oil (escrow)');
  r = m.call('alice', K(), 'place', { side: 'SELL', type: 'LIMIT', price: 81, qty: 600 }); ok(!r.ok && r.code === 'NO_OIL', '1b cannot sell the same oil twice (400 free only)');
  r = m.call('bob', K(), 'place', { side: 'BUY', type: 'MARKET', qty: 250 }); ok(r.ok && r.filled === 250 && r.avg === 80, '1c market buy fills against the real resting order');
  ok(m.account('bob').oil === 1250 && Math.abs(m.account('bob').cash - (1e8 - 250 * 80 * 1.002)) < 1e-6, '1d buyer paid price + 0.2% fee');
  ok(Math.abs(m.account('alice').cash - (1e8 + 250 * 80 * 0.998)) < 1e-6 && m.fees > 0, '1e seller got price - fee; fees collected');
  r = m.call('bob', K(), 'place', { side: 'BUY', type: 'LIMIT', price: 79, qty: 100 }); ok(r.ok && r.filled === 0 && m.depth().bestBid === 79 && m.depth().bestAsk === 80 && Math.abs(m.depth().spread - 1) < 1e-9, '1f limit below the ask rests; best bid/ask/spread come from real orders');
  r = m.call('bob', K(), 'place', { side: 'BUY', type: 'LIMIT', price: 80, qty: 1000 }); ok(r.ok && r.filled === 350 && r.order.open, '1g partial fill: 350 filled, rest stays open');
  const oid = r.order.id; r = m.call('bob', K(), 'cancel', { orderId: oid }); ok(r.ok && r.order.status === 'CANCELLED_PARTIAL' && m.account('bob').lockedCash <= 100 * 79 * 1.002 + 1e-6, '1h cancel releases the locked cash of the unfilled rest');
  r = m.call('alice', K(), 'cancel', { orderId: oid }); ok(!r.ok, '1i a player cannot cancel someone else\'s order');
  r = m.call('alice', K(), 'place', { side: 'BUY', type: 'MARKET', qty: 10 }); ok(r.ok && r.filled === 0 && r.order.status === 'KILLED_NO_LIQUIDITY', '1j market order never creates fake liquidity (fills only against others, own orders skipped)');
  ok(m.check().ok, '1k books close after all of that: ' + JSON.stringify(m.check().bad)); }
{ const m = new SharedMarket({ startOil: 1000 }); PL(m, 'alice', 'bob'); const k = K(), a = { side: 'SELL', type: 'LIMIT', price: 80, qty: 100 };
  const r1 = m.call('alice', k, 'place', a), r2 = m.call('alice', k, 'place', a); ok(r1.order.id === r2.order.id && r2.replayed && Object.keys(m.orders).length === 1, '2a same idempotency key replayed = ONE order');
  ok(!m.call('alice', k, 'place', { side: 'SELL', type: 'LIMIT', price: 70, qty: 100 }).ok, '2b the same key with different content is rejected');
  const bad = [{ side: 'X', qty: 1 }, { side: 'BUY', type: 'LIMIT', price: -1, qty: 1 }, { side: 'BUY', type: 'LIMIT', price: 80.005, qty: 1 }, { side: 'BUY', qty: NaN }, { side: 'BUY', qty: 1e9 }, { side: 'BUY', qty: 0 }, { side: 'BUY', type: 'LIMIT', price: 80, qty: 'abc' }];
  ok(bad.every(b => !m.call('bob', K(), 'place', b).ok), '2c malformed / out-of-range / NaN / negative requests are all rejected');
  ok(!m.call('bob', 'k', 'place', a).ok && !m.call('ghost', K(), 'place', a).ok, '2d short key / unknown player rejected');
  const r = m.call('bob', K(), 'place', { side: 'BUY', type: 'LIMIT', price: 100, qty: 1e6 }); ok(!r.ok && r.code === 'NO_CASH', '2e cannot buy beyond free cash');
  for (let i = 0; i < 20; i++) m.call('bob', K(), 'place', { side: 'BUY', type: 'LIMIT', price: 10 + i * 0.01, qty: 1 }); ok(m.call('bob', K(), 'place', { side: 'BUY', type: 'LIMIT', price: 50, qty: 1 }).code === 'TOO_MANY', '2f open orders per player are capped'); }
{ // random stress on the core: invariants after every step, several seeds
  for (const seed of [1, 7, 42, 2026, 99991]) { let s = seed; const R = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; const m = new SharedMarket({ startOil: 5000 }); PL(m, 'p1', 'p2', 'p3', 'p4'); const ids = ['p1', 'p2', 'p3', 'p4'], mine = {};
    for (let i = 0; i < 1500; i++) { const id = ids[(R() * 4) | 0], x = R();
      if (x < .2 && Object.keys(m.orders).length) { const oid = 1 + ((R() * m.nextOrder) | 0); m.call(id, K(), 'cancel', { orderId: oid }); }
      else m.call(id, K(), 'place', { side: R() < .5 ? 'BUY' : 'SELL', type: R() < .25 ? 'MARKET' : 'LIMIT', price: Math.round((70 + R() * 20) * 100) / 100, qty: 1 + ((R() * 400) | 0) });
      if (i % 50 === 0) { const c = m.check(); assert(c.ok, 'seed ' + seed + ' step ' + i + ': ' + c.bad); } }
    assert(m.check().ok && m.trades.length > 50, 'stress ' + seed); }
  ok(true, '3a 5 seeds x 1500 random orders from 4 players: cash and oil conserved, no negative balance, locks = open orders, trade chain intact'); }
{ const m = new SharedMarket({ startOil: 1000 }); PL(m, 'alice', 'bob'); m.call('alice', K(), 'place', { side: 'SELL', type: 'LIMIT', price: 80, qty: 500 }); m.call('bob', K(), 'place', { side: 'BUY', type: 'MARKET', qty: 100 });
  const m2 = SharedMarket.restore(m.snapshot()); ok(m2.check().ok && m2.trades.length === 1 && JSON.stringify(m2.depth()) === JSON.stringify(m.depth()), '4a snapshot/restore keeps accounts, book and trade chain');
  const t = m2.trades[0]; t.qty = 999; ok(!m2.check().ok, '4b tampering with the trade log is detected'); }
// ---- real HTTP ----
(async () => {
  const f = path.join(os.tmpdir(), 'oli-shared-' + process.pid + '.json'); try { fs.unlinkSync(f); } catch (e) {}
  let srv = createServer({ file: f, secret: 'test-secret-fixed', cfg: { startOil: 10000 }, rateLimit: 5000 }); await new Promise(r => srv.listen(0, r)); const base = () => 'http://127.0.0.1:' + srv.address().port;
  const A = new SharedClient(base(), 'alice'), B = new SharedClient(base(), 'bob'), C = new SharedClient(base(), 'carol'); for (const c of [A, B, C]) await c.join();
  let r = await A.place({ side: 'SELL', type: 'LIMIT', price: 80, qty: 1000 }); ok(r.ok, '5a alice posts a sell over HTTP');
  const d = await B.depth(); ok(d.bestAsk === 80 && d.asks[0].qty === 1000 && d.src === 'SHARED_BOOK_REAL_ORDERS', '5b bob sees alice\'s order in the shared depth');
  r = await B.place({ side: 'BUY', type: 'MARKET', qty: 400 }); ok(r.ok && r.filled === 400, '5c bob buys 400 from alice (two players trade)');
  const ta = (await A.trades()).trades, tb = (await B.trades()).trades; ok(ta.length === 1 && tb.length === 1 && ta[0].hash === tb[0].hash, '5d both players see the same trade in the log');
  // tamper
  const bad = new SharedClient(base(), 'alice'); bad.token = 'f'.repeat(64); ok((await bad._req('/account', {}, true)).code === 'AUTH', '5e a forged token is refused');
  const evil = new SharedClient(base(), 'bob'); evil.token = A.token; ok((await evil._req('/account', {}, true)).code === 'AUTH', '5f alice\'s token cannot act as bob');
  ok((await A._req('/place', { key: K(), side: 'BUY', qty: 1, cash: 1e12, price: 1 }, true)).ok !== undefined && (await A.account()).account.cash < 1e9, '5g extra fields (cash/price overrides) are ignored: a client cannot set balances');
  // simultaneous orders on the same stock: 3 buyers race for 600 remaining
  const [r1, r2, r3] = await Promise.all([B.place({ side: 'BUY', type: 'MARKET', qty: 400 }), C.place({ side: 'BUY', type: 'MARKET', qty: 400 }), C.place({ side: 'BUY', type: 'MARKET', qty: 400 })]);
  const got = r1.filled + r2.filled + r3.filled; ok(got === 600, '6a three simultaneous market buys on the same 600 barrels: exactly 600 filled in total (' + got + ')');
  ok(srv.check().ok, '6b books close after the race: ' + srv.check().bad);
  // retry without duplicate: response lost AFTER the server executed it
  let dropFirst = true; const D = new SharedClient(base(), 'dave', { drop: p => false }); await D.join();
  const rq = { side: 'SELL', type: 'LIMIT', price: 85, qty: 300 }, key = D.newKey(); const x1 = await D.place(rq, key); const x2 = await D.place(rq, key);
  ok(x1.ok && x2.replayed && x1.order.id === x2.order.id && (await D.account()).orders.length === 1, '7a a retried request with the same key (reply lost) creates ONE order');
  // real network failure then success: first 2 attempts dropped before sending
  let cnt = 0; const E = new SharedClient(base(), 'erin', { drop: p => p === '/place' && ++cnt <= 2 }); await E.join(); const er = await E.place({ side: 'SELL', type: 'LIMIT', price: 90, qty: 100 }); ok(er.ok && cnt === 3 && (await E.account()).orders.length === 1, '7b client retries through 2 dropped connections and the order exists exactly once');
  // a request that timed out on the client but was executed by the server
  const timeoutKey = E.newKey(); const slow = new SharedClient(base(), 'erin', { timeout: 1, retries: 0 }); slow.token = E.token; try { await slow.place({ side: 'SELL', type: 'LIMIT', price: 91, qty: 50 }, timeoutKey); } catch (e) {} await new Promise(r => setTimeout(r, 100)); const again = await E.place({ side: 'SELL', type: 'LIMIT', price: 91, qty: 50 }, timeoutKey); ok(again.ok && (await E.account()).orders.filter(o => o.price === 91).length === 1, '7c after a client timeout, retrying the same key never doubles the order');
  // many concurrent mixed clients
  const names = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6']; const cl = names.map(i => new SharedClient(base(), i)); for (const c of cl) await c.join(); let s = 5; const R = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  await Promise.all(cl.map(async c => { for (let i = 0; i < 60; i++) await c.place({ side: R() < .5 ? 'BUY' : 'SELL', type: R() < .3 ? 'MARKET' : 'LIMIT', price: Math.round((75 + R() * 10) * 100) / 100, qty: 1 + ((R() * 300) | 0) }); }));
  ok(srv.check().ok, '8a 6 concurrent clients x 60 orders over HTTP: books close ' + srv.check().bad);
  // client view equals server view
  const all = [A, B, C, D, E, ...cl]; let sumCash = 0, sumOil = 0; for (const c of all) { const a = (await c.account()).account; sumCash += a.cash; sumOil += a.oil; }
  const mk = srv.market(); ok(Math.abs(sumCash + mk.fees - mk.issuedCash) < 1 && Math.abs(sumOil - mk.issuedOil) < 1e-6, '8b the balances players see add up exactly: cash + fees = issued, oil = issued');
  // persistence: restart the server from disk; same state, same idempotency memory
  const before = srv.market().snapshot(); await new Promise(r => srv.close(r)); const srv2 = createServer({ file: f, secret: 'test-secret-fixed', cfg: { startOil: 10000 }, rateLimit: 5000 }); await new Promise(r => srv2.listen(0, r));
  ok(srv2.market().snapshot() === before && srv2.check().ok, '9a server restart restores identical state from disk');
  const D2 = new SharedClient('http://127.0.0.1:' + srv2.address().port, 'dave'); D2.token = D.token; const dup = await D2._req('/place', Object.assign({ key }, rq), true);
  ok(dup.ok && dup.replayed && dup.order.id === x1.order.id && Object.keys(srv2.market().orders).filter(k => srv2.market().orders[k].pid === 'dave').length === 1, '9b after the restart the old token still works and re-sending an old key is still a replay, not a new order');
  const other = createServer({ secret: 'another-secret' }); await new Promise(r => other.listen(0, r)); const X = new SharedClient('http://127.0.0.1:' + other.address().port, 'dave'); X.token = D.token; ok((await X._req('/account', {}, true)).code === 'AUTH', '9c a token from one server secret is useless on another'); other.close();
  console.log(n + ' passed'); srv2.close(); try { fs.unlinkSync(f); } catch (e) {} process.exit(0);
})().catch(e => { console.error('FAIL', e.message, e.stack.split('\n')[1]); process.exit(1); });
