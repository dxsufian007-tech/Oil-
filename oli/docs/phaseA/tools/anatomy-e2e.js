/* Phase A: the two diagnostic tests end to end (the same code the phone runs) on the central + real-field scene, driven like the live game (Company.run with a real-time budget).
 *   ROOT=<oli dir> T=t1|t2 SPEED=1 node anatomy-e2e.js */
const path = require('path'), ROOT = process.env.ROOT || path.join(__dirname, '../../..');
global.window = global; global.location = { protocol: 'node:', host: 'local' }; global.document = { addEventListener() { }, createElement() { return { style: {}, setAttribute() { }, appendChild() { }, querySelector() { return null; }, addEventListener() { } }; }, body: { appendChild() { } } };
const si = global.setInterval; global.setInterval = () => 0; require(path.join(ROOT, 'live-diag.js')); global.setInterval = si;
const { g, co, fieldWells } = require('./scene-central.js').build(); co.speed = +process.env.SPEED || 1; window.__lab = { company: co, store: g.store, sim: g.sim }; window.OLI_VERSION = 'node-e2e';
let last = performance.now(); setInterval(() => { const t = performance.now(), dt = (t - last) / 1000; last = t; co.run(dt * 2 * co.speed, 8, () => performance.now()); }, 62);
(async () => { console.log('fieldWells', fieldWells, 'buildings', g.store.items.size); const t0 = performance.now(); const r = await window.OliLiveDiag.p0[process.env.T || 't1'](); console.log(r); console.log('WALL', ((performance.now() - t0) / 1000).toFixed(1), 's'); process.exit(0); })();
