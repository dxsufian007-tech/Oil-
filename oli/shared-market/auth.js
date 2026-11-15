/* Authentication for the shared market.  Passwords: scrypt + per-user salt, constant-time compare.  Sessions: random 256-bit opaque tokens,
   only their SHA-256 is stored; short-lived access token + single-use rotating refresh token; REUSE of a used refresh token revokes the whole
   session (token theft detection); absolute session lifetime; per-account lockout and per-IP rate limits.  The player identity always comes
   from the verified token - never from a header or body field the client can set. */
'use strict';
const crypto = require('crypto');
const sha = t => crypto.createHash('sha256').update(t).digest('hex');
const rnd = () => crypto.randomBytes(32).toString('base64url');
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 32, { N: 16384, r: 8, p: 1 });
const ID_RE = /^[A-Za-z][A-Za-z0-9_-]{2,31}$/;
class Auth {
  constructor(o) {
    o = o || {}; this.now = o.now || Date.now; this.accessMs = o.accessMs || 15 * 60e3; this.refreshMs = o.refreshMs || 7 * 864e5; this.sessionMs = o.sessionMs || 30 * 864e5;
    this.maxFails = o.maxFails || 5; this.lockMs = o.lockMs || 15 * 60e3; this.regPerIpHour = o.regPerIpHour || 5; this.authPerIpMin = o.authPerIpMin || 30; this.minPw = o.minPw || 10;
    this.users = Object.create(null); this.fam = new Map(); this.byAccess = new Map(); this.byRefresh = new Map(); this.ipHits = new Map(); this.regHits = new Map();
    this.dummy = { salt: crypto.randomBytes(16), hash: hashPw('dummy-password-never-valid', crypto.randomBytes(16)) };
  }
  _hit(map, key, windowMs, max) { const t = this.now(), arr = (map.get(key) || []).filter(x => t - x < windowMs); if (arr.length >= max) { map.set(key, arr); return false; } arr.push(t); map.set(key, arr); if (map.size > 20000) map.delete(map.keys().next().value); return true; }
  register(id, password, ip, onCreate) {
    if (!this._hit(this.regHits, ip || '?', 3600e3, this.regPerIpHour)) return { ok: false, code: 'RATE', error: 'too many registrations from this address' };
    if (typeof id !== 'string' || !ID_RE.test(id) || /^(__proto__|constructor|prototype)$/.test(id)) return { ok: false, code: 'BAD_ID', error: 'id: 3-32 chars, starts with a letter, letters/digits/_/-' };
    if (typeof password !== 'string' || password.length < this.minPw || password.length > 128) return { ok: false, code: 'WEAK_PASSWORD', error: 'password must be ' + this.minPw + '-128 characters' };
    if (password.toLowerCase().includes(id.toLowerCase())) return { ok: false, code: 'WEAK_PASSWORD', error: 'password must not contain the id' };
    if (this.users[id.toLowerCase()]) return { ok: false, code: 'EXISTS', error: 'this id is already registered' };
    const salt = crypto.randomBytes(16); this.users[id.toLowerCase()] = { id, salt: salt.toString('hex'), hash: hashPw(password, salt).toString('hex'), fails: 0, lockedUntil: 0, created: this.now() };
    if (onCreate) onCreate(id); return { ok: true, id };
  }
  login(id, password, ip) {
    const GEN = { ok: false, code: 'BAD_LOGIN', error: 'wrong id or password' };
    if (!this._hit(this.ipHits, ip || '?', 60e3, this.authPerIpMin)) return { ok: false, code: 'RATE', error: 'too many attempts' };
    const u = typeof id === 'string' ? this.users[id.toLowerCase()] : null, pw = typeof password === 'string' && password.length <= 128 ? password : '';
    if (u && u.lockedUntil > this.now()) { hashPw(pw, this.dummy.salt); return { ok: false, code: 'LOCKED', error: 'account temporarily locked', retryAfterMs: u.lockedUntil - this.now() }; }
    const salt = u ? Buffer.from(u.salt, 'hex') : this.dummy.salt, got = hashPw(pw, salt), want = u ? Buffer.from(u.hash, 'hex') : this.dummy.hash;       // same work for unknown ids: no timing oracle
    const good = crypto.timingSafeEqual(got, want) && !!u;
    if (!good) { if (u && ++u.fails >= this.maxFails) { u.lockedUntil = this.now() + this.lockMs; u.fails = 0; } return GEN; }
    u.fails = 0; return Object.assign({ ok: true, id: u.id }, this._issue(u.id, null));
  }
  _issue(user, sid) {
    const t = this.now(); let f = sid && this.fam.get(sid);
    if (!f) { sid = crypto.randomBytes(12).toString('hex'); f = { user, revoked: false, created: t, absExp: t + this.sessionMs, access: null, refresh: null }; this.fam.set(sid, f); }
    if (f.access) this.byAccess.delete(f.access.h); const a = rnd(), r = rnd();
    f.access = { h: sha(a), exp: Math.min(t + this.accessMs, f.absExp) }; f.refresh = { h: sha(r), exp: Math.min(t + this.refreshMs, f.absExp) };
    this.byAccess.set(f.access.h, sid); this.byRefresh.set(f.refresh.h, { sid, used: false });
    return { access: a, refresh: r, accessExpiresAt: f.access.exp, refreshExpiresAt: f.refresh.exp };
  }
  verify(token) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null; const sid = this.byAccess.get(sha(token)); if (!sid) return null;
    const f = this.fam.get(sid); if (!f || f.revoked || this.now() >= f.access.exp || this.now() >= f.absExp) return null; return f.user;
  }
  refresh(rt) {
    const BAD = { ok: false, code: 'BAD_REFRESH', error: 'invalid refresh token' }; if (typeof rt !== 'string' || rt.length > 100) return BAD;
    const h = sha(rt), e = this.byRefresh.get(h); if (!e) return BAD; const f = this.fam.get(e.sid); if (!f || f.revoked) return BAD;
    if (e.used) { this.revoke(e.sid); return { ok: false, code: 'REUSE_DETECTED', error: 'refresh token reused: session revoked, log in again' }; }
    if (this.now() >= f.refresh.exp || this.now() >= f.absExp) return { ok: false, code: 'EXPIRED', error: 'session expired' };
    e.used = true; return Object.assign({ ok: true, id: f.user }, this._issue(f.user, e.sid));
  }
  revoke(sid) { const f = this.fam.get(sid); if (f) { f.revoked = true; if (f.access) this.byAccess.delete(f.access.h); } }
  logout(token) { const sid = this.byAccess.get(sha(String(token))); if (sid) this.revoke(sid); return { ok: true }; }
  logoutAll(user) { for (const [sid, f] of this.fam) if (f.user === user) this.revoke(sid); }
  gc() { const t = this.now(); for (const [sid, f] of this.fam) if (f.revoked || t >= f.absExp) { this.fam.delete(sid); if (f.access) this.byAccess.delete(f.access.h); if (f.refresh) this.byRefresh.delete(f.refresh.h); } }
  toJSON() { return { users: this.users, fam: [...this.fam], byAccess: [...this.byAccess], byRefresh: [...this.byRefresh] }; }
  static from(j, o) { const a = new Auth(o); if (!j) return a; a.users = Object.assign(Object.create(null), j.users); a.fam = new Map(j.fam); a.byAccess = new Map(j.byAccess); a.byRefresh = new Map(j.byRefresh); return a; }
}
module.exports = { Auth };
