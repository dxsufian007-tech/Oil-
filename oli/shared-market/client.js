/* Client: logs in with id + password, keeps the access/refresh tokens, refreshes automatically on 401, and sends every order with an
   idempotency key; on a network error the SAME key is retried so the server executes it at most once.  The client never computes balances. */
'use strict';
const http = require('http'), crypto = require('crypto');
class SharedClient {
  constructor(base, id, o) { const u = new URL(base); this.host = u.hostname; this.port = +u.port; this.id = id; this.access = null; this.refreshTok = null; this.timeout = (o && o.timeout) || 4000; this.retries = (o && o.retries) || 4; this.drop = (o && o.drop) || null; }
  _req(path, body, auth) {
    return new Promise((res, rej) => {
      if (this.drop && this.drop(path)) return rej(new Error('simulated network drop'));
      const d = JSON.stringify(body || {}), h = { 'content-type': 'application/json', 'content-length': Buffer.byteLength(d) }; if (auth && this.access) h.authorization = 'Bearer ' + this.access;
      const q = http.request({ host: this.host, port: this.port, path, method: 'POST', headers: h, timeout: this.timeout }, r => { let s = ''; r.on('data', c => s += c); r.on('end', () => { try { const j = JSON.parse(s); j.status = r.statusCode; res(j); } catch (e) { rej(e); } }); });
      q.on('timeout', () => q.destroy(new Error('timeout'))); q.on('error', rej); q.end(d);
    });
  }
  _take(r) { if (r.ok && r.access) { this.access = r.access; this.refreshTok = r.refresh; } return r; }
  register(password) { return this._req('/register', { id: this.id, password }); }
  async login(password) { return this._take(await this._req('/login', { id: this.id, password })); }
  async refresh() { return this._take(await this._req('/refresh', { refresh: this.refreshTok })); }
  async logout() { return this._req('/logout', {}, true); }
  async _retry(path, body) {
    let last; for (let i = 0; i <= this.retries; i++) {
      try { let r = await this._req(path, body, true); if (r.status === 401 && r.code === 'AUTH' && this.refreshTok) { const f = await this.refresh(); if (f.ok) r = await this._req(path, body, true); } return r; }
      catch (e) { last = e; await new Promise(r => setTimeout(r, 20 * (i + 1))); } }
    throw last;
  }
  newKey() { return crypto.randomBytes(12).toString('hex'); }
  place(o, key) { return this._retry('/place', Object.assign({}, o, { key: key || this.newKey() })); }
  cancel(orderId, key) { return this._retry('/cancel', { key: key || this.newKey(), orderId }); }
  account() { return this._retry('/account', {}); } trades() { return this._retry('/trades', {}); } depth() { return this._req('/depth', {}); }
}
module.exports = { SharedClient };
