/* hash of everything the save holds (store, net, economy).  With NORM_OFF=1 the `_off` field of tank / gas-store buildings is left out (S6 knowingly stops writing it for full tanks); every other field, of every other building, is hashed. */
const crypto = require('crypto'), B = require('../buildings.js');
module.exports = g => {
  const o = { s: g.store.toJSON(), n: g.net.toJSON(), e: g.co.toJSON() };
  if (process.env.NORM_OFF === '1') { const j = JSON.parse(JSON.stringify(o)); for (const b of j.s.b) { const d = B.DEFS[b[1]]; if (d && (d.type === 'tank' || d.type === 'gas') && b[10] && typeof b[10] === 'object') delete b[10]._off; } return crypto.createHash('sha1').update(JSON.stringify(j)).digest('hex').slice(0, 12); }
  return crypto.createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 12);
};
