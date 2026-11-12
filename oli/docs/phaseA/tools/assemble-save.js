/* Joins the pasted export parts back into the save and checks them.   node assemble-save.js out.json part1.txt part2.txt ...   (or one file with all the parts, in any order)
 * Each part starts with  OLISAVE1|<gzip|json>|<k>/<n>|<first 16 hex of the SHA-256 of the raw save>|<raw bytes>|  followed by base64. Fails loudly if a part is missing, repeated or foreign. */
const fs = require('fs'), zlib = require('zlib'), crypto = require('crypto'), [out, ...files] = process.argv.slice(2);
const txt = files.map(f => fs.readFileSync(f, 'utf8')).join('\n'), re = /OLISAVE1\|(gzip|json)\|(\d+)\/(\d+)\|([0-9a-f]{16})\|(\d+)\|([A-Za-z0-9+/=]*)/g, parts = new Map(); let m, kind, n, sha, raw;
while ((m = re.exec(txt))) { const [, k, i, nn, h, r, b] = m; if (kind && (k !== kind || +nn !== n || h !== sha || +r !== raw)) throw new Error('part from a different export'); kind = k; n = +nn; sha = h; raw = +r; if (parts.has(+i) && parts.get(+i) !== b) throw new Error('part ' + i + ' differs between copies'); parts.set(+i, b); }
if (!n) throw new Error('no parts found'); const missing = []; for (let i = 1; i <= n; i++) if (!parts.has(i)) missing.push(i); if (missing.length) throw new Error('missing parts: ' + missing.join(','));
let buf = Buffer.from([...Array(n).keys()].map(i => parts.get(i + 1)).join(''), 'base64'); if (kind === 'gzip') buf = zlib.gunzipSync(buf);
const h = crypto.createHash('sha256').update(buf).digest('hex'); if (!h.startsWith(sha) || buf.length !== raw) throw new Error('checksum mismatch: got ' + h.slice(0, 16) + ' len ' + buf.length + ', expected ' + sha + ' len ' + raw);
JSON.parse(buf.toString('utf8')); fs.writeFileSync(out, buf); console.log('OK', n, 'parts ->', out, buf.length, 'bytes, sha256', h);
