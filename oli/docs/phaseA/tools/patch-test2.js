const fs = require('fs'); const f = '/tmp/wt-b2/oli/test-refinery-v2.js'; let s = fs.readFileSync(f, 'utf8');
const rep = (a, b) => { if (s.split(a).length !== 2) throw new Error('match: ' + a.slice(0, 80)); s = s.replace(a, () => b); };
// 1. WIP identity: every debit to WIP (crude in + refinery operating) equals every credit (allocations)
const i = s.indexOf("  const pw = R.postsByType.REFINE_IN"), j = s.indexOf("  CHK(tag + ' WIP cleared at the end'");
if (i < 0 || j < 0) throw new Error('cost block');
s = s.slice(0, i) + "  const debit = ['REFINE_IN', 'PROD_REFINERY'].reduce((a, k) => a + ((R.postsByType[k] || {}).INV_WIP || 0), 0);\n  const credit = Object.keys(R.postsByType).filter(k => k.startsWith('REFINE_') && k !== 'REFINE_IN').reduce((a, k) => a - ((R.postsByType[k] || {}).INV_WIP || 0), 0);\n  CHK(tag + ' cost in (crude + refinery operating) = cost out (every barrel cost booked once)', near(debit, credit, 1e-6) || Math.abs(debit - credit) < 1e-3, { debit, credit });\n" + s.slice(j);
// 2. small refinery demand measured on its own plant
rep("const cfgPower = frac => { const c = JSON.parse(JSON.stringify(EC)); c.POWER.tiers[0].kw = Math.round(DEMAND * frac); return c; };",
    "const cfgPower = (frac, size) => { const c = JSON.parse(JSON.stringify(EC)); c.POWER.tiers[0].kw = Math.round((size === 's' ? DEMAND_S : DEMAND) * frac); return c; };\nconst DEMAND_S = (() => { const P = plant('s', fullCfg()); run(P, 1); return P.co.pw.demand; })();");
rep("for (const [name, cfg] of [['full', fullCfg()], ['75', cfgPower(0.75)], ['50', cfgPower(0.5)]])", "for (const [name, cfg] of [['full', fullCfg()], ['75', cfgPower(0.75, 's')], ['50', cfgPower(0.5, 's')]])");
// 3. fuel: the inventory account of fuel is not used (0 movement)
rep("R.delta('INV_FUEL') === undefined", "R.delta('INV_FUEL') === 0");
// 8. the cost identity is the same check
rep("  CHK('8 ledger cost in (crude to refinery) = ledger cost out (inventory + fuel + loss)', near(costOut, costIn + ((R.postsByType.PROD_REFINERY || {}).INV_WIP || 0), 1e-4) || Math.abs(costOut - costIn) < 1e-3 * Math.max(1, costIn), { costIn, costOut }); }",
    "  const dbt = ['REFINE_IN', 'PROD_REFINERY'].reduce((a, k) => a + ((R.postsByType[k] || {}).INV_WIP || 0), 0); CHK('8 ledger cost in = ledger cost out (inventory + fuel + loss)', Math.abs(costOut - dbt) < 1e-3 * Math.max(1, dbt), { costOut, dbt }); }");
fs.writeFileSync(f, s); console.log('ok');
