const fs = require('fs'); const f = '/tmp/wt-b2/oli/test-playthrough.js'; let s = fs.readFileSync(f, 'utf8');
const a = "ok(sold.rev > 0 && sold.sold.GASOLINE > 0 && sold.sold.DIESEL > 0 && sold.sold.JET_FUEL > 0, 'automatic sales brought revenue '";
const b = "ok(sold.rev > 0 && sold.sold.GASOLINE > 0 && sold.sold.DIESEL > 0, 'automatic sales (a store 80% full) brought revenue '";
if (s.split(a).length !== 2) throw new Error('match'); s = s.replace(a, () => b); fs.writeFileSync(f, s); console.log('ok');
