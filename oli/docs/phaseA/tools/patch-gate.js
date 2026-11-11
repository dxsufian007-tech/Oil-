const fs = require('fs'); const f = '/tmp/wt-b2/oli/economy.js'; let s = fs.readFileSync(f, 'utf8');
const start = s.indexOf("      this.matLimit = 1; { const MUg"), endMark = "this.matLimit = Math.min(this.matLimit, lim); } }\n", end = s.indexOf(endMark, start);
if (start < 0 || end < 0) throw new Error('block'); const block = s.slice(start, end + endMark.length);
s = s.slice(0, start) + "      this._gateMaterials(items, dt);\n" + s.slice(end + endMark.length);
const method = "    /* the refinery's material limit: the share of its capacity that the chemicals and operating materials on hand allow for a step of dt days. Set BEFORE the simulator draws crude (no crude leaves the tanks without being processed) and again when materials arrive, so a purchase lifts the limit at once instead of at the next hourly tick */\n    _gateMaterials(items, dt) { const S = this.sim;\n" + block.replace("      this.matLimit = 1; {", "      this.matLimit = 1; {").replace(/\n$/, "") + " }\n";
const anchor = "    buy(item, qty, supplierId, terms) {"; if (s.split(anchor).length !== 2) throw new Error('anchor'); s = s.replace(anchor, () => method + anchor);
const a = "      } else this.mats[item] += got;"; if (s.split(a).length !== 2) throw new Error('buy tail'); s = s.replace(a, () => "      } else { this.mats[item] += got; if (item === 'CHEM' || item === 'OPS') this._gateMaterials(this.store.list(), 1 / 24); }");
fs.writeFileSync(f, s); console.log('ok');
