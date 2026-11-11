const fs = require('fs'); const f = '/tmp/wt-b2/oli/industry.js'; let s = fs.readFileSync(f, 'utf8');
const pairs = [
 ["      const room = Math.max(0, cap * lim - (s._in || 0)); if (f.r > room + 1e-6 && lim >= 1) s._sat = true; let thr = Math.min(f.r, room); if (thr <= 1e-9) return 0;\n      const util = clamp(lim, 0, 1), water",
  "      const util = clamp(lim, 0, 1), water"],
 ["      // three separate things: the yield (R.yields, the recipe), the efficiency (eff: how much of the crude that enters is actually processed; the rest stays in the tank) and the physical loss (R.physicalLoss, a separate, calibrated fraction of what is processed). Efficiency is never booked as a loss.\n      const passF = eff * (1 - (R.physicalLoss || 0));",
  "      // three separate things: the yield (R.yields, the recipe), the efficiency (eff: the share of nameplate capacity the plant can process in its current state; it limits the crude accepted, the rest stays in the feed/tank) and the physical loss (R.physicalLoss, a separate, calibrated fraction of what is processed). Efficiency is never booked as a loss.\n      const room = Math.max(0, cap * lim * eff - (s._in || 0)); if (f.r > room + 1e-6 && lim >= 1) s._sat = true; let thr = Math.min(f.r, room); if (thr <= 1e-9) return 0;\n      const passF = 1 - (R.physicalLoss || 0);"],
 ["      thr *= th; const consumed = thr * eff;   // the crude actually taken from the feed", "      thr *= th; const consumed = thr;   // the crude actually taken from the feed (all of it is processed; efficiency limited how much was accepted)"],
];
for (const [a, b] of pairs) { if (s.split(a).length !== 2) throw new Error('match: ' + a.slice(0, 70)); s = s.replace(a, () => b); }
fs.writeFileSync(f, s); console.log('ok');
