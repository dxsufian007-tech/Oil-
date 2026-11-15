/* HTTP wrapper around the authoritative core.  Auth: each player gets an HMAC token from the server on /join; clients can only send
   requests (place / cancel) - prices, balances and fills are produced here and nowhere else.  Persisted to a JSON file after every change (atomic rename). */
'use strict';
const http = require('http'), fs = require('fs'), crypto = require('crypto'), { SharedMarket } = require('./market-core.js');
function createServer(opts) {
  opts = opts || {}; const secret = opts.secret || crypto.randomBytes(32).toString('hex'), file = opts.file || null;
  let m = file && fs.existsSync(file) ? SharedMarket.restore(fs.readFileSync(file, 'utf8')) : new SharedMarket(opts.cfg);
  const tok = id => crypto.createHmac('sha256', secret).update(id).digest('hex'), save = () => { if (!file) return; fs.writeFileSync(file + '.tmp', m.snapshot()); fs.renameSync(file + '.tmp', file); };
  const rate = new Map(), LIM = opts.rateLimit || 200;                                             // requests per player per second
  const srv = http.createServer((q, r) => {
    const out = (c, o) => { r.writeHead(c, { 'content-type': 'application/json' }); r.end(JSON.stringify(o)); };
    let body = ''; q.on('data', d => { body += d; if (body.length > 20000) q.destroy(); });
    q.on('end', () => {
      let a = {}; try { a = body ? JSON.parse(body) : {}; } catch (e) { return out(400, { ok: false, code: 'BAD_JSON' }); }
      const u = q.url.split('?')[0];
      if (u === '/health') return out(200, { ok: true, players: Object.keys(m.players).length, trades: m.trades.length });
      if (u === '/depth') return out(200, Object.assign({ ok: true }, m.depth(10)));
      if (u === '/join') { const j = m.join(a.id); if (j.ok) { save(); j.token = tok(a.id); } return out(j.ok ? 200 : 400, j); }
      const id = String(q.headers['x-player'] || ''), t = String(q.headers['x-token'] || '');
      const exp = tok(id); if (!id || t.length !== exp.length || !crypto.timingSafeEqual(Buffer.from(t), Buffer.from(exp))) return out(401, { ok: false, code: 'AUTH' });
      const sec = Math.floor(Date.now() / 1000), rk = id + sec, n = (rate.get(rk) || 0) + 1; rate.set(rk, n); if (rate.size > 5000) rate.clear(); if (n > LIM) return out(429, { ok: false, code: 'RATE' });
      if (u === '/account') return out(200, { ok: true, account: m.account(id), orders: m.openOrders(id) });
      if (u === '/trades') return out(200, { ok: true, trades: m.tradesOf(id, 100) });
      if (u === '/place' || u === '/cancel') { const res = m.call(id, String(a.key || ''), u.slice(1), u === '/place' ? { side: a.side, type: a.type, price: a.price, qty: a.qty } : { orderId: a.orderId }); if (res.ok && !res.replayed) save(); return out(res.ok ? 200 : 422, res); }
      out(404, { ok: false, code: 'NOT_FOUND' });
    });
  });
  srv.market = () => m; srv.check = () => m.check(); return srv;
}
module.exports = { createServer };
if (require.main === module) { const port = +process.env.PORT || 8787, s = createServer({ file: process.env.DATA_FILE || 'market-data.json', secret: process.env.OLI_SECRET }); s.listen(port, () => console.log('OLI shared market listening on ' + port)); }
