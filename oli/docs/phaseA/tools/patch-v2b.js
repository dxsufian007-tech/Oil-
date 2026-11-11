const fs = require('fs');
let f = '/tmp/wt-b2/oli/industry.js', s = fs.readFileSync(f, 'utf8');
const a1 = "const util = clamp(((s._in || 0) + f.r) / cap, 0, 1), water";
const b1 = "const util = clamp(lim, 0, 1), water";   // efficiency uses the DESIGN load (throttle x material limit), never the offered or accepted crude: any load term closes a loop with the acceptance
if (s.split(a1).length !== 2) throw new Error('util match'); s = s.replace(a1, () => b1); fs.writeFileSync(f, s);
f = '/tmp/wt-b2/oli/economy.js'; s = fs.readFileSync(f, 'utf8');
const i = s.indexOf("      if (T > 0 && wip > 0) { const per = wip / T"), j = s.indexOf("      if (sepGas > 0)");
if (i < 0 || j < 0 || j < i) throw new Error('block not found ' + i + ' ' + j);
const block = `      // cost allocation: every barrel of crude cost lands exactly once. Fuel and losses are expensed at the average cost of a barrel of feed.
      // Residue has no market value, so it carries no cost (net realisable value). The rest is shared by the sellable outputs in proportion to their sales value
      // (relative sales-value method), so every sellable output keeps the same gross margin %: a cheap barrel does not inherit the cost of an expensive one.
      if (T > 0 && wip > 0) {
        const avg = wip / T, fuCost = Math.min(wip, avg * rf.FUEL), lsCost = Math.min(wip - fuCost, avg * (loss + rf.FLARED)), pool = Math.max(0, wip - fuCost - lsCost);
        const sellable = PRODS.map(q => ({ v: refOut[q] * (q === 'GAS' ? BC.REFINERY.gasBblEqPerUnit : 1), price: this.unitPrice(q), acc: INVACC[q], desc: 'Products · ' + q }))
          .concat([{ v: rf.BYPRODUCT, price: this.byproductPrice(), acc: 'INV_BYPRODUCT', desc: 'By-product (sellable)' }]);
        const wsum = sellable.reduce((a, x) => a + Math.max(0, x.v) * Math.max(0, x.price), 0);
        if (wsum > 0) for (const x of sellable) { const amt = pool * Math.max(0, x.v) * Math.max(0, x.price) / wsum; if (amt > 0.005) this._post({ type: 'REFINE_OUT', desc: x.desc }, [[x.acc, amt], ['INV_WIP', -amt]]); }
        else if (pool > 0.005) this._post({ type: 'REFINE_LOSS', desc: 'Refinery output with no sales value (expensed)' }, [['EXP_LOSS', pool], ['INV_WIP', -pool]]);
        if (fuCost > 0.005) this._post({ type: 'REFINE_FUEL', desc: 'Refinery internal fuel (expense)' }, [['EXP_FUEL', fuCost], ['INV_WIP', -fuCost]]);
        if (lsCost > 0.005) this._post({ type: 'REFINE_LOSS', desc: 'Refinery losses (recorded)' }, [['EXP_LOSS', lsCost], ['INV_WIP', -lsCost]]);
      }
`;
s = s.slice(0, i) + block + s.slice(j); fs.writeFileSync(f, s); console.log('ok');
