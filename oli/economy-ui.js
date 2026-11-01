/* Oli - economy-ui.js  (Phase 3 screens: HUD, Company, Market, Sell, Inventory, Production, Contracts, Loans, Alerts, "While you were away", building ECONOMICS tab)
 * Cards, charts and big numbers; no spreadsheets.  Mobile first: one column, 44 px touch targets, the sheet scrolls vertically and never moves the map camera.
 * Every number comes from OliEconomy / OliEconomyConfig - nothing is hard-coded here.
 */
(function () {
  'use strict';
  const E = OliEconomy, EC = OliEconomyConfig, M = E.fmtMoney, SELL = EC.PRODUCTS, $ = id => document.getElementById(id), n0 = v => Math.round(v).toLocaleString('en-US'), sg = v => (v >= 0 ? '+' : '') + M(v), pc = (v, d) => (v >= 0 ? '+' : '') + (v * 100).toFixed(d == null ? 1 : d) + '%';
  const CSS = `
#eco-hud{position:absolute;left:6px;right:6px;top:54px;height:40px;display:flex;gap:4px;align-items:stretch;z-index:7;pointer-events:none}
#eco-hud>*{pointer-events:auto;background:rgba(27,34,44,.94);border:1px solid #33404f;border-radius:10px}
#eco-hud .cell{flex:1 1 0;min-width:0;padding:3px 7px;display:flex;flex-direction:column;justify-content:center;line-height:1.15;overflow:hidden}
#eco-hud .cell small{font-size:9px;color:var(--mut);letter-spacing:.06em;white-space:nowrap}#eco-hud .cell b{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#eco-hud button{flex:0 0 auto;min-width:40px;min-height:40px;padding:0 8px;font-weight:700;position:relative}#eco-hud .pos{color:#8dffb0}#eco-hud .neg{color:#ff9a8a}
#eh-badge{position:absolute;right:-3px;top:-4px;background:#d9453a;color:#fff;border-radius:9px;font-size:10px;min-width:16px;height:16px;line-height:16px;text-align:center;display:none}
#eco-sheet{position:fixed;inset:0;z-index:30;background:var(--bg);display:none;flex-direction:column;touch-action:pan-y}#eco-sheet.open{display:flex}
#eco-sheet .top{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #33404f}#eco-sheet .top b{flex:1;font-size:15px;letter-spacing:.04em}
#es-tabs{display:flex;gap:4px;padding:6px 8px;overflow-x:auto;touch-action:pan-x;border-bottom:1px solid #33404f;flex:0 0 auto}#es-tabs button{flex:0 0 auto;min-height:38px;padding:4px 12px;border-radius:18px;font-size:12px}#es-tabs button.on{background:#2f6fb0;border-color:#2f6fb0;color:#fff}
#es-body{flex:1;overflow-y:auto;overflow-x:hidden;padding:10px;-webkit-overflow-scrolling:touch;touch-action:pan-y;padding-bottom:40px}
.es-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}.es-card{background:var(--panel);border:1px solid #33404f;border-radius:12px;padding:10px 12px;margin-bottom:10px}.es-grid .es-card{margin:0}
.es-card h5{margin:0 0 6px;font-size:11px;color:var(--mut);letter-spacing:.07em;font-weight:600}.es-big{font-size:21px;font-weight:700}.es-sm{font-size:11px;color:var(--mut)}
.es-kv{display:flex;justify-content:space-between;gap:10px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.05)}.es-kv:last-child{border:0}.es-kv span:first-child{color:var(--mut)}
.pos{color:#8dffb0}.neg{color:#ff9a8a}.warn{color:#ffd27a}.es-bar{height:8px;background:#0e1319;border-radius:4px;overflow:hidden;margin:6px 0}.es-bar i{display:block;height:100%;background:#4f8fc0}
.es-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.es-row button{min-height:44px;flex:1 1 auto}.es-row button.on{background:var(--acc);color:#222;border-color:var(--acc)}
.es-tbl{width:100%;border-collapse:collapse}.es-tbl td,.es-tbl th{padding:4px 4px;text-align:right}.es-tbl td:first-child,.es-tbl th:first-child{text-align:left;color:var(--mut)}.es-tbl th{font-size:11px;color:var(--mut);font-weight:600}
.es-banner{padding:10px 12px;border-radius:12px;margin-bottom:10px;font-weight:600}.es-banner.warn{background:#4a3a14;color:#ffd27a}.es-banner.crit{background:#4a1d19;color:#ff9a8a}
.es-prod{display:flex;align-items:center;gap:10px}.es-prod .dot{width:10px;height:10px;border-radius:50%}.es-prod .nm{flex:1;font-weight:600}
.es-in{width:100%;font-size:20px;padding:10px;text-align:right;min-height:48px}#eco-away{position:fixed;inset:0;z-index:40;background:rgba(5,8,12,.82);display:none;align-items:center;justify-content:center;padding:14px}#eco-away.open{display:flex}
#eco-away .box{background:var(--panel);border:1px solid #4b5a6b;border-radius:14px;padding:16px;max-width:420px;width:100%;max-height:90%;overflow:auto}#eco-away h3{margin:0 0 10px;letter-spacing:.05em}
.es-alert{border-left:4px solid #4f8fc0;padding:8px 10px;background:var(--panel);border-radius:8px;margin-bottom:8px}.es-alert.warn{border-color:#e6a13a}.es-alert.crit{border-color:#d9453a}.es-alert b{display:block}
`;
  const COL = { CRUDE: '#a58a6a', GASOLINE: '#e0584a', DIESEL: '#e2b32c', JET_FUEL: '#4aa3ff', GAS: '#8fd694' };
  let CO = null, tab = 'company', sellP = 'CRUDE', sellQ = null, range = 24, prodRange = 'daily', loanAmt = 10000000, loanTerm = 24, toastFn = null, onChange = () => { }, timer = null, mkt = 'CRUDE', econOpen = false;

  const kv = (a, b, cls) => '<div class="es-kv"><span>' + a + '</span><span class="' + (cls || '') + '">' + b + '</span></div>';
  const card = (t, body) => '<div class="es-card"><h5>' + t + '</h5>' + body + '</div>';
  const big = (t, v, sub, cls) => '<div class="es-card"><h5>' + t + '</h5><div class="es-big ' + (cls || '') + '">' + v + '</div>' + (sub ? '<div class="es-sm">' + sub + '</div>' : '') + '</div>';
  const cl = v => v > 0 ? 'pos' : v < 0 ? 'neg' : '';

  function spark(vals, w, h) {
    if (!vals || vals.length < 2) return ''; w = w || 320; h = h || 120; const pad = 6, mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals), rg = (mx - mn) || 1, pts = vals.map((v, i) => [pad + i * (w - 2 * pad) / (vals.length - 1), h - 16 - (v - mn) / rg * (h - 32)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' '), up = vals[vals.length - 1] >= vals[0], col = up ? '#8dffb0' : '#ff9a8a';
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" style="display:block"><path d="' + d + ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + (h - 2) + ' L' + pts[0][0].toFixed(1) + ' ' + (h - 2) + 'Z" fill="' + col + '" opacity=".12"/><path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2" stroke-linejoin="round"/>'
      + '<text x="' + pad + '" y="11" fill="#9aa3ad" font-size="10">$' + mx.toFixed(2) + '</text><text x="' + pad + '" y="' + (h - 3) + '" fill="#9aa3ad" font-size="10">$' + mn.toFixed(2) + '</text></svg>';
  }
  const arrow = t => t === 'UP' ? '<span class="pos">▲ UP</span>' : t === 'DOWN' ? '<span class="neg">▼ DOWN</span>' : '<span class="es-sm">■ STABLE</span>';
  const SECTIONS = [['company', 'COMPANY'], ['market', 'MARKET'], ['sell', 'SELL'], ['inventory', 'INVENTORY'], ['production', 'PRODUCTION'], ['contracts', 'CONTRACTS'], ['loans', 'LOANS'], ['alerts', 'ALERTS']];

  /* ------------------------------------------------------------ screens */
  function rCompany() {
    const s = CO.summary(), m = s.month, t = s.today, y = s.year, f = s.fin; let h = '';
    if (f.state !== 'OK') h += '<div class="es-banner ' + (f.state === 'WARNING' ? 'warn' : 'crit') + '">' + { WARNING: 'FINANCIAL WARNING — cash is negative, new purchases are blocked', EMERGENCY_CREDIT: 'EMERGENCY CREDIT — the bank covered the gap at a high rate', DEBT_PRESSURE: 'DEBT PRESSURE — no new loans; sell products or demolish assets', BANKRUPT: 'BANKRUPT' }[f.state] + ' · ' + Math.floor(f.negHours / 24) + ' days below zero</div>';
    h += '<div class="es-grid">' + big('CASH', M(s.cash), 'Net ' + sg(s.dayNet) + ' / day', s.cash < 0 ? 'neg' : '') + big('COMPANY VALUE', M(s.value), 'Assets + Cash + Inventory − Debt') + big('ASSETS', M(s.assets), CO.store.list().length + ' buildings · ' + CO.net.lines.size + ' pipelines') + big('DEBT', M(s.debt), CO.loans.length + ' loan(s)', s.debt > 0 ? 'warn' : '') + big('INVENTORY', M(s.inventoryValue), 'at market prices') + big('THIS MONTH', sg(m.netProfit), 'Net profit', cl(m.netProfit)) + '</div>';
    h += card('REVENUE · EXPENSES · PROFIT', '<table class="es-tbl"><tr><th></th><th>Today</th><th>Month</th><th>Year</th></tr><tr><td>Revenue</td><td>' + M(t.revenue) + '</td><td>' + M(m.revenue) + '</td><td>' + M(y.revenue) + '</td></tr><tr><td>Expenses</td><td>' + M(t.expenses) + '</td><td>' + M(m.expenses) + '</td><td>' + M(y.expenses) + '</td></tr><tr><td>Net profit</td><td class="' + cl(t.netProfit) + '">' + sg(t.netProfit) + '</td><td class="' + cl(m.netProfit) + '">' + sg(m.netProfit) + '</td><td class="' + cl(y.netProfit) + '">' + sg(y.netProfit) + '</td></tr></table>');
    h += card('CASH FLOW · THIS MONTH', kv('Starting cash', M(m.cash.start)) + kv('Cash in', '+' + M(m.cash.in), 'pos') + kv('Cash out', '−' + M(m.cash.out), 'neg') + kv('Ending cash', M(m.cash.end)));
    const L = m.L, ex = [['Operating', L.operating], ['Maintenance', L.maintenance], ['Energy', L.energy], ['Labor', L.labor], ['Storage', L.storage], ['Lifting & chemicals', L.lifting + L.chem], ['Insurance', L.insurance], ['Administration', L.admin], ['Pipeline upkeep', L.infra], ['Sales fees', L.fees], ['Penalties', L.penalty], ['Loan interest', L.interest], ['Tax', L.tax]].filter(e => e[1] > 0);
    h += card('MONTHLY EXPENSES', ex.length ? ex.map(e => kv(e[0], M(e[1]))).join('') : '<div class="es-sm">Nothing spent yet this month.</div>');
    const st = s.staff; h += card('EMPLOYEES', '<div class="es-big">' + n0(st.total) + '</div><div class="es-sm">Monthly payroll ' + M(st.payroll) + ' (paid every 30 days)</div>' + kv('Operators', n0(st.operators)) + kv('Engineers', n0(st.engineers)) + kv('Maintenance', n0(st.maintenance)) + kv('Managers', n0(st.managers)));
    const p = s.power, nx = EC.POWER.tiers[CO.tier + 1]; h += card('POWER' + (p.limited ? ' · POWER LIMITED' : ''), '<div class="es-sm">' + n0(p.demand) + ' kW of ' + n0(p.cap) + ' kW (' + p.tierName + ')</div><div class="es-bar"><i style="width:' + Math.min(100, p.cap ? p.demand / p.cap * 100 : 0) + '%;background:' + (p.limited ? '#d9453a' : '#4f8fc0') + '"></i></div>' + (p.limited ? '<div class="warn">Efficiency is reduced until you add capacity.</div>' : '')
      + (nx ? '<div class="es-row"><button data-act="grid">Upgrade to ' + nx.name + ' (' + n0(nx.kw) + ' kW) · ' + M(nx.connect) + ' + ' + M(nx.monthly) + '/mo</button></div>' : ''));
    const worn = CO.store.list().filter(b => b.c < 0.999 && b.st !== 'UNDER_CONSTRUCTION'), cost = worn.reduce((a, b) => a + CO.repairCost(b), 0);
    h += card('MAINTENANCE', kv('Auto-maintenance', CO.autoRepair ? 'ON (repairs below ' + Math.round(EC.MAINTENANCE.autoRepairBelow * 100) + '%)' : 'OFF') + kv('Worn buildings', worn.length) + '<div class="es-row"><button data-act="auto">' + (CO.autoRepair ? 'Turn auto-maintenance off' : 'Turn auto-maintenance on') + '</button><button data-act="repairall"' + (worn.length ? '' : ' disabled') + '>Repair all · ' + M(cost) + '</button></div>');
    const rm = CO.refiningMargin(); if (rm.refineries) h += card('REFINING MARGIN', '<div class="es-big ' + cl(rm.margin) + '">' + sg(rm.margin) + ' / day</div><div class="es-sm">Product revenue − crude opportunity cost − energy − labor − maintenance − operating</div>');
    h += card('TAX', kv('Tax rate', Math.round(EC.TAX.rate * 100) + '% of taxable profit') + kv('Losses carried forward', M(s.taxCarry)) + kv('Paid this year', M(y.tax)));
    return h;
  }
  function rMarket() {
    const inv = CO.inventory(), cur = inv.find(v => v.product === mkt) || inv[0], hrs = range, vals = CO.market.series(mkt, hrs, hrs > 200 ? 120 : 0); let h = '';
    h += '<div class="es-card"><h5>' + cur.label.toUpperCase() + ' · $' + cur.marketPrice.toFixed(2) + ' ' + arrow(cur.trend) + '</h5>' + spark(vals) + '<div class="es-row" style="margin-top:4px">' + [[24, '24h'], [168, '7 Days'], [720, '30 Days']].map(r => '<button data-act="range" data-v="' + r[0] + '" class="' + (range === r[0] ? 'on' : '') + '">' + r[1] + '</button>').join('') + '</div></div>';
    for (const v of inv) {
      h += '<div class="es-card" data-act="pick" data-p="' + v.product + '" style="' + (v.product === mkt ? 'border-color:#4f8fc0' : '') + '"><div class="es-prod"><span class="dot" style="background:' + COL[v.product] + '"></span><span class="nm">' + v.label + '</span><b>$' + v.marketPrice.toFixed(2) + '</b></div>'
        + kv('24h change', '<span class="' + cl(v.change24) + '">' + pc(v.change24) + '</span>') + kv('Trend', arrow(v.trend)) + kv('Your inventory', n0(v.volume) + ' ' + v.unit) + kv('Potential revenue', M(v.potential))
        + '<div class="es-row"><button data-act="mode" data-p="' + v.product + '" data-v="WAIT" class="' + (v.mode === 'WAIT' ? 'on' : '') + '">WAIT</button><button data-act="mode" data-p="' + v.product + '" data-v="SPOT" class="' + (v.mode === 'SPOT' ? 'on' : '') + '">SPOT</button><button data-act="mode" data-p="' + v.product + '" data-v="CONTRACT" class="' + (v.mode === 'CONTRACT' ? 'on' : '') + '">CONTRACT</button><button data-act="sellnow" data-p="' + v.product + '">SELL NOW</button></div></div>';
    }
    h += '<div class="es-sm">WAIT keeps the stock (storage cost continues). SPOT sells automatically when the store is ' + Math.round(EC.AUTOSELL.trigger * 100) + '% full and the price is not weak. CONTRACT delivers to your open contracts.</div>';
    return h;
  }
  function rSell() {
    const v = CO.inventory().find(x => x.product === sellP), q = CO.quote(sellP, sellQ == null ? v.volume : sellQ); if (sellQ == null) sellQ = Math.floor(v.volume);
    let h = '<div class="es-row" style="margin:0 0 8px">' + SELL.map(p => '<button data-act="sellp" data-p="' + p + '" class="' + (p === sellP ? 'on' : '') + '">' + EC.LABEL[p] + '</button>').join('') + '</div>';
    h += card('SELL ' + v.label.toUpperCase(), kv('Available', n0(v.volume) + ' ' + v.unit) + kv('Market price', '$' + v.marketPrice.toFixed(2)) + (sellP === 'CRUDE' ? kv('Crude quality', CO.crudeLabel() + ' × ' + CO.crudeQ.toFixed(2)) : '')
      + '<h5 style="margin-top:10px">QUANTITY</h5><input id="sq-in" class="es-in" type="number" inputmode="numeric" min="0" value="' + Math.floor(sellQ) + '"><div class="es-row">' + [25, 50, 75, 100].map(p => '<button data-act="sellpct" data-v="' + p + '">' + p + '%</button>').join('') + '</div><div id="sq-out">' + sellQuoteHtml() + '</div>');
    return h + '<div class="es-sm">Revenue only comes from selling a product. Oil sitting in a tank is not revenue yet. Selling a lot lowers the price for a few days.</div>';
  }
  function sellQuoteHtml() {
    const q = CO.quote(sellP, sellQ), bad = q.available <= 0 || q.qty <= 0; return kv('Gross', M(q.gross)) + kv('Fees (' + (EC.FEES.spot * 100).toFixed(1) + '%)', '−' + M(q.fee)) + kv('<b>Net</b>', '<b class="pos">' + M(q.net) + '</b>') + '<div class="es-row"><button data-act="sell"' + (bad ? ' disabled' : '') + ' style="' + (bad ? '' : 'background:#2f9e5a;border-color:#2f9e5a;color:#fff') + '">SELL ' + n0(q.qty) + '</button></div>' + (q.available <= 0 ? '<div class="warn">Nothing in storage to sell.</div>' : '');
  }
  function rInventory() {
    return CO.inventory().map(v => '<div class="es-card"><div class="es-prod"><span class="dot" style="background:' + COL[v.product] + '"></span><span class="nm">' + v.label + '</span><b>' + Math.round(v.fill * 100) + '%</b></div><div class="es-bar"><i style="width:' + Math.min(100, v.fill * 100) + '%;background:' + (v.fill >= 0.9 ? '#d9453a' : COL[v.product]) + '"></i></div>'
      + kv('Current volume', n0(v.volume) + ' ' + v.unit) + kv('Capacity', n0(v.capacity) + ' ' + v.unit) + kv('Market value', M(v.value)) + kv('Storage cost', M(v.storageCostDay) + ' / day') + '</div>').join('');
  }
  function rProduction() {
    const pr = CO.production(prodRange), rt = CO.productionRates(), row = (nm, k, c) => '<div class="es-card"><div class="es-prod"><span class="dot" style="background:' + c + '"></span><span class="nm">' + nm + '</span><div style="text-align:right"><div class="es-big" style="font-size:18px">' + n0(pr[k]) + '</div><div class="es-sm">now ' + n0(rt[k]) + ' / day</div></div></div></div>';
    return '<div class="es-row" style="margin:0 0 8px">' + [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']].map(r => '<button data-act="prodr" data-v="' + r[0] + '" class="' + (prodRange === r[0] ? 'on' : '') + '">' + r[1] + '</button>').join('') + '</div><div class="es-sm" style="margin-bottom:8px">Barrels produced in the last ' + (prodRange === 'daily' ? '24 hours' : prodRange === 'weekly' ? '7 days' : '30 days') + '</div>'
      + row('Crude Production', 'crude', COL.CRUDE) + row('Refinery Throughput', 'throughput', '#6faa7d') + row('Gasoline Production', 'gasoline', COL.GASOLINE) + row('Diesel Production', 'diesel', COL.DIESEL) + row('Jet Fuel Production', 'jet', COL.JET_FUEL) + row('Gas Production', 'gas', COL.GAS);
  }
  function rContracts() {
    const now = CO.hours; let h = '<div class="es-card"><h5>ACTIVE (' + CO.activeContracts().length + '/' + EC.CONTRACTS.maxActive + ')</h5>';
    const act = CO.activeContracts(); h += act.length ? act.map(c => { const left = (c.deadline - now) / 24, pct = c.delivered / c.qty * 100, have = CO.available(c.product); return '<div style="margin-bottom:12px"><b>Deliver ' + n0(c.qty) + ' ' + EC.UNIT[c.product] + ' ' + EC.LABEL[c.product] + '</b><div class="es-sm">$' + c.price.toFixed(2) + ' each · ' + Math.max(0, Math.ceil(left)) + ' days left · penalty ' + M(c.penalty) + ' · bonus ' + M(c.reward) + '</div><div class="es-bar"><i style="width:' + pct + '%"></i></div><div class="es-sm">' + n0(c.delivered) + ' / ' + n0(c.qty) + ' delivered · in stock ' + n0(have) + '</div><div class="es-row"><button data-act="deliver" data-id="' + c.id + '"' + (have > 0 ? '' : ' disabled') + '>DELIVER ' + n0(Math.min(have, c.qty - c.delivered)) + '</button></div></div>'; }).join('') : '<div class="es-sm">No active contracts.</div>'; h += '</div>';
    h += '<div class="es-card"><h5>OFFERS</h5>' + CO.offers.map(o => '<div style="margin-bottom:12px"><b>Deliver ' + n0(o.qty) + ' ' + EC.UNIT[o.product] + ' ' + EC.LABEL[o.product] + '</b><div class="es-sm">within ' + o.days + ' days · $' + o.price.toFixed(2) + ' each (market $' + CO.market.price[o.product].toFixed(2) + ') = ' + M(o.value) + '</div><div class="es-sm">Bonus ' + M(o.reward) + ' · penalty if late ' + M(o.penalty) + ' · offer ends in ' + Math.ceil((o.expires - now) / 24) + ' days</div><div class="es-row"><button data-act="accept" data-id="' + o.id + '">ACCEPT</button></div></div>').join('') + '</div>';
    if (CO.history.length) h += card('RECENT', CO.history.slice(0, 5).map(c => kv(EC.LABEL[c.product] + ' ' + n0(c.qty), c.status === 'DONE' ? '<span class="pos">DONE</span>' : '<span class="neg">FAILED −' + M(c.paid || 0) + '</span>')).join(''));
    return h + '<div class="es-sm">Deliver by hand, or set a product to CONTRACT in MARKET to deliver automatically.</div>';
  }
  function rLoans() {
    const q = CO.loanQuote(loanAmt, loanTerm), debt = CO.debt(), mpay = CO.loans.reduce((a, l) => a + l.payment, 0); let h = '<div class="es-grid">' + big('DEBT', M(debt), 'Borrowing room ' + M(q.room)) + big('NEXT PAYMENT', M(mpay), 'in ' + Math.ceil(CO.nextPaymentInDays()) + ' days') + '</div>';
    h += card('YOUR LOANS', CO.loans.length ? CO.loans.map(l => '<div style="margin-bottom:10px"><b>' + (l.kind === 'EMERGENCY' ? 'Emergency credit' : l.purpose) + '</b> <span class="es-sm">' + (l.rate * 100).toFixed(1) + '% · ' + l.paid + '/' + l.months + ' paid</span>' + kv('Principal', M(l.principal)) + kv('Remaining debt', M(l.remaining)) + kv('Monthly payment', M(l.payment)) + '<div class="es-row"><button data-act="repay" data-id="' + l.id + '">Repay ' + M(l.remaining * (1 + EC.LOANS.prepayFee)) + '</button></div></div>').join('') : '<div class="es-sm">No loans.</div>');
    h += card('NEW LOAN', '<h5>AMOUNT</h5><div class="es-row" style="margin-top:0">' + EC.LOANS.amounts.map(a => '<button data-act="lamt" data-v="' + a + '" class="' + (a === loanAmt ? 'on' : '') + '">' + M(a) + '</button>').join('') + '</div><h5 style="margin-top:10px">TERM</h5><div class="es-row" style="margin-top:0">' + EC.LOANS.terms.map(t => '<button data-act="lterm" data-v="' + t + '" class="' + (t === loanTerm ? 'on' : '') + '">' + t + ' mo</button>').join('') + '</div>'
      + kv('Interest rate', (q.rate * 100).toFixed(2) + '% / year') + kv('Monthly payment', M(q.payment)) + kv('Total interest', M(q.totalInterest)) + '<div class="es-row"><button data-act="borrow"' + (q.ok ? '' : ' disabled') + ' style="' + (q.ok ? 'background:#2f9e5a;border-color:#2f9e5a;color:#fff' : '') + '">TAKE LOAN ' + M(loanAmt) + '</button></div>'
      + (q.ok ? '' : '<div class="warn">' + ({ limit: 'Above your borrowing limit (50% of assets, inventory and cash).', debtPressure: 'No new loans under debt pressure.', bankrupt: 'The company is bankrupt.' }[q.reason] || q.reason) + '</div>'));
    return h + '<div class="es-sm">Payment = P·r·(1+r)ⁿ / ((1+r)ⁿ − 1), r = annual rate / 12. Interest is an expense, the principal is not. Paid every 30 days.</div>';
  }
  function rAlerts() {
    const a = CO.alerts(); return a.length ? a.map(x => '<div class="es-alert ' + x.level + '"><b>' + x.title + '</b><span class="es-sm">' + x.detail + '</span></div>').join('') : '<div class="es-card">All clear. No alerts.</div>';
  }
  const R = { company: rCompany, market: rMarket, sell: rSell, inventory: rInventory, production: rProduction, contracts: rContracts, loans: rLoans, alerts: rAlerts };

  /* ------------------------------------------------------------ sheet */
  function render(force) {
    const sh = $('eco-sheet'); if (!sh || !sh.classList.contains('open')) return; const body = $('es-body');
    if (tab === 'sell' && !force) { const o = $('sq-out'); if (o) { o.innerHTML = sellQuoteHtml(); return; } }
    if (!force && document.activeElement && document.activeElement.tagName === 'INPUT') return;
    const st = body.scrollTop; body.innerHTML = R[tab](); body.scrollTop = st;
    for (const b of $('es-tabs').children) b.classList.toggle('on', b.dataset.tab === tab);
    const al = $('es-tabs').querySelector('[data-tab=alerts]'); if (al) { const n = CO.alerts().filter(x => x.level !== 'info').length; al.textContent = 'ALERTS' + (n ? ' (' + n + ')' : ''); }
  }
  function open(t) { tab = t || tab; if (tab === 'sell' && sellQ == null) sellQ = null; $('eco-sheet').classList.add('open'); render(true); }
  function close() { $('eco-sheet').classList.remove('open'); }
  function act(e) {
    const el = e.target.closest('[data-act]'); if (!el || el.disabled) return; const a = el.dataset.act, v = el.dataset.v, p = el.dataset.p, id = +el.dataset.id; let msg = null, redo = true;
    if (a === 'range') range = +v; else if (a === 'pick') { mkt = p; } else if (a === 'mode') { CO.setMode(p, v); msg = EC.LABEL[p] + ': ' + v; e.stopPropagation(); }
    else if (a === 'sellnow') { sellP = p; sellQ = null; tab = 'sell'; } else if (a === 'sellp') { sellP = p; sellQ = null; }
    else if (a === 'sellpct') { sellQ = Math.floor(CO.available(sellP) * +v / 100); }
    else if (a === 'sell') { const inp = $('sq-in'), q = inp ? +inp.value : sellQ, r = CO.sell(sellP, q); msg = r.ok ? 'Sold ' + n0(r.qty) + ' ' + EC.LABEL[sellP] + ' · +' + M(r.net) : 'Cannot sell: ' + r.reason; if (r.ok) sellQ = Math.floor(CO.available(sellP)); }
    else if (a === 'prodr') prodRange = v; else if (a === 'accept') { const r = CO.acceptContract(id); msg = r.ok ? 'Contract accepted' : r.reason === 'tooMany' ? 'Too many active contracts' : 'Offer gone'; }
    else if (a === 'deliver') { const r = CO.deliver(id); msg = r.ok ? 'Delivered ' + n0(r.qty) + ' · +' + M(r.revenue + r.reward) : 'Nothing to deliver'; }
    else if (a === 'lamt') loanAmt = +v; else if (a === 'lterm') loanTerm = +v; else if (a === 'borrow') { const r = CO.takeLoan(loanAmt, loanTerm, 'Expansion'); msg = r.ok ? 'Loan approved · +' + M(loanAmt) : 'Loan refused'; }
    else if (a === 'repay') { const r = CO.repayLoan(id); msg = r.ok ? 'Loan repaid · −' + M(r.paid) : 'Not enough cash'; }
    else if (a === 'grid') { const r = CO.gridUpgrade(); msg = r.ok ? 'Grid upgraded to ' + r.tier.name : r.reason === 'cash' ? 'Not enough cash' : 'Maximum grid'; }
    else if (a === 'auto') { CO.autoRepair = !CO.autoRepair; } else if (a === 'repairall') { const r = CO.repairAll(); msg = 'Repaired ' + r.n + ' · −' + M(r.cost); }
    else redo = false;
    if (msg && toastFn) toastFn(msg); if (redo) { render(true); hud(); onChange(); }
  }

  /* ------------------------------------------------------------ HUD, away report, events */
  function hud() {
    if (!CO) return; const s = CO.summary(), c = s.clock; $('eh-cash').lastChild.textContent = M(s.cash); $('eh-cash').lastChild.className = s.cash < 0 ? 'neg' : ''; const nt = $('eh-net').lastChild; nt.textContent = sg(s.dayNet) + '/d'; nt.className = s.dayNet > 0 ? 'pos' : s.dayNet < 0 ? 'neg' : '';
    $('eh-clock').firstChild.textContent = 'Y' + c.year + ' M' + c.month; $('eh-clock').lastChild.textContent = 'D' + c.dayOfMonth + ' ' + String(c.hour).padStart(2, '0') + ':00'; $('eh-pause').textContent = CO.speed === 0 ? '▶' : '⏸'; $('eh-speed').textContent = (CO.speed || CO.lastSpeed || 1) + '×';
    const n = CO.alerts().filter(x => x.level !== 'info').length, b = $('eh-badge'); b.textContent = n; b.style.display = n ? 'block' : 'none'; const bl = $('eco-bank'); if (CO.bankrupt && bl) showBank();
    const cs = $('cash'); if (cs) cs.textContent = '$' + Math.round(s.cash).toLocaleString('en-US');
  }
  function showAway(r) {
    const box = $('eco-away'); if (!r || !r.ok) return; const rows = [['Away', Math.floor(r.realHours * 60) < 90 ? Math.round(r.realHours * 60) + ' min' : r.realHours.toFixed(1) + ' h', r.capped ? 'capped at ' + EC.OFFLINE.capHours + ' h' : ''], ['Company time', r.gameDays.toFixed(0) + ' days', '']];
    box.querySelector('.box').innerHTML = '<h3>WHILE YOU WERE AWAY</h3>' + rows.map(x => kv(x[0], x[1] + (x[2] ? ' <span class="es-sm">(' + x[2] + ')</span>' : ''))).join('')
      + kv('Produced', n0(r.producedCrude) + ' bbl crude · ' + n0(r.producedProducts) + ' bbl products') + kv('Sold', n0(r.sold) + ' bbl · ' + M(r.soldRevenue)) + kv('Operating cost', M(r.operatingCost)) + kv('Profit / Loss', '<b class="' + cl(r.profit) + '">' + sg(r.profit) + '</b>') + kv('Storage', Math.round(r.storagePct) + '%') + kv('Warnings', r.warnings)
      + '<div class="es-row"><button id="away-ok" style="background:#2f9e5a;border-color:#2f9e5a;color:#fff">CONTINUE</button></div>'; box.classList.add('open'); CO.prevSpeed = CO.speed; CO.speed = 0; window.__awayShown = r;
    $('away-ok').onclick = () => { box.classList.remove('open'); CO.clearAway(); CO.speed = CO.prevSpeed == null ? 1 : CO.prevSpeed; if (CO.speed === 0) CO.speed = 1; hud(); onChange(); };
  }
  function showBank() {
    const b = $('eco-bank'); if (b.classList.contains('open')) return; b.classList.add('open'); b.querySelector('.box').innerHTML = '<h3>BANKRUPT</h3><div class="es-sm" style="margin-bottom:10px">Cash stayed negative for ' + EC.FINANCE.bankruptAfterDays + ' days. The company is insolvent.</div><div class="es-row"><button id="bank-new" class="danger">START A NEW COMPANY</button></div>'; $('bank-new').onclick = () => { b.classList.remove('open'); if (opts.restart) opts.restart(); hud(); };
  }
  function pumpEvents() { for (const ev of CO.drainEvents()) if (toastFn && ev.level !== 'info') toastFn((ev.level === 'crit' ? '⚠ ' : '') + ev.msg); else if (toastFn) toastFn(ev.msg); }

  /* ------------------------------------------------------------ building ECONOMICS tab */
  function buildingHtml(id) {
    const o = CO.economics(id); if (!o) return ''; const d = '<span class="es-sm"> /day</span>', rows = [];
    rows.push(['Condition', Math.round(o.condition * 100) + '% · ' + o.conditionLabel]);
    if (o.type === 'refinery') { rows.push(['Revenue (products)', M(o.productRevenueDay) + '/day'], ['Crude opportunity cost', '−' + M(o.crudeOpportunityDay) + '/day']); }
    if (o.type === 'well') rows.push(['Crude quality', o.quality], ['Revenue if sold', M(o.revenuePotentialDay) + '/day'], ['Lifting cost', '−' + M(o.liftingDay) + '/day']);
    rows.push(['Operating cost', '−' + M(o.operatingDay) + '/day'], ['Maintenance', '−' + M(o.maintenanceDay) + '/day'], ['Energy (' + n0(o.kw) + ' kW)', '−' + M(o.energyDay) + '/day'], ['Labor share', '−' + M(o.laborDay) + '/day']);
    if (o.type === 'refinery') rows.push(['Chemicals', '−' + M(o.chemicalsDay) + '/day'], ['<b>REFINING MARGIN</b>', '<b class="' + cl(o.refiningMarginDay) + '">' + sg(o.refiningMarginDay) + '/day</b>']);
    if (o.type === 'well') rows.push(['<b>Margin</b>', '<b class="' + cl(o.marginDay) + '">' + sg(o.marginDay) + '/day</b>']);
    if (o.type === 'tank' || o.type === 'gas') rows.push(['<b>Storage cost</b>', '<b>−' + M(o.storageCostDay) + '/day</b>'], ['Stored value', M(o.storedValue)]);
    if (o.type === 'pump') rows.push(['Production impact', o.production]);
    rows.push(['Purchase / value', M(o.purchase) + ' / ' + M(o.value)]);
    const b = CO.store.get(id), cost = b ? CO.repairCost(b) : 0;
    return '<table class="kv">' + rows.map(r => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>').join('') + '</table>' + (cost > 1 ? '<div class="row"><button id="bRepair">Repair · ' + M(cost) + '</button></div>' : '');
  }

  /* ------------------------------------------------------------ mount */
  let opts = {};
  function mount(o) {
    opts = o; CO = o.company; toastFn = o.toast; onChange = o.onChange || onChange; const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const hudEl = document.createElement('div'); hudEl.id = 'eco-hud'; hudEl.innerHTML = '<div class="cell" id="eh-cash"><small>CASH</small><b>$0</b></div><div class="cell" id="eh-net"><small>PROFIT</small><b>+$0/d</b></div><div class="cell" id="eh-clock"><small>Y1 M1</small><b>D1 00:00</b></div><button id="eh-pause">⏸</button><button id="eh-speed">1×</button><button id="eh-menu">☰<span id="eh-badge"></span></button>';
    document.body.appendChild(hudEl);
    const sh = document.createElement('div'); sh.id = 'eco-sheet'; sh.innerHTML = '<div class="top"><b>OLI OIL COMPANY</b><button id="es-close">✕</button></div><div id="es-tabs"></div><div id="es-body"></div>'; document.body.appendChild(sh);
    const aw = document.createElement('div'); aw.id = 'eco-away'; aw.innerHTML = '<div class="box"></div>'; document.body.appendChild(aw); const bk = document.createElement('div'); bk.id = 'eco-bank'; bk.innerHTML = '<div class="box"></div>'; bk.style.cssText = 'position:fixed;inset:0;z-index:41;background:rgba(5,8,12,.85);display:none;align-items:center;justify-content:center;padding:14px'; document.body.appendChild(bk);
    const sty = document.createElement('style'); sty.textContent = '#eco-bank.open{display:flex!important}#eco-bank .box{background:var(--panel);border:1px solid #4b5a6b;border-radius:14px;padding:16px;max-width:420px;width:100%}'; document.head.appendChild(sty);
    for (const [k, nm] of SECTIONS) { const b = document.createElement('button'); b.dataset.tab = k; b.textContent = nm; b.onclick = () => { tab = k; render(true); $('es-body').scrollTop = 0; }; $('es-tabs').appendChild(b); }
    $('es-body').addEventListener('click', act); $('es-body').addEventListener('input', e => { if (e.target.id === 'sq-in') { sellQ = Math.max(0, +e.target.value || 0); const out = $('sq-out'); if (out) out.innerHTML = sellQuoteHtml(); } });
    $('es-close').onclick = close; $('eh-menu').onclick = () => { open(); }; $('eh-cash').onclick = () => open('company'); $('eh-net').onclick = () => open('company'); $('eh-clock').onclick = () => open('market');
    $('eh-pause').onclick = () => { if (CO.speed === 0) CO.speed = CO.lastSpeed || 1; else { CO.lastSpeed = CO.speed; CO.speed = 0; } hud(); onChange(); };
    $('eh-speed').onclick = () => { const sp = EC.TIME.speeds.filter(x => x > 0), cur = CO.speed || CO.lastSpeed || 1; CO.speed = sp[(sp.indexOf(cur) + 1) % sp.length]; CO.lastSpeed = CO.speed; hud(); onChange(); };
    for (const id of ['eco-hud', 'eco-sheet', 'eco-away']) for (const ev of ['pointerdown', 'touchstart']) $(id).addEventListener(ev, e => e.stopPropagation(), { passive: true });
    timer = setInterval(() => { hud(); pumpEvents(); if ($('eco-sheet').classList.contains('open')) render(false); }, 1000); hud();
    return api;
  }
  const api = { mount, open, close, render: () => render(true), hud, showAway, buildingHtml, spark, state: () => ({ tab, open: $('eco-sheet').classList.contains('open'), sellP, sellQ, range, mkt }), setSell: (p, q) => { sellP = p; sellQ = q; } };
  window.OliEconomyUI = api;
})();
