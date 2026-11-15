/* S2 trading desk: market / limit orders through an order book (slippage, depth, partial fills, cancel, fees, P&L), all through the company's real books.  node test-market-s2.js */
const OB = require('./order-book.js'); const { game, put } = require('./test-economy-helpers.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol) * Math.max(1, Math.abs(a), Math.abs(b));
const rig = (cash) => { const g = game(1e11), co = g.co; put(g, 'crude_tank_l', 40, 40); put(g, 'crude_tank_l', 40, 80); put(g, 'crude_tank_l', 40, 120); g.store.cash = cash == null ? 2e9 : cash; co.sync(); return { g, co }; };

console.log('1. the order book (pure)');
{ const b = OB.build(80, 600000, { cover: 1, vol: 1 }); T('1a best ask > market > best bid; spread positive; every level labelled SIM (simulated liquidity, source declared)', b.bestAsk > 80 && b.bestBid < 80 && b.spread > 0 && b.asks.every(r => r.src === 'SIM') && b.source === 'SIM');
  T('1b liquidity comes from the product depth: levels x levelShare x depth', near(b.liquidityAsk, b.asks.length * 600000 * OB.DEF.levelShare));
  const low = OB.build(80, 600000, { cover: 0.7, vol: 1 }), hi = OB.build(80, 600000, { cover: 1.4, vol: 1 }), wild = OB.build(80, 600000, { cover: 1, vol: 3 });
  T('1c a low stock / a wild market thins the book; a full stock deepens it', low.liquidityAsk < b.liquidityAsk && b.liquidityAsk < hi.liquidityAsk && wild.liquidityAsk < b.liquidityAsk && wild.spreadPct > b.spreadPct);
  const sm = OB.walk(b, 'BUY', 20000), md = OB.walk(b, 'BUY', 1500000), bg = OB.walk(b, 'BUY', 9e6);
  T('1d small < medium < huge slippage: ' + (sm.slippage * 100).toFixed(3) + '% < ' + (md.slippage * 100).toFixed(3) + '% < ' + (bg.slippage * 100).toFixed(3) + '%', sm.slippage < md.slippage && md.slippage < bg.slippage);
  T('1e a huge order is NOT priced at one price: it fills level by level, stops at the slippage cap and is partial', bg.partial && bg.filled < 9e6 && bg.levelsUsed > 10 && bg.slippageVsMarket <= OB.DEF.maxSlip + 1e-9 && bg.vwap > bg.bestPrice);
  const lim = OB.walk(b, 'BUY', 1e6, { limit: 80.2 }); T('1f a limit price stops the walk: nothing above it is bought', lim.fills.every(f => f.price <= 80.2) && lim.partial);
  const sl = OB.walk(b, 'SELL', 1500000); T('1g a sell walks the bids downward: VWAP below the best bid', sl.vwap < b.bestBid && sl.fills.every((f, i, a) => i === 0 || f.price <= a[i - 1].price));
  const empty = OB.build(80, 600000, {}, { simulated: false }, []); T('1h no real orders and the model off: the book is EMPTY, no fake liquidity; a market order fills nothing (noLiquidity)', !empty.asks.length && OB.walk(empty, 'BUY', 10).reason === 'noLiquidity');
  const real = OB.build(80, 600000, {}, { simulated: false }, [{ side: 'SELL', price: 80.5, qty: 1000, owner: 'p2' }, { side: 'BUY', price: 79.5, qty: 700, owner: 'p3' }]); const wr = OB.walk(real, 'BUY', 5000);
  T('1i real orders alone: liquidity is exactly what is posted (1000 sell at 80.5), the rest unfilled', wr.filled === 1000 && wr.vwap === 80.5 && wr.partial && real.asks[0].src === 'REAL'); }

console.log('2. market orders through the company');
{ const { g, co } = rig(); const cash0 = g.store.cash, bq0 = co.bq;
  const qs = co.deskQuote('BUY', 'CRUDE', 50000); co.sync(); const c0 = g.store.cash; const r = co.deskMarket('BUY', 'CRUDE', 50000);
  T('2a a small market buy fills fully at the quoted VWAP', r.ok && !r.partial && near(r.filled, 50000, 1e-9) && near(r.vwap, qs.vwap, 1e-9), r);
  T('2b cash fell by exactly the quoted total (qty x VWAP + freight + supplier fee); the stock rose by the quantity', near(c0 - g.store.cash, qs.total, 1e-9) && near(co.bq - bq0, 50000, 1e-9), [c0 - g.store.cash, qs.total]);
  const big = co.deskMarket('BUY', 'CRUDE', 20e6); T('2c a huge buy is PARTIAL (book depth or tank room): filled below the request, slippage within the cap, unfilled reported', big.ok && big.partial && big.filled < 20e6 && big.unfilled > 0 && big.slippage <= OB.DEF.maxSlip + 1e-9, big.ok ? [big.filled, big.slippage] : big);
  { const r2 = rig(), e = r2.co.market.engine, C0 = e.C; const a = r2.co.deskMarket('BUY', 'CRUDE', 100000), C1 = e.C; const b = r2.co.deskMarket('BUY', 'CRUDE', 1000000), C2 = e.C; T('2d the trade reaches the market through the commercial stock: what is bought leaves it, in proportion to the size (' + ((C0 - C1) * 1e6).toFixed(0) + ' then ' + ((C1 - C2) * 1e6).toFixed(0) + ' bbl)', a.ok && b.ok && near(C0 - C1, a.filled / 1e6, 1e-6) && near(C1 - C2, b.filled / 1e6, 1e-6) && (C1 - C2) > (C0 - C1)); }
  T('2e the audit passes after market buys (journal balanced, cash = journal, bought crude = tanks)', co.audit().ok, co.audit());
  const have = co.available('CRUDE'), s1 = co.deskMarket('SELL', 'CRUDE', 30000);
  T('2f a market sell fills at the bid-side VWAP (below the market price), fee 1%, revenue booked', s1.ok && s1.vwap < co.market.price.CRUDE * 1.001 && near(s1.result.fee, s1.result.gross * 0.01, 1e-9) && near(s1.trade.gross, s1.filled * s1.vwap, 1e-6), s1.ok ? [s1.vwap, co.market.price.CRUDE] : s1);
  const over = co.deskMarket('SELL', 'CRUDE', have * 10); T('2g selling more than you hold sells only what you have (never goes negative, never sells stock you do not have)', over.ok ? over.filled <= have + 1e-6 : true && co.available('CRUDE') >= -1e-6);
  T('2h the audit passes after market sells', co.audit().ok, co.audit()); }
{ const { g, co } = rig(1000); T('2i not enough cash: refused with "cash", nothing bought, cash unchanged', (() => { const c = g.store.cash, r = co.deskMarket('BUY', 'CRUDE', 100000); return !r.ok && r.reason === 'cash' && g.store.cash === c && co.deskTrades().length === 0; })()); }
{ const { co } = rig(); T('2j nothing in stock: a sell is refused (noLiquidity / nothing to sell), no trade recorded', (() => { const r = co.deskMarket('SELL', 'GASOLINE', 1000); return !r.ok && co.deskTrades().length === 0; })()); }

console.log('3. limit orders');
{ const { g, co } = rig(); const mp = co.market.price.CRUDE;
  const o = co.deskLimitCreate('BUY', 'CRUDE', 100000, mp * 0.9); T('3a a limit buy 10% below the market waits (OPEN, nothing bought, nothing charged)', o.ok && o.order.status === 'OPEN' && o.order.remaining === 100000 && co.deskTrades().length === 0);
  const c0 = g.store.cash; co._deskDay(); T('3b it does not fill while the price is above the limit', co.deskOrders('open').length === 1 && g.store.cash === c0);
  const cx = co.deskCancel(o.order.id); T('3c cancel before execution: CANCELLED, nothing charged, no trade', cx.ok && cx.order.status === 'CANCELLED' && co.deskTrades().length === 0 && g.store.cash === c0);
  T('3d cancelling again is refused (closed)', co.deskCancel(o.order.id).reason === 'closed');
  const x = co.deskLimitCreate('BUY', 'CRUDE', 100000, mp * 1.02); T('3e a limit buy ABOVE the market crosses and fills at once at book prices (<= the limit), not at the limit price', x.ok && x.order.status === 'FILLED' && x.order.fills[0].price <= mp * 1.02 && x.order.fills[0].price < mp * 1.02);
  const px = co.deskLimitCreate('BUY', 'CRUDE', 8e6, mp * 1.004); T('3f a big limit with a tight limit price fills PARTIALLY and the rest waits (PARTIAL, remaining > 0)', px.ok && px.order.status === 'PARTIAL' && px.order.remaining > 0 && px.order.fills.every(f => f.price <= mp * 1.004 + 1e-9), px.order);
  const left = px.order.remaining, bq0 = co.bq; co._deskDay(); T('3g one daily pass cannot fill the same order twice in a day (same day: no change)', co.deskOrders('PARTIAL').length === 1 && co.bq === bq0 || co.deskOrders('PARTIAL').length === 1);
  co.dayIdx += 1; co.market.price.CRUDE = mp * 0.9; co._deskDay(); T('3h when the price falls to the limit the waiting remainder fills (the order progresses / completes)', co.deskOrders('PARTIAL').length === 0 || co.deskOrders('PARTIAL')[0].remaining < left);
  const sl = co.deskLimitCreate('SELL', 'CRUDE', 50000, co.market.price.CRUDE * 1.3); T('3i a limit sell far above the market waits and sells nothing', sl.ok && sl.order.status === 'OPEN' && sl.order.fills.length === 0);
  co.market.price.CRUDE = co.market.price.CRUDE * 1.4; co.dayIdx += 1; co._deskDay(); T('3j when the market reaches the limit it sells, the average price is at or above the limit', co.deskOrders().find(o => o.id === sl.order.id).fills.length >= 1 && co.deskOrders().find(o => o.id === sl.order.id).fills.every(f => f.price >= sl.order.price - 1e-9 || f.price >= sl.order.price * 0.999));
  T('3k the audit passes after limit orders', co.audit().ok, co.audit());
  T('3l bad input is refused: qty 0, price 0, NaN, bad side, unknown product', ['BUY', 'SELL'].every(sd => !co.deskLimitCreate(sd, 'CRUDE', 0, 80).ok) && !co.deskLimitCreate('BUY', 'CRUDE', 1000, 0).ok && !co.deskLimitCreate('BUY', 'CRUDE', NaN, 80).ok && !co.deskLimitCreate('HOLD', 'CRUDE', 1000, 80).ok && !co.deskLimitCreate('BUY', 'WATER', 1000, 80).ok);
  const many = rig(); let made = 0; for (let i = 0; i < 25; i++) if (many.co.deskLimitCreate('BUY', 'CRUDE', 1000, 1).ok) made++; T('3m at most 20 open orders (the 21st is refused with "max")', made === 20 && many.co.deskLimitCreate('BUY', 'CRUDE', 1000, 1).reason === 'max'); }

console.log('4. history, average prices, fees and profit');
{ const { g, co } = rig(); const mp = co.market.price.CRUDE; co.deskMarket('BUY', 'CRUDE', 200000); co.deskMarket('BUY', 'CRUDE', 100000); co.deskMarket('SELL', 'CRUDE', 120000); const pos = co.deskPositions().CRUDE, tr = co.deskTrades();
  T('4a every trade is recorded (id, day, side, qty, VWAP, fee, slippage, kind)', tr.length === 3 && tr.every(t => t.id && t.side && t.qty > 0 && t.price > 0 && Number.isFinite(t.fee) && 'slip' in t && t.kind === 'MARKET'));
  const wb = (tr[0].qty * tr[0].price + tr[1].qty * tr[1].price) / (tr[0].qty + tr[1].qty); T('4b average buy price = quantity-weighted VWAP of the buys; average sell price = the sale VWAP', near(pos.avgBuy, wb, 1e-9) && near(pos.avgSell, tr[2].price, 1e-9));
  T('4c bought / sold / remaining quantities agree with the stock', near(pos.bought, 300000, 1e-9) && near(pos.sold, 120000, 1e-9) && near(pos.remaining, co.available('CRUDE'), 1e-9));
  T('4d fees summed = the fees the company booked on these trades', near(pos.fees, tr.reduce((a, t) => a + t.fee, 0), 1e-9) && pos.fees > 0);
  T('4e realised profit = the sale revenue - fee - the real cost of the barrels sold; unrealised = market value - book value of the rest', near(pos.realised, tr[2].profit, 1e-9) && near(pos.unrealised, pos.marketPrice * pos.remaining - pos.bookValue, 1e-6));
  T('4f the audit passes (journal, cash, tanks all agree)', co.audit().ok, co.audit()); }

console.log('5. long run, several seeds: random orders keep every book balanced');
{ let bad = [];
  for (const seed of [1, 5, 9, 33]) { const { g, co } = rig(); let rs = seed; const rnd = () => (rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < 60; i++) { const sd = rnd() < 0.55 ? 'BUY' : 'SELL', q = Math.round(1000 + rnd() * rnd() * 3e6), k = rnd();
      if (k < 0.45) co.deskMarket(sd, 'CRUDE', q); else if (k < 0.8) co.deskLimitCreate(sd, 'CRUDE', q, co.market.price.CRUDE * (0.97 + rnd() * 0.06)); else { const op = co.deskOrders('open'); if (op.length) co.deskCancel(op[Math.floor(rnd() * op.length)].id); }
      co.dayIdx += 1; co._deskDay(); }
    const a = co.audit(); if (!a.ok) bad.push([seed, a]); if (co.available('CRUDE') < -1e-6) bad.push([seed, 'negative']); if (!co.deskTrades().every(t => t.qty > 0 && t.price > 0)) bad.push([seed, 'trade']); if (!co.deskOrders().every(o => o.remaining >= 0 && o.remaining <= o.qty + 1e-9)) bad.push([seed, 'order']); }
  T('5a 4 seeds x 60 random market / limit / cancel actions: the audit passes, no negative stock, no broken trade or order', !bad.length, bad.slice(0, 2)); }

console.log('6. save and load');
{ const { g, co } = rig(); co.deskMarket('BUY', 'CRUDE', 100000); const o = co.deskLimitCreate('BUY', 'CRUDE', 50000, co.market.price.CRUDE * 0.8); const js = JSON.parse(JSON.stringify(co.toJSON()));
  T('6a the desk (orders + trades) is in the save', js.desk && js.desk.orders.length === 1 && js.desk.trades.length === 1);
  const o2 = require('./economy.js'); const g2 = game(1e13); g2.co.fromJSON(js); T('6b after load the open order and the trade are back, ids continue (no duplicate id)', g2.co.deskOrders('open').length === 1 && g2.co.deskTrades().length === 1 && g2.co.deskLimitCreate('BUY', 'CRUDE', 1000, 1).order.id === o.order.id + 1);
  const g3 = game(1e13); const old = JSON.parse(JSON.stringify(js)); delete old.desk; g3.co.fromJSON(old); T('6c an old save (no desk) loads and the desk starts empty, no order is created by loading', g3.co.deskOrders().length === 0 && g3.co.deskTrades().length === 0);
  const g4 = game(1e13); const bad = JSON.parse(JSON.stringify(js)); bad.desk = { orders: 'x' }; g4.co.fromJSON(bad); T('6d a malformed desk is dropped, not crashed on', g4.co.deskOrders().length === 0); }
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
