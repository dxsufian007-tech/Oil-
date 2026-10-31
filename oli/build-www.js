// Copies the game's web files into www/, which Capacitor packages into the Android app.
// v2: the Phaser front-end (v2.html / v2.js / v2.css) is the app; core.js stays the simulation and the source of truth.
const fs = require('fs'), path = require('path');
const out = path.join(__dirname, 'www');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const phaser = fs.existsSync(path.join(__dirname, 'node_modules/phaser/dist/phaser.min.js')) ? path.join(__dirname, 'node_modules/phaser/dist/phaser.min.js') : path.join(__dirname, 'phaser.min.js');
fs.copyFileSync(path.join(__dirname, 'v2.html'), path.join(out, 'index.html'));
fs.copyFileSync(phaser, path.join(out, 'phaser.min.js'));
for (const f of ['v2.js', 'v2-lang.js', 'v2.css', 'fonts.css', 'core.js', 'offline.js', 'art.js']) fs.copyFileSync(path.join(__dirname, f), path.join(out, f));
fs.cpSync(path.join(__dirname, 'fonts'), path.join(out, 'fonts'), { recursive: true });
console.log('www/ ready:', fs.readdirSync(out).join(', '));
