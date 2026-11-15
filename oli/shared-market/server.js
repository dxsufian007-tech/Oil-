/* HTTP wrapper: authentication in front of the authoritative core.  No endpoint lets a client name a player: the id comes from the verified
   access token.  Persisted with mode 0600 (atomic rename).  On start the data file is re-verified (balances replayed from the HMAC-signed
   trade log); a file that was edited by hand makes the server REFUSE to start.  Put it behind TLS (reverse proxy) - see README-S5. */
'use strict';
const http = require('http'), fs = require('fs'), crypto = require('crypto'), { SharedMarket } = require('./market-core.js'), { Auth } = require('./auth.js');
function createServer(opts) {
  opts = opts || {}; const secret = opts.secret; if (!secret || String(secret).length < 16) throw new Error('OLI_SECRET (>= 16 chars) is required');
  const file = opts.file || null, now = opts.now || Date.now, chainKey = crypto.createHmac('sha256', secret).update('trade-chain').digest('hex');
  let m, au; if (file && fs.existsSync(file)) { const j = JSON.parse(fs.readFileSync(file, 'utf8')); m = SharedMarket.restore(j.market, chainKey); const c = m.check(); if (!c.ok) throw new Error('data file failed verification: ' + c.bad.join('; ')); au = Auth.from(j.auth, Object.assign({ now }, opts.auth)); }
  else { m = new SharedMarket(opts.cfg, chainKey); au = new Auth(Object.assign({ now }, opts.auth)); }
  const save = () => { if (!file) return; au.gc(); fs.writeFileSync(file + '.tmp', JSON.stringify({ v: 1, market: m.snapshot(), auth: au.toJSON() }), { mode: 0o600 }); fs.renameSync(file + '.tmp', file); };
  const rate = new Map(), LIM = opts.rateLimit || 100, trust = !!opts.trustProxy;
  const srv = http.createServer((q, r) => {
    const out = (c, o) => { r.writeHead(c, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); r.end(JSON.stringify(o)); };
    const ip = trust && q.headers['x-forwarded-for'] ? String(q.headers['x-forwarded-for']).split(',')[0].trim() : q.socket.remoteAddress;
    if (q.method !== 'POST' && !(q.method === 'GET' && (q.url === '/health' || q.url === '/depth'))) return out(405, { ok: false, code: 'METHOD' });
    let body = '', over = false; q.on('data', d => { body += d; if (body.length > 20000) { over = true; q.destroy(); } });
    q.on('end', () => {
      if (over) return; let a = {}; try { a = body ? JSON.parse(body) : {}; if (!a || typeof a !== 'object' || Array.isArray(a)) throw 0; } catch (e) { return out(400, { ok: false, code: 'BAD_JSON' }); }
      const u = q.url.split('?')[0];
      if (u === '/health') return out(200, { ok: true });
      if (u === '/depth') return out(200, Object.assign({ ok: true }, m.depth(10)));
      if (u === '/register') { const x = au.register(a.id, a.password, ip, id => m.join(id)); if (x.ok) save(); return out(x.ok ? 200 : x.code === 'RATE' ? 429 : 400, x); }
      if (u === '/login') { const x = au.login(a.id, a.password, ip); if (x.ok) save(); return out(x.ok ? 200 : x.code === 'RATE' ? 429 : x.code === 'LOCKED' ? 423 : 401, x); }
      if (u === '/refresh') { const x = au.refresh(a.refresh); save(); return out(x.ok ? 200 : 401, x); }
      const h = String(q.headers.authorization || ''), tk = h.startsWith('Bearer ') ? h.slice(7) : '', id = au.verify(tk);
      if (!id) return out(401, { ok: false, code: 'AUTH' });
      const sec = Math.floor(now() / 1000), rk = id + ':' + sec, n = (rate.get(rk) || 0) + 1; rate.set(rk, n); if (rate.size > 5000) rate.clear(); if (n > LIM) return out(429, { ok: false, code: 'RATE' });
      if (u === '/logout') { au.logout(tk); save(); return out(200, { ok: true }); }
      if (u === '/account') return out(200, { ok: true, account: m.account(id), orders: m.openOrders(id) });
      if (u === '/trades') return out(200, { ok: true, trades: m.tradesOf(id, 100) });
      if (u === '/place' || u === '/cancel') { const res = m.call(id, String(a.key || ''), u.slice(1), u === '/place' ? { side: a.side, type: a.type, price: a.price, qty: a.qty } : { orderId: a.orderId }); if (res.ok && !res.replayed) save(); return out(res.ok ? 200 : 422, res); }
      out(404, { ok: false, code: 'NOT_FOUND' });
    });
  });
  srv.market = () => m; srv.auth = () => au; srv.check = () => m.check(); srv.saveNow = save; return srv;
}
module.exports = { createServer };
if (require.main === module) { const port = +process.env.PORT || 8787, s = createServer({ file: process.env.DATA_FILE || 'market-data.json', secret: process.env.OLI_SECRET, trustProxy: process.env.TRUST_PROXY === '1' }); s.listen(port, '127.0.0.1', () => console.log('OLI shared market listening on 127.0.0.1:' + port + ' (put TLS in front)')); }
