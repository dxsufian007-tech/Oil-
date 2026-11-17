/* preload for the existing test suite:  NODE_OPTIONS="-r /path/tree-on.js" node tools/run-tests.js ...
   Forces the S2b tree mode on (TREE_MODE, default 2) and verifies EVERY tree answer against the original search (trVerify = 1) in every network the tests create.
   If the feature ever switches itself off (mismatch / error) the process exits with code 3, so a silent fallback cannot hide a difference. */
const C = require('../central.js'); C.CentralNet.trDefault = +process.env.TREE_MODE || 2; C.CentralNet.trVerify = 1; let bad = 0, total = 0;
const off = C.CentralNet.prototype._treeOff; C.CentralNet.prototype._treeOff = function (why) { bad++; console.error('TREE-FALLBACK', why); return off.call(this, why); };
const ans = C.CentralNet.prototype._treeAnswer; C.CentralNet.prototype._treeAnswer = function (...a) { total++; return ans.apply(this, a); };
process.on('exit', () => { if (process.env.TREE_REPORT) console.error('TREE answers', total, 'fallbacks', bad); if (bad) process.exitCode = 3; });
