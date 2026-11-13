// Map preview APK: packages ONLY the world preview (worldmap.js + world-preview.*) as the app page. The game's own build-www.js is not touched.
const fs = require('fs'), path = require('path'), out = path.join(__dirname, 'www');
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(__dirname, 'world-preview.html'), path.join(out, 'index.html'));
for (const f of ['worldmap.js', 'world-preview.js', 'world-worker.js', 'building-config.js', 'central-ui.js', 'help.js', 'central.js', 'central-plan.js', 'buildings.js', 'industry.js', 'economy-config.js', 'ledger.js', 'game-calendar.js', 'baserate.js', 'loans-engine.js', 'credit.js', 'bonds.js', 'bank.js', 'news-data.js', 'oil-engine.js', 'market-ui.js', 'finance-ui.js', 'banking-ui.js', 'economy.js', 'economy-ui.js', 'ar-dict.js', 'ar.js', 'game-config.js', 'game-ui.js', 'building-art.js', 'building-lab.js', 'live-diag.js', 'map-layers.js', 'map-layers-ui.js', 'network-diag.js', 'diag-ui.js', 'hud-skin.js', 'map-skin.js']) fs.copyFileSync(path.join(__dirname, f), path.join(out, f));
fs.cpSync(path.join(__dirname, 'map-assets'), path.join(out, 'map-assets'), { recursive: true, filter: s => !/README/.test(s) });
if (process.env.OLI_DEMO) { const f = path.join(out, 'index.html'); const ver = require('./package.json').version + (process.env.OLI_BUILD ? ' · ' + process.env.OLI_BUILD : '');
  const menu = !process.env.OLI_PERF;                                                              // the main menu belongs to the app build only (not to the measurement build)
  if (menu) { fs.copyFileSync(path.join(__dirname, 'home.js'), path.join(out, 'home.js')); fs.cpSync(path.join(__dirname, 'home-assets'), path.join(out, 'home-assets'), { recursive: true, filter: s => !/play-icon/.test(s) }); }
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('<title>', '<script>window.OLI_DEMO=true;' + (menu ? 'window.OLI_HOME=true;window.OLI_VERSION=' + JSON.stringify(ver) + ';' : '') + '</script><title>').replace('<body>', menu ? '<body><script src="home.js"></script>' : '<body>')); console.log('DEMO flag' + (menu ? ' + main menu' : '') + ' written'); }
if (process.env.OLI_PERF) {                                                   // performance-test build ONLY: the measurement panel is added to this build and to no other
  fs.copyFileSync(path.join(__dirname, 'perf-panel.js'), path.join(out, 'perf-panel.js')); const f = path.join(out, 'index.html'), id = process.env.OLI_PERF_BUILD || 'perf';
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('<title>', '<script>window.OLI_PERF=true;window.OLI_PERF_BUILD=' + JSON.stringify(id) + '</script><title>').replace('</body>', '<script src="perf-panel.js"></script></body>')); console.log('PERF panel added');
}
console.log('www/ (map preview) ready:', fs.readdirSync(out).join(', '));
