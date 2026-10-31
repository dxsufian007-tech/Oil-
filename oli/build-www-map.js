// Map preview APK: packages ONLY the world preview (worldmap.js + world-preview.*) as the app page. The game's own build-www.js is not touched.
const fs = require('fs'), path = require('path'), out = path.join(__dirname, 'www');
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(__dirname, 'world-preview.html'), path.join(out, 'index.html'));
for (const f of ['worldmap.js', 'world-preview.js']) fs.copyFileSync(path.join(__dirname, f), path.join(out, f));
console.log('www/ (map preview) ready:', fs.readdirSync(out).join(', '));
