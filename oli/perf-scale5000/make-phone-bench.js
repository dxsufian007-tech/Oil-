/* Builds ONE self-contained HTML that measures the S6 engine on a phone browser with a save passed in (nothing written back).
   node make-phone-bench.js <save.json> <out.html>   — the save is embedded in the output only; never commit the output. */
const fs = require('fs'), path = require('path'), root = path.resolve(__dirname, '..');
const libs = ['ar-dict.js','ar.js','worldmap.js','building-config.js','central.js','central-plan.js','buildings.js','industry.js','economy-config.js','ledger.js','game-calendar.js','baserate.js','loans-engine.js','credit.js','bonds.js','bank.js','news-data.js','oil-engine.js','order-book.js','economy.js'];
const esc = s => s.replace(/<\/script/gi, '<\\/script');
const save = fs.readFileSync(process.argv[2], 'utf8');
const ui = fs.readFileSync(path.join(__dirname, 'phone-bench-ui.js'), 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OLI S6 phone bench</title><style>body{font:15px sans-serif;margin:12px;background:#111;color:#eee}button{font-size:17px;padding:10px 14px;margin:4px 4px 4px 0}pre{white-space:pre-wrap;background:#000;padding:8px;border-radius:6px;font-size:12.5px}</style></head><body><h3>OLI EMPIRE — S6 phone bench</h3><div id="ctl"></div><pre id="out">loading…</pre>\n'
  + libs.map(f => '<script>' + esc(fs.readFileSync(path.join(root, f), 'utf8')) + '</script>').join('\n')
  + '\n<script id="save" type="application/json">' + esc(save) + '</script>\n<script>' + ui + '</script></body></html>';
fs.writeFileSync(process.argv[3], html); console.log('wrote', process.argv[3], (html.length / 1048576).toFixed(2), 'MB');
