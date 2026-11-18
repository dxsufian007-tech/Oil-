// Bench app web dir: ONLY the engine files + bench-app/. The game's own build scripts are not touched.
const fs = require('fs'), path = require('path'), out = path.join(__dirname, 'www');
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
for (const f of ['ar-dict.js','ar.js','worldmap.js','building-config.js','central.js','central-plan.js','buildings.js','industry.js','economy-config.js','ledger.js','game-calendar.js','baserate.js','loans-engine.js','credit.js','bonds.js','bank.js','news-data.js','oil-engine.js','order-book.js','economy.js']) fs.copyFileSync(path.join(__dirname, f), path.join(out, f));
for (const f of ['index.html', 'bench.js']) fs.copyFileSync(path.join(__dirname, 'bench-app', f), path.join(out, f));
console.log('www/ (bench) ready:', fs.readdirSync(out).length, 'files');
