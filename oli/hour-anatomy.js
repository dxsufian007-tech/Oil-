/* Oli - hour-anatomy.js  (what one game hour costs, piece by piece: the hour is run through _tickGen and every chunk between two pauses is timed)
 *   node hour-anatomy.js [N=10000] [hours=24]
 * Prints per hour: total ms, number of chunks, the first chunk (the start of the hour: construction, efficiency, automatic purchasing, material gate, up to the first pause
 * of the simulator), the largest middle chunk, and the last chunk (the end of the hour: costs, staff, market, finance, events), averaged over the hours, plus the worst hour.
 * These are the pieces the live game can spread over frames: only the first and last chunk cannot be split today.
 */
const { build } = require('./bench-full.js'); const N = +(process.argv[2] || 10000), H = +(process.argv[3] || 24);
const g = build(N), co = g.co; co.advanceHours(6);
const ns = () => process.hrtime.bigint(), ms = (a, b) => Number(b - a) / 1e6, rows = [];
for (let h = 0; h < H; h++) { const gen = co._tickGen(1, true), ch = []; let t = ns(); for (;;) { const r = gen.next(), t2 = ns(); ch.push(ms(t, t2)); t = t2; if (r.done) break; } co.hours; rows.push(ch); }
const avg = f => rows.reduce((a, c) => a + f(c), 0) / rows.length, r2 = x => +x.toFixed(2);
const out = { N, buildings: g.store.items.size, hours: H, totalMsPerHour: r2(avg(c => c.reduce((a, v) => a + v, 0))), chunksPerHour: r2(avg(c => c.length)), firstChunkMs: r2(avg(c => c[0])),
  largestMiddleChunkMs: r2(avg(c => Math.max(0, ...c.slice(1, -1)))), lastChunkMs: r2(avg(c => c[c.length - 1])), worstHourMs: r2(Math.max(...rows.map(c => c.reduce((a, v) => a + v, 0)))),
  worstSingleChunkMs: r2(Math.max(...rows.map(c => Math.max(...c)))) };
console.log(JSON.stringify(out));
