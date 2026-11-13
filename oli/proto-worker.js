/* Oli - proto-worker.js  (MEASUREMENT PROTOTYPE, not used by the game: the simulation in a worker thread, the screen fed by a per-hour snapshot)
 *   node proto-worker.js [N=3000] [seconds=20]
 * The worker owns the whole game (the same engine files, the same bench world as bench-full.js) and runs whole hours as fast as it can - exactly advanceHours(1).
 * After every hour it packs what the screen needs (per building: state, tank fill, running flag; per pipe: flow / over-pressure; the company's cash and hours) into
 * typed arrays and transfers them (zero copy) to the main thread, which unpacks them into its own read model - as the map and cards would read it.
 * Printed: hours per second reached, ms per hour in the worker (simulation / packing), ms on the main thread per snapshot (receive + unpack) and the snapshot size.
 * The main thread is otherwise idle here, so it also reports how much of the main thread the worker design leaves for drawing.
 * Compare with the same N on the main thread (bench-full.js / hour-anatomy.js) - same machine, same run - to see what moving the simulation off the main thread changes.
 */
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
if (!isMainThread) {
  const { build } = require('./bench-full.js'), g = build(workerData.N), co = g.co, B = require('./buildings.js'), DEFS = B.DEFS; co.advanceHours(6);
  const items = () => g.store.list(), lines = () => [...g.net.lines.values()], ns = () => process.hrtime.bigint(), ms = (a, b) => Number(b - a) / 1e6;
  let simMs = 0, packMs = 0, n = 0; const t0 = Date.now();
  while (Date.now() - t0 < workerData.secs * 1000) {
    const a = ns(); co.advanceHours(1); const b = ns();
    const it = items(), ls = lines(), bi = new Int32Array(it.length * 2), bf = new Float32Array(it.length), lf = new Float32Array(ls.length * 2);
    for (let i = 0; i < it.length; i++) { const x = it[i], d = DEFS[x.d], s = x.s; bi[2 * i] = x.id; bi[2 * i + 1] = (x.st === 'OPERATIONAL' ? 1 : 0) | (s && s._in > 0 ? 2 : 0); bf[i] = s && s.vol != null && d.capacity ? s.vol / d.capacity.value : 0; }
    for (let i = 0; i < ls.length; i++) { lf[2 * i] = ls[i].flow || 0; lf[2 * i + 1] = (ls[i].over || ls[i].hiP) ? 1 : 0; }
    const c = ns(); simMs += ms(a, b); packMs += ms(b, c); n++;
    parentPort.postMessage({ t: 'hour', hours: co.hours, cash: g.store.cash, bi, bf, lf, sent: Date.now() }, [bi.buffer, bf.buffer, lf.buffer]);
  }
  parentPort.postMessage({ t: 'done', n, simMs, packMs, secs: (Date.now() - t0) / 1000, buildings: g.store.items.size, lines: g.net.lines.size });
} else {
  const N = +(process.argv[2] || 3000), secs = +(process.argv[3] || 20), w = new Worker(__filename, { workerData: { N, secs } });
  const model = new Map(); let recvMs = 0, snaps = 0, bytes = 0, lat = 0;
  w.on('message', m => {
    if (m.t === 'hour') { const t = process.hrtime.bigint(); for (let i = 0; i < m.bf.length; i++) { const id = m.bi[2 * i]; let o = model.get(id); if (!o) model.set(id, o = { st: 0, fill: 0 }); o.st = m.bi[2 * i + 1]; o.fill = m.bf[i]; } let fl = 0; for (let i = 0; i < m.lf.length; i += 2) fl += m.lf[i];
      recvMs += Number(process.hrtime.bigint() - t) / 1e6; snaps++; bytes = m.bi.byteLength + m.bf.byteLength + m.lf.byteLength; lat += Date.now() - m.sent; return; }
    const r = { N, buildings: m.buildings, lines: m.lines, seconds: +m.secs.toFixed(1), hoursPerSecond: +(m.n / m.secs).toFixed(2), workerSimMsPerHour: +(m.simMs / m.n).toFixed(2), workerPackMsPerHour: +(m.packMs / m.n).toFixed(3),
      mainMsPerSnapshot: +(recvMs / snaps).toFixed(3), mainThreadShareUsed: +((recvMs / 1000) / m.secs * 100).toFixed(2) + '%', snapshotKB: +(bytes / 1024).toFixed(1), avgLatencyMs: +(lat / snaps).toFixed(1) };
    console.log(JSON.stringify(r)); w.terminate();
  });
}
