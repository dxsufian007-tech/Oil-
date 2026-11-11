const fs = require('fs');
function patch(file, pairs) { let s = fs.readFileSync(file, 'utf8'); for (const [a, b] of pairs) { const n = s.split(a).length - 1; if (n !== 1) throw new Error(file + ' ' + n + ': ' + a.slice(0, 70)); s = s.replace(a, () => b); } fs.writeFileSync(file, s); console.log('patched', file); }
patch('/tmp/wt-b2/oli/test-industry.js', [[
  "T('product = throughput x yield x efficiency', Math.abs(m.GASOLINE - S(g.ref).crude * .45 * S(g.ref).eff) / Math.max(1, m.GASOLINE) < .05, [m.GASOLINE, S(g.ref).crude * .45 * S(g.ref).eff]);",
  "T('product = crude processed x yield (efficiency limits the crude taken in; it never multiplies the yield)', Math.abs(m.GASOLINE - S(g.ref).crude * .45) / Math.max(1, m.GASOLINE) < .05, [m.GASOLINE, S(g.ref).crude * .45]);"]]);
patch('/tmp/wt-b2/oli/test-refinery-accounting.js', [
  ["  const yGas = a.GASOLINE / a.feed, expected = e * 0.45;\n  T('4 efficiency is applied once: gasoline = feed x efficiency x 45%', near(yGas, expected, 1e-3), { yGas, expected, eff: e });",
   "  const yGas = a.GASOLINE / a.feed, expected = 0.45;\n  T('4 efficiency limits the crude taken in and never multiplies the yield: gasoline = processed x 45%', near(yGas, expected, 1e-3), { yGas, expected, eff: e });"],
  ["  T('5 the loss is the part of the feed the efficiency does not convert, not a hidden deduction', near(a.loss + a.flared, a.feed * (1 - e), 0.02), { loss: a.loss, want: a.feed * (1 - e), eff: e });",
   "  T('5 loss is only the physical-loss rate (0 by default), never the efficiency gap', near(a.loss + a.flared, a.feed * (require('./building-config.js').REFINERY.physicalLoss || 0), 1e-6), { loss: a.loss, eff: e });"]]);
patch('/tmp/wt-b2/oli/test-economy-ui.js', [[
  "__lab.company.speed = 0; __lab.company.advanceHours(24 * 25); __lab.EU.hud(); });",
  "__lab.company.speed = 0; for (let d = 0; d < 25; d++) { for (const m of ['CHEM', 'OPS']) { const room = Math.floor(__lab.company.roomFor(m)); if (room > 0) __lab.company.buy(m, room, 'A', 'CASH'); } __lab.company.advanceHours(24); } __lab.EU.hud(); });"]]);
