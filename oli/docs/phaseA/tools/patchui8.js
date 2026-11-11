const fs = require('fs'); const F = '/tmp/wt-b2/oli/economy-ui.js'; let s = fs.readFileSync(F, 'utf8');
const R = [
["room = EC.PRODUCTS.includes(it) ? CO.roomFor(it) : Infinity", "room = CO.roomFor(it)"],
["' ' + (EC.UNIT[it] || 'وحدة')", "' ' + uOf(it)"],   // stock line
["const sup = CO.supplierOf(buySup), items = EC.PRODUCTS.concat(EC.MATERIALS), names = Object.assign({}, EC.LABEL, EC.MATERIAL_LABEL);",
 "const sup = CO.supplierOf(buySup), items = EC.PRODUCTS.concat(EC.MATERIALS), names = Object.assign({}, EC.LABEL, EC.MATERIAL_LABEL);\n    const uOf = it => EC.PRODUCTS.includes(it) ? (EC.UNIT[it] || 'برميل') : ({ kg: 'كجم', pcs: 'قطعة', unit: 'وحدة' })[EC.MATERIAL_UNIT[it]] || 'وحدة';"],
];
for (const [a, b] of R) { const n = s.split(a).length - 1; if (n < 1) { console.error('NO MATCH', a.slice(0, 80)); process.exit(1); } s = s.split(a).join(b); console.log(n, a.slice(0, 50)); }
fs.writeFileSync(F, s);
