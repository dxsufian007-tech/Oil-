/* per-hour state hashes of ONE code tree: node hours-dump.js <real|scene.json> <hours> '<overrides JSON>' <out.txt>   (NORM_OFF=1 drops only the saved _off of tanks / gas stores) */
const path = require('path'), fs = require('fs'), S = require('./gen-scene.js'), I = require(path.resolve(__dirname, '..') + '/industry.js'), C = require(path.resolve(__dirname, '..') + '/central.js');
const [what, H, ov, out] = [process.argv[2], +process.argv[3] || 24, JSON.parse(process.argv[4] || '{}'), process.argv[5]];
for (const k in ov) { if (k.startsWith('Sim.')) I.Sim[k.slice(4)] = ov[k]; else C.CentralNet[k] = ov[k]; }
const g = what === 'real' ? S.boot() : S.load(what), sinks = (g.sinks || []).map(id => g.store.get(id)).filter(Boolean), hn = require('./hashnorm.js'), hs = [], t0 = Date.now();
for (let h = 0; h < H; h++) { for (const b of sinks) g.sim.ensure(b).vol = 0; g.co.advanceHours(1); hs.push(hn(g)); }
fs.writeFileSync(out, hs.join('\n') + '\n'); console.log('hours', H, 'sec', ((Date.now() - t0) / 1000).toFixed(1), 'last', hs[hs.length - 1].slice(0, 12), 'switches now', JSON.stringify({ hopShare: C.CentralNet.hopShare, pcSparse: C.CentralNet.pcSparse, rcvSkip: C.CentralNet.rcvSkip, hopFreezeSkip: C.CentralNet.hopFreezeSkip, trDefault: C.CentralNet.trDefault, fullTankSkip: I.Sim.fullTankSkip }));
