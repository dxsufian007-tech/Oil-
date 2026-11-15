/* OLI shared world market - AUTHORITATIVE core (S5).  Runs ONLY on a server; clients send requests and never hold or edit market data.
   Model: one shared crude order book (price-time priority), per-player accounts (cash/crude) with ESCROW (an open order locks its cash/oil, so
   balance can never go negative and nothing can be sold twice), fee on every fill, idempotency keys (a retried request is never executed twice),
   a hash-chained trade log and a ledger check (sum of cash + fees = initial cash; sum of oil = initial oil). Single-threaded: every request is atomic. */
'use strict';
const crypto = require('crypto');
const DEF = { feeRate: 0.002, tick: 0.01, maxOpen: 20, maxQty: 5e6, minQty: 1, startCash: 1e8, startOil: 0, maxPx: 1000, seedPrice: 80 };
class SharedMarket {
  constructor(cfg, chainKey) {
    this.cfg = Object.assign({}, DEF, cfg || {}); this._key = String(chainKey || '');            // chain key is NEVER serialised: whoever edits the data file cannot re-sign the trade log
    this.players = Object.create(null); this.orders = Object.create(null); this.nextOrder = 1; this.nextTrade = 1; this.trades = []; this.fees = 0; this.last = this.cfg.seedPrice;
    this.idem = new Map(); this.seq = 0; this.issuedCash = 0; this.issuedOil = 0; this.head = '0'.repeat(64);
  }
  _h(o) { return crypto.createHmac('sha256', this._key).update(JSON.stringify(o)).digest('hex'); }
  _err(code, msg) { return { ok: false, code, error: msg }; }
  join(id) {
    if (typeof id !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{2,31}$/.test(id) || /^(__proto__|constructor|prototype)$/.test(id)) return this._err('BAD_ID', 'bad player id');
    if (!this.players[id]) { this.players[id] = { id, cash: this.cfg.startCash, oil: this.cfg.startOil, lockedCash: 0, lockedOil: 0, spent: 0, got: 0, feesPaid: 0 }; this.issuedCash += this.cfg.startCash; this.issuedOil += this.cfg.startOil; }
    return { ok: true, account: this.account(id) };
  }
  account(id) { const p = this.players[id]; return p && { id, cash: p.cash, oil: p.oil, lockedCash: p.lockedCash, lockedOil: p.lockedOil, freeCash: p.cash - p.lockedCash, freeOil: p.oil - p.lockedOil, feesPaid: p.feesPaid }; }
  /* every mutating call goes through here: idempotent per (player,key) */
  call(id, key, kind, args) {
    if (!this.players[id]) return this._err('NO_PLAYER', 'join first');
    if (typeof key !== 'string' || key.length < 6 || key.length > 80) return this._err('BAD_KEY', 'idempotency key required');
    const k = id + '|' + key, hit = this.idem.get(k);
    if (hit) { if (hit.kind !== kind || hit.sig !== JSON.stringify(args)) return this._err('KEY_REUSED', 'key already used for another request'); return Object.assign({}, hit.res, { replayed: true }); }
    let res;
    try { res = kind === 'place' ? this._place(id, args) : kind === 'cancel' ? this._cancel(id, args) : this._err('BAD_KIND', 'unknown'); } catch (e) { res = this._err('INTERNAL', String(e && e.message)); }
    this.idem.set(k, { kind, sig: JSON.stringify(args), res }); if (this.idem.size > 50000) this.idem.delete(this.idem.keys().next().value);
    return res;
  }
  _place(id, a) {
    const c = this.cfg, p = this.players[id], side = a.side, type = a.type || 'LIMIT', qty = Number(a.qty), px = a.price == null ? null : Number(a.price);
    if (side !== 'BUY' && side !== 'SELL') return this._err('BAD_SIDE', 'side');
    if (type !== 'LIMIT' && type !== 'MARKET') return this._err('BAD_TYPE', 'type');
    if (!Number.isFinite(qty) || qty < c.minQty || qty > c.maxQty) return this._err('BAD_QTY', 'quantity out of range');
    if (type === 'LIMIT' && (!Number.isFinite(px) || px <= 0 || px > c.maxPx)) return this._err('BAD_PRICE', 'price out of range');
    if (type === 'LIMIT' && Math.abs(px / c.tick - Math.round(px / c.tick)) > 1e-6) return this._err('BAD_TICK', 'price must be a multiple of ' + c.tick);
    const mine = Object.values(this.orders).filter(o => o.pid === id && o.left > 0 && o.open).length;
    if (type === 'LIMIT' && mine >= c.maxOpen) return this._err('TOO_MANY', 'too many open orders');
    const o = { id: this.nextOrder++, pid: id, side, type, price: type === 'LIMIT' ? px : null, qty, left: qty, open: true, seq: ++this.seq, fills: [] };
    // escrow: a SELL locks oil, a LIMIT BUY locks cash at its limit; a MARKET BUY is checked fill by fill against free cash
    if (side === 'SELL') { if (p.oil - p.lockedOil < qty) return this._err('NO_OIL', 'not enough free oil'); }
    else if (type === 'LIMIT') { const need = qty * px * (1 + c.feeRate); if (p.cash - p.lockedCash < need) return this._err('NO_CASH', 'not enough free cash'); }
    this.orders[o.id] = o;
    if (type === 'LIMIT') { if (side === 'SELL') p.lockedOil += qty; else { o.lock = qty * px * (1 + c.feeRate); p.lockedCash += o.lock; } }
    this._match(o);
    if (o.left > 0 && type === 'LIMIT') { /* rests */ } else this._close(o, o.left > 0 ? 'KILLED_NO_LIQUIDITY' : 'FILLED');
    return { ok: true, order: this._pub(o), filled: o.qty - o.left, avg: o.fills.length ? o.fills.reduce((s, f) => s + f.q * f.p, 0) / (o.qty - o.left) : null };
  }
  _book(side) { return Object.values(this.orders).filter(o => o.open && o.left > 0 && o.side === side && o.type === 'LIMIT').sort((x, y) => side === 'BUY' ? (y.price - x.price) || (x.seq - y.seq) : (x.price - y.price) || (x.seq - y.seq)); }
  _match(t) {
    const c = this.cfg, opp = t.side === 'BUY' ? 'SELL' : 'BUY';
    for (const m of this._book(opp)) {
      if (t.left <= 0) break; if (m.pid === t.pid) continue;                                   // self-trade is skipped: no wash trades
      if (t.type === 'LIMIT' && (t.side === 'BUY' ? m.price > t.price : m.price < t.price)) break;
      const px = m.price; let q = Math.min(t.left, m.left); const buyer = this.players[t.side === 'BUY' ? t.pid : m.pid], seller = this.players[t.side === 'BUY' ? m.pid : t.pid];
      if (t.side === 'BUY' && t.type === 'MARKET') { const aff = Math.floor((buyer.cash - buyer.lockedCash) / (px * (1 + c.feeRate))); q = Math.min(q, aff); if (q < 1) break; }
      const value = q * px, fee = value * c.feeRate, bo = t.side === 'BUY' ? t : m, so = t.side === 'BUY' ? m : t;
      buyer.cash -= value + fee; seller.cash += value - fee; buyer.oil += q; seller.oil -= q; buyer.feesPaid += fee; seller.feesPaid += fee; this.fees += 2 * fee; buyer.spent += value; seller.got += value;
      if (so.type === 'LIMIT') seller.lockedOil -= q;
      if (bo.type === 'LIMIT') { const rel = q * bo.price * (1 + c.feeRate); buyer.lockedCash -= rel; bo.lock -= rel; }
      t.left -= q; m.left -= q; this.last = px;
      const tr = { id: this.nextTrade++, t: this.seq, buyer: buyer.id, seller: seller.id, qty: q, price: px, value, feeEach: fee, buyOrder: bo.id, sellOrder: so.id, taker: t.id, prev: this.head };
      tr.hash = this._h(tr); this.head = tr.hash; this.trades.push(tr); t.fills.push({ q, p: px }); m.fills.push({ q, p: px });
      if (m.left <= 0) this._close(m, 'FILLED');
    }
  }
  _close(o, why) {
    if (!o.open) return; o.open = false; o.status = why; const p = this.players[o.pid];
    if (o.type === 'LIMIT') { if (o.side === 'SELL') p.lockedOil -= o.left; else { p.lockedCash -= o.lock; o.lock = 0; } }
    if (Math.abs(p.lockedCash) < 1e-6) p.lockedCash = 0; if (Math.abs(p.lockedOil) < 1e-6) p.lockedOil = 0;
  }
  _cancel(id, a) {
    const o = this.orders[a.orderId]; if (!o || o.pid !== id) return this._err('NO_ORDER', 'order not found');
    if (!o.open) return this._err('NOT_OPEN', 'order already ' + o.status);
    this._close(o, o.left < o.qty ? 'CANCELLED_PARTIAL' : 'CANCELLED'); return { ok: true, order: this._pub(o) };
  }
  _pub(o) { return { id: o.id, pid: o.pid, side: o.side, type: o.type, price: o.price, qty: o.qty, left: o.left, open: o.open, status: o.open ? 'OPEN' : o.status, fills: o.fills.length }; }
  depth(levels) {
    const agg = (side) => { const m = new Map(); for (const o of this._book(side)) m.set(o.price, (m.get(o.price) || 0) + o.left); return [...m].map(([price, qty]) => ({ price, qty })).slice(0, levels || 10); };
    const bids = agg('BUY'), asks = agg('SELL'); return { bids, asks, bestBid: bids[0] ? bids[0].price : null, bestAsk: asks[0] ? asks[0].price : null, spread: bids[0] && asks[0] ? asks[0].price - bids[0].price : null, last: this.last, src: 'SHARED_BOOK_REAL_ORDERS' };
  }
  openOrders(id) { return Object.values(this.orders).filter(o => o.pid === id && o.open).map(o => this._pub(o)); }
  tradesOf(id, n) { return this.trades.filter(t => t.buyer === id || t.seller === id).slice(-(n || 50)); }
  /* books must close: money and oil are conserved, locks match open orders, trade log chain is intact */
  check() {
    const bad = [], ps = Object.values(this.players); const cash = ps.reduce((s, p) => s + p.cash, 0), oil = ps.reduce((s, p) => s + p.oil, 0);
    if (Math.abs(cash + this.fees - this.issuedCash) > 1e-3 * Math.max(1, ps.length)) bad.push('cash not conserved ' + (cash + this.fees - this.issuedCash));
    if (Math.abs(oil - this.issuedOil) > 1e-6) bad.push('oil not conserved');
    for (const p of ps) {
      if (p.cash < -1e-6 || p.oil < -1e-6) bad.push('negative balance ' + p.id);
      let lc = 0, lo = 0; for (const o of Object.values(this.orders)) if (o.pid === p.id && o.open && o.type === 'LIMIT') { if (o.side === 'SELL') lo += o.left; else lc += o.lock; }
      if (Math.abs(lc - p.lockedCash) > 1e-3) bad.push('cash lock mismatch ' + p.id); if (Math.abs(lo - p.lockedOil) > 1e-6) bad.push('oil lock mismatch ' + p.id);
      if (p.lockedCash > p.cash + 1e-3 || p.lockedOil > p.oil + 1e-6) bad.push('lock exceeds balance ' + p.id);
    }
    let h = '0'.repeat(64); for (const t of this.trades) { const { hash, ...r } = t; if (r.prev !== h || this._h(r) !== hash) { bad.push('trade chain broken at ' + t.id); break; } h = hash; }
    const exp = Object.create(null); for (const p of ps) exp[p.id] = { cash: this.cfg.startCash, oil: this.cfg.startOil };
    for (const t of this.trades) { const b = exp[t.buyer], se = exp[t.seller]; if (!b || !se) { bad.push('trade with unknown player ' + t.id); continue; } b.cash -= t.value + t.feeEach; b.oil += t.qty; se.cash += t.value - t.feeEach; se.oil -= t.qty; }
    for (const p of ps) if (Math.abs(exp[p.id].cash - p.cash) > 1e-3 || Math.abs(exp[p.id].oil - p.oil) > 1e-6) bad.push('balance of ' + p.id + ' does not match the trade log');
    const sum = this.trades.reduce((s, t) => s + t.qty, 0), got = ps.reduce((s, p) => s + p.got, 0), sp = ps.reduce((s, p) => s + p.spent, 0);
    if (Math.abs(got - sp) > 1e-3 * Math.max(1, this.trades.length)) bad.push('spent != received'); if (!(sum >= 0)) bad.push('trade qty');
    return { ok: !bad.length, bad };
  }
  snapshot() { return JSON.stringify({ cfg: this.cfg, players: this.players, orders: this.orders, nextOrder: this.nextOrder, nextTrade: this.nextTrade, trades: this.trades, fees: this.fees, last: this.last, seq: this.seq, issuedCash: this.issuedCash, issuedOil: this.issuedOil, head: this.head, idem: [...this.idem] }); }
  static restore(s, chainKey) { const o = JSON.parse(s), m = new SharedMarket(o.cfg, chainKey); m.players = Object.assign(Object.create(null), o.players); m.orders = Object.assign(Object.create(null), o.orders); for (const k of ['nextOrder', 'nextTrade', 'trades', 'fees', 'last', 'seq', 'issuedCash', 'issuedOil', 'head']) m[k] = o[k]; m.idem = new Map(o.idem); return m; }
}
module.exports = { SharedMarket, DEF };
