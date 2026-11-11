/* Oli - proto-sliced.js  (MEASUREMENT: the sliced-hour pacing of the live game, on the main thread of node, with the game's own numbers - no drawing)
 *   node proto-sliced.js [N=3000] [seconds=20] [speed=10]
 * The same loop as the lab's simPump: every 62 ms the company gets real time x speed; it runs (COMPANY.run with the still-map budget, 30 ms, and the frame clock)
 * only when its share allows (65 %: after a slice that took X ms the next one waits X x (1/0.65 - 1) ms - that time is the map's in the game).
 * Printed: whole game hours per second reached (and wanted), the longest single run() call (= the longest the main thread is blocked by the simulation),
 * and the share of the main thread the simulation used. Run it next to proto-worker.js with the same N on the same machine.
 */
const EC = require('./economy-config.js'), { build } = require('./bench-full.js'); const N = +(process.argv[2] || 3000), secs = +(process.argv[3] || 20), speed = +(process.argv[4] || 10);
const g = build(N), co = g.co; co.advanceHours(6); co.speed = speed; const now = () => performance.now(), BUD = EC.TIME.liveBudgetStillMs || 30, SH = EC.TIME.liveShareStill || 0.65;
let last = now(), next = 0, busy = 0, maxRun = 0, n0 = co.hours; const t0 = now();
const iv = setInterval(() => { const t = now(), dt = Math.min(2, (t - last) / 1000); last = t; const hrs = dt * (24 / EC.TIME.dayRealSeconds) * speed;
  if (t < next) { co.addTime(hrs); } else { const a = now(); co.run(hrs, BUD, now); const took = now() - a; busy += took; if (took > maxRun) maxRun = took; next = a + took / SH; }
  if (t - t0 >= secs * 1000) { clearInterval(iv); co.settle(); const el = (now() - t0) / 1000;
    console.log(JSON.stringify({ N, buildings: g.store.items.size, speed, seconds: +el.toFixed(1), wholeHoursPerSecond: +((co.hours - n0) / el).toFixed(2), wantedHoursPerSecond: 24 / EC.TIME.dayRealSeconds * speed, longestRunMs: +maxRun.toFixed(1), mainThreadShareUsed: +(busy / 1000 / el * 100).toFixed(1) + '%' })); } }, 62);
