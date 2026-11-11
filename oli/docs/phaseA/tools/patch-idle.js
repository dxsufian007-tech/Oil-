const fs = require('fs'); const f = '/tmp/wt-b2/oli/economy.js'; let s = fs.readFileSync(f, 'utf8');
const a = "      if (refCost > 0) this._post({ type: 'PROD_REFINERY'";
const b = "      if (refCost > 0 && prod.THRU <= 0) { this._expense('operating', refin.operating, 'Refinery · idle operation'); this._expense('maintenance', refin.maintenance, 'Refinery · idle maintenance'); this._expense('energy', refin.energy, 'Refinery · idle energy'); }   // no crude processed this hour: a period cost, not carried in stock (otherwise it waits in WIP until the next barrel)\n      else if (refCost > 0) this._post({ type: 'PROD_REFINERY'";
if (s.split(a).length !== 2) throw new Error('match ' + (s.split(a).length - 1)); s = s.replace(a, () => b); fs.writeFileSync(f, s); console.log('ok');
