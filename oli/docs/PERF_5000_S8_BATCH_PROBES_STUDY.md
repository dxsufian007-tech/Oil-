# S8 — study: batching the probes of one receiver port (NO game code changed; branch perf/s8-batch-probes-study from S6 f977a52)
Measurement tools (outside the game, monkey-patch counters only): perf-scale5000/batchstat.js, chainstat.js. Node, sandbox; candidate set + S6 on; 12 game hours after 6 warm-up; the instrumented hour is slower (34 ms/h on the real save vs ~18 un-instrumented), so shares are of the instrumented hour. The phone was not involved.

## 1. How a receiver probe works today
`Sim.split/accept(central)` -> `CentralNet.deliver(src, ch, f)`: (a) `receivers()` lists the stations with an edge on the channel; (b) PROBE: for each receiver `toStation(commit=false, want=f.r)` = `probeDead` (S3/S6 skip) -> `plan` (route + pressure) -> `sim.offer(db, dp, f')` -> pipe loss -> `accept(far device)` (tank: room; pump/junction/valve: nested `offer`; separator/refinery: `separate/refine`); (c) sort by what each can take; (d) COMMIT: `toStation(commit=true, take)` for each, same chain with writes (`e.flow`, `_pend`, `_in`, `_cv++`) and `_apply` on the network.
"Batching one receiver port" would mean: answer several probes of the same (far building, port) with one evaluation.

## 2. Measured counts per game hour
| | real save (244) | scene 1000 | scene 5000 |
|---|---|---|---|
| toStation probes | 9,976 | 5,236 | 4,599 |
| ...skipped dead (probeDead) | 6,859 (69%) | – | – |
| plan calls (probe + commit) | 4,290 | 845 | 693 |
| probe offers (direct, reach the pipe) | 3,117 (all positive) | 680 (165 positive) | 693 (0 positive) |
| commit offers | 1,173 | 165 | 0 |
| time in probe offers / commit offers (instrumented) | 11.9 ms (35%) / 12.2 ms (36%) | 1.4 (5.3%) / 1.4 (5.6%) | 0.8 (2.3%) / 0 |
| nested offers per direct offer (chain length - 1) | 0.75 | 1.94 | 0 |
Receivers per deliver ~3.4 and all DIFFERENT (each is its own station port), so inside one deliver every receiver group has size 1: there is nothing to batch by construction.

## 3. Reuse potential (upper bounds: identical call = same receiver port, same rate, pressure, product, gas/water/bought share, source volume, visited set; counted with the real result)
| | real save | scene 1000 | scene 5000 |
|---|---|---|---|
| identical probe repeated in the SAME simulation state (same `_cv`), exact | 0 / h | 0 | 0 |
| same, ignoring the visited set | 0 / h | 0 | 0 |
| identical probe repeated later in the hour in ANY state (would need a dependency proof), same result | 415 / h (13% of probes), 0.4 ms = 0.96% of the hour | 0 | 0 |
| commit identical to the probe of the same call in the same state (probe-result reuse; writes still needed) | 585 / h (50% of commits), 0.8 ms = 1.9% | 0 | 0 |
So even a perfect, proof-backed batching/memo is capped at ~1% (any-state repeats) and ~1.9% (probe -> commit fusion, which would also need an effect journal to replay the writes) of the hour on the real save, and 0% on the synthetic scenes (their cost is elsewhere: refinery receivers, plan search, already optimised in S3).

## 4. Why nothing is left to batch
Every probe differs in its rate or pressure (S4: every probe is a plan miss), chains are short (0.75 nested offers per probe on the real save), receivers of one deliver are distinct ports, and the 69% that could not produce flow were already removed (rcvSkip, S6). What remains is genuinely new arithmetic per call (offer 13.8% / accept 13.4% self time in the S4 profile, no line above 6.5%).

## 5. Risks if it were built anyway
Probe side effects that are not idempotent (last writer wins: `pIn` of pumps / separators / refineries, `_blk/_blkPort`, `_off`, `_sat`, `e.over`) must be journaled and replayed in the same order (S5 did this for the deliver memo and measured +18.6% shadow overhead); stale answers when ANY pipe, tank, pump, channel fault, direction, boost or visited-set member changes between the two calls (the cv/dv/plE/eb invalidation set would have to be rebuilt per receiver); float order of the water-fill in `split` and of `_apply` sums must not move; ordering of oil reception (the commit order is the sorted order of the probe) must be identical.

## 6. How order and results would be preserved (design, not built)
Key = (receiver port, f.r, f.p, f.prod, f.gas, f.wat, f.bf, f.sv, f.sc, vis set, sim._cv, central _dv/_plE/rev, pump snapshot); hit replays the recorded effect list exactly as `_probeMemo` does; mode flag with a shadow mode (compute both, compare, auto-disable on any difference) as in S5; switch default 0.

## 7. Equality test plan (if ever approved)
Per-hour sha1 of store + net + economy on the real save (240 h) with the flag on / off; the 38-run perturbation battery (pump faults/directions, channels, segment faults, tank full/empty, refinery limits, removals, taps) with forced saturation; unit tests for each invalidation input; test-sliced-hour; the full suite vs the 13 known base failures; A/B timing interleaved (7 x 60 h) with memory and GC; any difference -> stop.

## 8. Gain versus risk
Expected gain: real save <= ~1% (any-state repeats, needs a dependency proof) or <= ~1.9% (probe->commit fusion, needs a replay journal); scenes 1000 / 5000: 0%. Inside the 3-5% noise of the measurements, so it could not even be demonstrated. Risk: medium-high (replayed side effects, invalidation proof). Complexity: high (S5 showed the shadow bookkeeping alone costs more than it saves).

## 9. Recommendation: do NOT implement batching of receiver probes.
Close this line. Remaining options with real value: (1) steady-state hour replay when no network input changed (large gain only on quiet networks; high risk; study needed); (2) phone memory/GC through chrome://inspect (no speed gain, fills the missing numbers); (3) stop: the real save already has 25x / 12x / 5x headroom at X1 / X2 / X5 on the phone.
