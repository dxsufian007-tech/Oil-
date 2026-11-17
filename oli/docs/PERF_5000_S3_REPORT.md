# PERF 5000 - S3 report (items 3 and 4 + extra search), short
Branches (stacked, each commit independent and switchable): perf/s3-pcstore-freeze da6a83e -> perf/s3-rcv-skip 39f8d95 -> perf/s3-jointcap 54ff7c5 (tip), on top of perf/scale5000-s2b af59f7d.
No equation, limit, port, flow direction, save format or building changed. Not merged, no APK. Node/Chromium numbers are sandbox measurements; the x16 columns are CPU-throttle ESTIMATES. The phone was NOT measured.

## Implemented
1. S3-2 rcvSkip (the main one, `CentralNet.rcvSkip`, 0 = old code): in the central network every source probes every receiver station; in the test scenes 97-98% of probes returned 0 because the device behind the station is a producer (role out), not operational or takes another product - but a full route search + plan was still computed for each. `Sim.probeDead` repeats only the first (write-free) tests of offer()/accept() and skips the search when the answer is certain to be 0 with no side effect (anything unsure - level-out pipes, a rate above the pipe room which sets e.over - runs the full code). On the real save 69% of probes are zero (not all are dead by this rule), about 35% less hour time there.
2. S3-1 hopFreezeSkip: no per-hop freeze of stored paths when hops are shared (already frozen). ~3%, within noise.
3. S3-3: joint tier list kept per joint type (rebuilt if pipe capacities change). Effect below measurement noise on the test scenes (few junctions).
Tried and dropped (no measurable gain, not committed): tree build threshold (trAfter 2/4/6/16/64), no per-receiver record in the probe.
Finding: the plan memo cannot be improved: a repeat call with the same route, rate and pressure that missed the memo never happens (0 of ~23,000 calls).

## Equality / tests
- 40 perturbation runs (real save seeds 11-14 x capacity 1/0.02/0.005, scenes 1000/3000/4000/5000, with and without the tree, verify 4): 704 game hours, 0 different hours, 0 tree mismatches, 0 fallbacks.
- S3-1 and S3-3: last-hour hash identical to the previous commit on real save and scenes 1000/3000/4000/5000.
- Full suite (220 test files): 13 fail, the same 13 fail on base d678359 with the same PASS/FAIL lines (test-building-lab, economy-screens, fields, full-cycle, gap-sign, offshore-8, oil-trading-ui, sector-*, sectors-ui, tank-ports). No new failure.
- Not tested: C-4000 at capacity 0.02 (the original engine itself runs out of 5 GB), real phone, games longer than 24 h.

## Node, ms/hour (mean of 2) and heap MB: original | S2b (tree on) | S3 tree on | S3 tree off
| scene (buildings) | original | S2b | S3 on | S3 no tree | heap orig -> S3 |
|---|---|---|---|---|---|
| M-1000 | 10 | 10 | 10 | 10 | 14 -> 13 |
| M-3000 | 20 | 18 | 20 | 18 | 24 -> 22 |
| M-5000 | 92 | 58 | 36 | 28 | 53 -> 34 |
| C-1000 | 137 | 73 | 25 | 30 | 40 -> 17 |
| C-2000 | 1260 | 558 | 121 | 161 | 176 -> 32 |
| C-4000 | 295 | 131 | 41 | 43 | 91 -> 34 |
GC share stays 4-10% of the window in all variants. Run to run noise is about +-15% (first repetition is often slower).

## Chromium engine only, ms/hour (x1 = no throttle; x16 = estimate for a phone-like CPU)
| scene | x1 orig | x1 S3 on | x16 orig | x16 S2b | x16 S3 on | x16 S3 no tree |
|---|---|---|---|---|---|---|
| M-1000 | 8 | 8 | 54 | 65 | 25 | 83 |
| M-3000 | 23 | 19 | 226 | 153 | 145 | 194 |
| M-5000 | 71 | 23 | 1411 | 666 | 399 | 460 |
| C-1000 | 86 | 16 | 1845 | 893 | 269 | 331 |
| C-2000 | 782 | 84 | 17861 | 8856 | 2096 | 2261 |
| C-4000 | 252 | 30 | 5000 | 1811 | 684 | 780 |
(x16 values use 4 game hours only; small scenes are noisy.)

## Speed classes (X1 <780 ms, X2 <390, X5 <156 ms per hour at 0.78 share)
- Measured here (x1): every scene fits X1, X2 and X5, including C-2000 (it did not fit any before).
- Estimated for a phone (x16): M-5000 fits X1 (399 ms; it did not before: 1411), C-1000 fits X1 and X2, C-4000 fits X1 (684 ms), M-3000 fits X1 X2 X5, C-2000 still does not fit (2.1 s/hour). These are estimates, not phone measurements.

## Improvement per scene (Node, original -> S3 on)
M-5000 -61%, C-1000 -82%, C-2000 -90%, C-4000 -86%, M-1000/M-3000 unchanged. Memory: M-5000 -36%, C-1000 -58%, C-2000 -82%, C-4000 -63%. Buildings tested: 1000, 2000, 3000, 4000, 5000 (generated, really connected) plus the real save.

## Still open
- With rcvSkip the tree (S2b) adds little: C-2000 161 -> 121, others within noise, M-5000 slightly worse. Recommendation: activate rcvSkip (already default 1 on the branch) and keep the tree OFF.
- Remaining cost per hour is spread over per-building passes: economy _tickGen ~14%, industry stepGen ~9%, accept/offer ~13%, _planHops 4-10%; no single big item left that is bit-exact and low risk.
- Real saves may have fewer dead receivers than the generated scenes (69% zero probes vs 97%): the gain there is smaller (~35% measured on the real save).
## Next opportunities (need a plan first, higher risk)
- Skip receivers that are alive but full (needs exact handling of the s._off / e.over writes).
- Merge the per-building passes of economy/industry (order of float sums must stay identical).
