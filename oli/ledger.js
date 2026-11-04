/* Oli - ledger.js  (Economy Phase 2: the central double-entry journal)
 *
 * Every money movement and every inventory movement of the company is one journal entry: a list of lines
 * [account, amount]  with  amount > 0 = DEBIT, amount < 0 = CREDIT.  An entry whose lines do not add up to zero is refused.
 * Balances are kept per account (life of the company).  The balance sheet and the trial balance are read from these balances,
 * so the assets = liabilities + equity identity holds by construction, and audit() proves it at any time.
 * No DOM here, no game state here.  economy.js is the only writer.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OliLedger = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // account -> [kind, label]   kinds: asset | contra (asset with credit balance) | liab | equity | rev | exp
  const ACC = {
    CASH: ['asset', 'Cash'],
    AR: ['asset', 'Receivables (contracts not paid yet)'],
    INV_CRUDE: ['asset', 'Inventory · crude'],
    INV_GASOLINE: ['asset', 'Inventory · gasoline'],
    INV_DIESEL: ['asset', 'Inventory · diesel'],
    INV_JET_FUEL: ['asset', 'Inventory · jet fuel'],
    INV_GAS: ['asset', 'Inventory · gas'],
    INV_WIP: ['asset', 'Refinery in progress (costs waiting for products)'],
    INV_BYPRODUCT: ['asset', 'Inventory · by-products (sellable)'],
    INV_RESIDUE: ['asset', 'Residues (kept, not for sale)'],
    EXP_FUEL: ['exp', 'Refinery internal fuel'],
    EXP_LOSS: ['exp', 'Refinery losses (recorded, explained)'],
    INV_CHEM: ['asset', 'Inventory · chemicals'],
    INV_PARTS: ['asset', 'Inventory · spare parts'],
    INV_OPS: ['asset', 'Inventory · operating materials'],
    FIXED: ['asset', 'Fixed assets at cost'],
    ACC_DEP: ['contra', 'Accumulated depreciation'],
    PAY_PAYROLL: ['liab', 'Accrued payroll'],
    PAY_TAX: ['liab', 'Tax payable'],
    PAY_SUPPLIERS: ['liab', 'Payables to suppliers (purchases on credit)'],
    LOANS: ['liab', 'Loans'],
    EQUITY: ['equity', 'Paid-in capital'],
    REV_SPOT: ['rev', 'Sales · spot'],
    REV_BYPRODUCT: ['rev', 'Sales · by-products'],
    REV_CONTRACT: ['rev', 'Sales · contracts'],
    REV_OTHER: ['rev', 'Other income'],
    COGS: ['exp', 'Cost of goods sold'],
    EXP_OPERATING: ['exp', 'Operation of tanks'],
    EXP_LABOR: ['exp', 'Salaries'],
    EXP_MAINT: ['exp', 'Repairs'],
    EXP_ENERGY: ['exp', 'Power'],
    EXP_STORAGE: ['exp', 'Storage'],
    EXP_INSURANCE: ['exp', 'Insurance'],
    EXP_ADMIN: ['exp', 'Administration'],
    EXP_INFRA: ['exp', 'Pipeline upkeep'],
    EXP_FEES: ['exp', 'Sales fees'],
    EXP_PENALTY: ['exp', 'Contract penalties'],
    EXP_INTEREST: ['exp', 'Interest'],
    EXP_TAX: ['exp', 'Income tax'],
    EXP_DEP: ['exp', 'Depreciation'],
    EXP_DISPOSAL: ['exp', 'Loss on disposal of assets']
  };
  const KINDS = Object.keys(ACC);
  const EPS = 1e-6, MAX_LOG = 300;

  class Journal {
    constructor() {
      this.bal = {}; for (const k of KINDS) this.bal[k] = 0; this.n = 0; this.log = [];
    }
    /* meta: { type, flow, desc, src } ; lines: [[account, amount], ...] */
    post(meta, lines) {
      let sum = 0, scale = 1;
      for (const [a, v] of lines) {
        if (!(a in ACC)) throw new Error('ledger: unknown account ' + a);
        if (!isFinite(v)) throw new Error('ledger: bad amount on ' + a + ' in ' + meta.type);
        sum += v; scale = Math.max(scale, Math.abs(v));
      }
      if (Math.abs(sum) > EPS * scale) throw new Error('ledger: unbalanced entry ' + meta.type + ' (' + sum + ')');
      for (const [a, v] of lines) this.bal[a] += v;
      this.n++;
      const e = { id: this.n, type: meta.type, flow: meta.flow || 'NONE', desc: meta.desc || '', src: meta.src || '', t: meta.t == null ? 0 : meta.t,
        lines: lines.filter(([, v]) => Math.abs(v) > 1e-9).map(([a, v]) => [a, Math.round(v * 100) / 100]) };
      this.log.push(e); if (this.log.length > MAX_LOG) this.log.shift();
      return e;
    }
    /* sum of all debits minus all credits: must be zero */
    // the tolerance is relative to the size of the books: double arithmetic leaves a residue of about 1e-16 of the gross balances, far below any money that could go missing
    tol() { let g = 0; for (const k of KINDS) g += Math.abs(this.bal[k]); return Math.max(1e-3, 1e-12 * g); }
    check() { let s = 0; for (const k of KINDS) s += this.bal[k]; const tol = this.tol(); return { ok: Math.abs(s) < tol, sum: s, tol }; }
    /* the balance sheet: assets, liabilities, equity (paid-in + accumulated result) */
    balanceSheet() {
      const b = this.bal, sumKind = kind => KINDS.filter(k => ACC[k][0] === kind).reduce((a, k) => a + b[k], 0);
      const assets = sumKind('asset') + sumKind('contra');                          // contra balances are credits (negative): they reduce assets
      const liab = -sumKind('liab'), paidIn = -b.EQUITY, result = -(sumKind('rev') + sumKind('exp'));   // result = net income since the start
      const equity = paidIn + result;
      return { assets, liabilities: liab, equity, paidIn, result, gap: assets - liab - equity };
    }
    toJSON() { return { bal: Object.assign({}, this.bal), n: this.n, log: this.log.slice(-MAX_LOG) }; }
    static fromJSON(d) {
      const j = new Journal(); if (!d || !d.bal) return j;
      for (const k of KINDS) j.bal[k] = +d.bal[k] || 0; j.n = d.n || 0; j.log = Array.isArray(d.log) ? d.log.slice(-MAX_LOG) : []; return j;
    }
  }

  return { ACC, KINDS, Journal };
});
