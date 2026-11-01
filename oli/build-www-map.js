// Map preview APK: packages ONLY the world preview (worldmap.js + world-preview.*) as the app page. The game's own build-www.js is not touched.
const fs = require('fs'), path = require('path'), out = path.join(__dirname, 'www');
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(__dirname, 'world-preview.html'), path.join(out, 'index.html'));
for (const f of ['worldmap.js', 'world-preview.js', 'world-worker.js', 'building-config.js', 'buildings.js', 'industry.js', 'economy-config.js', 'economy.js', 'economy-ui.js', 'ar-dict.js', 'ar.js', 'game-config.js', 'game-ui.js', 'building-art.js', 'building-lab.js']) fs.copyFileSync(path.join(__dirname, f), path.join(out, f));
if (process.env.OLI_DEMO) { const f = path.join(out, 'index.html'); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('<title>', '<script>window.OLI_DEMO=true</script><title>')); console.log('DEMO flag written'); }
console.log('www/ (map preview) ready:', fs.readdirSync(out).join(', '));
