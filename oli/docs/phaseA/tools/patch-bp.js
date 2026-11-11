const fs = require('fs');
function patch(file, pairs) {
  let s = fs.readFileSync(file, 'utf8');
  for (const [a, b] of pairs) { const n = s.split(a).length - 1; if (n !== 1) throw new Error(file + ': ' + n + ' for ' + a.slice(0, 70)); s = s.replace(a, () => b); }
  fs.writeFileSync(file, s); console.log('patched', file);
}
patch('/tmp/wt-b2/oli/ledger.js', [["    REV_SPOT: ['rev', 'Sales · spot'],", "    REV_SPOT: ['rev', 'Sales · spot'],\n    REV_BYPRODUCT: ['rev', 'Sales · by-products'],"]]);
patch('/tmp/wt-b2/oli/economy-config.js', [["FEES: { spot: 0.01, contract: 0.0025 },",
  "FEES: { spot: 0.01, contract: 0.0025 },\n    // by-products: sold at this share of the current crude price (PROVISIONAL: to be reviewed; no market history yet)\n    BYPRODUCT: { priceRatioToCrude: 0.8 },"]]);
patch('/tmp/wt-b2/oli/economy.js', [
  ["for (const q of PRODS) this.qty[q] += refOut[q]; this.qty2.BYPRODUCT += rf.BYPRODUCT;",
   "for (const q of PRODS) this.qty[q] += refOut[q] * (q === 'GAS' ? B.REFINERY.gasBblEqPerUnit : 1); this.qty2.BYPRODUCT += rf.BYPRODUCT;"],
  ["this.qty.GAS += sepGas; }", "this.qty.GAS += sepGas * B.REFINERY.gasBblEqPerUnit; }"],
  ["    setMode(p, mode) {",
   "    /* ---- by-products: sellable; own inventory and revenue accounts; no physical tank yet (book stock only) ---- */\n" +
   "    byproductPrice() { return Math.max(0, this.price.CRUDE || 0) * this.cfg.BYPRODUCT.priceRatioToCrude; }\n" +
   "    byproductUnitCost() { const q = this.qty2.BYPRODUCT; return q > EPS2 ? Math.max(0, this.journal.bal.INV_BYPRODUCT) / q : 0; }\n" +
   "    byproducts() { return { qty: this.qty2.BYPRODUCT, unitCost: this.byproductUnitCost(), value: Math.max(0, this.journal.bal.INV_BYPRODUCT), price: this.byproductPrice(), residue: this.qty2.RESIDUE, residueValue: Math.max(0, this.journal.bal.INV_RESIDUE) }; }\n" +
   "    sellByproduct(qty) {\n" +
   "      if (this.bankrupt) return { ok: false, reason: 'bankrupt' }; this.sync(); const have = this.qty2.BYPRODUCT;\n" +
   "      if (!(qty > 0) || have <= 1e-6) return { ok: false, reason: 'nothingToSell' }; if (qty > have + 1e-6) return { ok: false, reason: 'notEnough' };\n" +
   "      const got = Math.min(qty, have), price = this.byproductPrice(), gross = got * price, fee = gross * this.cfg.FEES.spot, unit = this.byproductUnitCost();\n" +
   "      const cost = Math.min(Math.max(0, this.journal.bal.INV_BYPRODUCT), got * unit);\n" +
   "      this.qty2.BYPRODUCT = Math.max(0, have - got);\n" +
   "      this._post({ type: 'SALE_BYPRODUCT', flow: 'OP', desc: 'By-product sale', src: 'SPOT' }, [['CASH', gross], ['REV_BYPRODUCT', -gross]]);\n" +
   "      if (cost > 0) this._post({ type: 'COGS', desc: 'Cost of by-products sold' }, [['COGS', cost], ['INV_BYPRODUCT', -cost]]);\n" +
   "      if (this.qty2.BYPRODUCT <= EPS2 && this.journal.bal.INV_BYPRODUCT > 0.01) this._post({ type: 'COGS', desc: 'By-product stock empty: remaining cost written off' }, [['COGS', this.journal.bal.INV_BYPRODUCT], ['INV_BYPRODUCT', -this.journal.bal.INV_BYPRODUCT]]);\n" +
   "      this._expense('fees', fee, 'By-product sale fee'); this._L(L => { L.soldRev += gross; });\n" +
   "      return { ok: true, product: 'BYPRODUCT', qty: got, gross, fee, net: gross - fee, price, cost };\n" +
   "    }\n" +
   "    setMode(p, mode) {"],
]);
