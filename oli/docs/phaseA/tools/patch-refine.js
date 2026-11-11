const fs = require('fs');
function patch(file, pairs) {
  let s = fs.readFileSync(file, 'utf8');
  for (const [a, b] of pairs) { const n = s.split(a).length - 1; if (n !== 1) throw new Error(file + ': ' + n + ' matches for: ' + a.slice(0, 80)); s = s.replace(a, () => b); }
  fs.writeFileSync(file, s); console.log('patched', file, pairs.length);
}
patch('/tmp/wt-b2/oli/industry.js', [
  ["      const outs = [['GASOLINE', 'GASOLINE_OUT', P.GASOLINE],",
   "      // three separate things: the yield (R.yields, the recipe), the efficiency (eff: how much of the crude that enters is actually processed; the rest stays in the tank) and the physical loss (R.physicalLoss, a separate, calibrated fraction of what is processed). Efficiency is never booked as a loss.\n      const passF = eff * (1 - (R.physicalLoss || 0));\n      const outs = [['GASOLINE', 'GASOLINE_OUT', P.GASOLINE],"],
  ["const want = thr * R.yields[y] / 100 * eff; if (want > 0)", "const want = thr * R.yields[y] / 100 * passF; if (want > 0)"],
  ["      thr *= th;\n", "      thr *= th; const consumed = thr * eff;   // the crude actually taken from the feed\n"],
  ["const rate = thr * R.yields[y] / 100 * eff;", "const rate = thr * R.yields[y] / 100 * passF;"],
  ["const oth = thr * R.yields.OTHER / 100 * eff;", "const oth = thr * R.yields.OTHER / 100 * passF;"],
  ["s._in = (s._in || 0) + thr; s.crude += thr * this.dt;", "s._in = (s._in || 0) + consumed; s.crude += consumed * this.dt;"],
  ["      return thr;\n    }\n\n    /* ---- one step of dt days ---- */", "      return consumed;\n    }\n\n    /* ---- one step of dt days ---- */"],
]);
patch('/tmp/wt-b2/oli/building-config.js', [
  ["    otherSplit: { BYPRODUCT: 0.6, RESIDUE: 0.3, FUEL: 0.1 },",
   "    otherSplit: { BYPRODUCT: 0.6, RESIDUE: 0.3, FUEL: 0.1 },\n    // physical loss: the fraction of the processed crude that is lost in the plant (not efficiency). Not calibrated yet: 0 until the recipe is reviewed.\n    physicalLoss: 0,\n    // gas is booked in barrel-equivalent (برميل مكافئ). Conversion of refinery gas volume to barrel-equivalent. Provisional 1.0 until the gas basis is confirmed.\n    gasBblEqPerUnit: 1,"],
]);
