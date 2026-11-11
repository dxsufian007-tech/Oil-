const fs = require('fs'); const f = '/tmp/wt-b2/oli/industry.js'; let s = fs.readFileSync(f, 'utf8');
const a = "const util = clamp(lim, 0, 1), water"; const b = "const util = clamp(((s._in || 0) + f.r) / cap, 0, 1), water";  // load = crude offered to the plant (not the accepted crude, which depends on efficiency: that loop collapsed the plant)
if (s.split(a).length !== 2) throw new Error('match'); s = s.replace(a, () => b); fs.writeFileSync(f, s); console.log('ok');
