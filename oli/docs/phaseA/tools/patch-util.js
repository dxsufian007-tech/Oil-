const fs = require('fs'); const f = '/tmp/wt-b2/oli/industry.js'; let s = fs.readFileSync(f, 'utf8');
const a = "const util = clamp((s._in || 0) / cap + thr / cap, 0, 1), water";
const b = "const util = clamp(lim, 0, 1), water";   // design load (throttle x material limit), NOT the accepted crude: accepted crude depends on efficiency, so using it creates a feedback loop that collapses the plant
if (s.split(a).length !== 2) throw new Error('match'); s = s.replace(a, () => b); fs.writeFileSync(f, s); console.log('ok');
