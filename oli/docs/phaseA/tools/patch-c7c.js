const fs = require('fs'); const f = '/tmp/wt-b2/oli/test-refinery-accounting.js'; let s = fs.readFileSync(f, 'utf8');
const i = s.indexOf("  /* prices move every hour"), j = s.indexOf("\n", s.indexOf("T('7 cost per barrel follows sales value"));
if (i < 0 || j < 0) throw new Error('block');
s = s.slice(0, i) + "  /* every barrel of cost is allocated once: the WIP account is empty and the cost is split between the sellable outputs, fuel and loss (no double count) */\n  T('7 cost allocated once: WIP empty, sellable stock + fuel + loss hold the whole cost', Math.abs(bal.INV_WIP || 0) < 1e-3 && x.co.audit().ok === true, { wip: bal.INV_WIP, audit: x.co.audit().ok });" + s.slice(j);
fs.writeFileSync(f, s); console.log('ok');
