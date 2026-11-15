/* Client for the shared market.  Every placing/cancelling request carries an idempotency key; on a network error/timeout the SAME key is retried,
   so the server executes it at most once.  The client never computes balances or fills - it only displays what the server returned. */
'use strict';
const http = require('http'), crypto = require('crypto');
class SharedClient {
  constructor(base, id, o) { const u = new URL(base); this.host = u.hostname; this.port = +u.port; this.id = id; this.token = null; this.timeout = (o && o.timeout) || 4000; this.retries = (o && o.retries) || 4; this.drop = (o && o.drop) || null; }
  _req(path, body, auth) {
    return new Promise((res, rej) => {
      if (this.drop && this.drop(path)) return rej(new Error('simulated network drop'));
      const d = JSON.stringify(body || {}), h = { 'content-type': 'application/json', 'content-length': Buffer.byteLength(d) }; if (auth) { h['x-player'] = this.id; h['x-token'] = this.token; }
      const q = http.request({ host: this.host, port: this.port, path, method: 'POST', headers: h, timeout: this.timeout }, r => { let s = ''; r.on('data', c => s += c); r.on('end', () => { try { res(JSON.parse(s)); } catch (e) { rej(e); } }); });
      q.on('timeout', () => q.destroy(new Error('timeout'))); q.on('error', rej); q.end(d);
    });
  }
  async join() { const r = await this._req('/join', { id: this.id }); if (r.ok) this.token = r.token; return r; }
  async _retry(path, body) { let last; for (let i = 0; i <= this.retries; i++) { try { return await this._req(path, body, true); } catch (e) { last = e; await new Promise(r => setTimeout(r, 20 * (i + 1))); } } throw last; }
  newKey() { return crypto.randomBytes(12).toString('hex'); }
  place(o, key) { return this._retry('/place', Object.assign({ key: key || this.newKey() }, o)); }
  cancel(orderId, key) { return this._retry('/cancel', { key: key || this.newKey(), orderId }); }
  account() { return this._retry('/account', {}); } trades() { return this._retry('/trades', {}); } depth() { return this._req('/depth', {}); }
}
module.exports = { SharedClient };
