# PERF 5000 — S2b gradual-activation test (branch perf/scale5000-s2b)
Default stays OFF (`trDefault=0`). No merge, no APK, items 3/4 not started, no equation or limit changed.
Node and Chromium numbers are sandbox measurements (2 cores). The x16 columns are CPU-throttle ESTIMATES of a phone, not phone measurements. No phone data exists.

## 1. Gradual activation (hour-by-hour sha1 of everything the save holds)
| stage | runs | game hours | different hours | tree answers verified | mismatch / error / self-disable |
|---|---|---|---|---|---|
| A shadow (every answer compared) - real save + C/M scenes 1000..5000 | 7 | 72 | 0 | 161,078 | 0 / 0 / 0 |
| B limited ON (mode 2, verify every 16th) - same set | 7 | 72 | 0 | 10,069 (161,078 served) | 0 / 0 / 0 |
| A+ shadow with perturbations (pump fault/direction, channel open/close, segment fault, tank full/empty, refinery limit, building removal, tap+tank addition; real save seeds 11-13 x capacity 1/0.02/0.005, scenes 1000/3000, C-4000 at 0.3 and 0.1) | 15 | ~270 | 0 | ~80,000+ | 0 / 0 / 0 |
| B+ ON with the same perturbations | 15 | 264 | 0 | 12,128 (193,958 served) | 0 / 0 / 0 |
Saturation really toggled (504 free<->saturated events per real-save run, 110-124 in C-1000), identically in both engines.
Limit of the test: C-4000 with capacity scaled to 0.02 exhausts 5 GB in the ORIGINAL engine too (off vs off crashes the same way), so that one combination is untested; 0.3 and 0.1 pass.

## 2. Automatic fallback (inject-fallback.js)
Faults injected after the 3rd/20th tree use: tree answer loses a hop; _treeBuild throws; tree with damaged predecessors. Modes shadow, ON verify 1/4/16. Real save and C-1000: 18 cases.
Result: in all 18 the feature switched itself off (`trMode=0`, disabled=1) and every hour stayed identical to the plain engine.
Honest limit: in mode 2 only every 16th answer is verified, so a real bug could in principle serve up to 15 unverified answers before the first check. In these injections no hour differed, but that is not a proof. Verify 4 costs about 0-25% of the gain (below).

## 3. Node, ms per game hour (mean of 2 runs) / heap MB after
| scene | off | S2a | shadow | ON v16 | ON v4 |
|---|---|---|---|---|---|
| M-1000 | 10 | 10 | 11 | 10 | 11 |
| M-3000 | 20 | 20 | 19 | 21 | 19 |
| M-5000 | 92 | 75 | 80 | 56 | 55 |
| C-1000 | 114 | 113 | 113 | 70 | 82 |
| C-2000 | 1167 | 846 | 905 | 573 | 648 |
| C-4000 | 290 | 243 | 262 | 155 | 170 |
Heap after: C-2000 172 -> 75 MB, C-4000 91 -> 58, M-5000 53 -> 41, C-1000 40 -> 27 (S2a already gives most of this). RSS C-2000 840 -> 425 MB.
GC share of the window: 6-12% in every variant, no systematic rise with the tree (C-1000 7.5% -> 16%, C-2000 10% -> 8-12%, C-4000 8% -> 10%); mostly short scavenges. Shadow is slower than off+S2a by design (it computes both).

## 4. Chromium engine only (ms/h mean; 8 hours at x1, only 3 at x16, so x16 is noisy)
| scene | x1 off | x1 S2a | x1 shadow | x1 ON | x16 off | x16 S2a | x16 shadow | x16 ON |
|---|---|---|---|---|---|---|---|---|
| M-1000 | 7 | 5 | 8 | 6 | 51 | 31 | 113 | 62 |
| M-3000 | 26 | 16 | 18 | 17 | 226 | 186 | 241 | 240 |
| M-5000 | 72 | 59 | 70 | 43 | 1306 | 978 | 1286 | 787 |
| C-1000 | 93 | 76 | 81 | 39 | 1706 | 1524 | 1685 | 881 |
| C-2000 | 828 | 677 | 720 | 378 | 17670 | 14093 | 16240 | 9016 |
| C-4000 | 231 | 184 | 218 | 110 | 4996 | 4433 | 4558 | 2461 |
M-1000/M-3000 at x16 differ by noise (3 hours); the tree does nothing there (few shared sources).

## 5. X1 / X2 / X5 (budget 780 / 390 / 156 ms per hour at 0.78 frame share)
| scene | x1 off | x1 ON | x16 off (estimate) | x16 ON (estimate) |
|---|---|---|---|---|
| M-1000, M-3000 | X1 X2 X5 | X1 X2 X5 | X1 X2 X5 (M-3000: X1 X2) | same |
| M-5000 | X1 X2 X5 | X1 X2 X5 | none (1306) | none (787, 7 ms above X1) |
| C-1000 | X1 X2 X5 | X1 X2 X5 | none | none (881) |
| C-2000 | none (828) | X1 X2 (378) | none | none (9 s/h) |
| C-4000 | X1 X2 | X1 X2 X5 | none | none (2.5 s/h) |
Measured on the dev machine (Node/Chromium x1): ON makes C-2000 fit X1 and X2 and C-4000 fit X5. Estimated for a phone (x16): the central-heavy scenes still do not fit any speed; M-5000 is right at the X1 edge.

## 6. Real improvement (ON v16 vs off, same machine)
Central-heavy scenes 38-52% less hour time (C-1000 -39%, C-2000 -51%, C-4000 -47%), M-5000 -39%, M-1000/3000 none. About half of C-2000's gain comes from S2a, the rest from the tree. Memory 20-55% lower, almost all from S2a.

## 7. Risks of activation
- A tree bug would be caught only on verified answers (every 16th in ON); fallback is automatic but not instantaneous. Option: verify 4 (cost measured above) for the first release.
- Gain depends on shared sources; no gain, no loss otherwise.
- Not tested: real phone, C-4000 at 0.02 capacity, networks beyond 5000 buildings, long sessions (>24 h games).
- Pre-existing failures unrelated to this work: test-offshore-8, test-economy-screens, test-oil-trading-ui (fail on base d678359 too); test-tank-group-big timing flake.

## 8. Recommendation
Activate ON with trVerify=4 on this branch only, collect real-save runs on the phone with the debug stats (`trStats`) before any merge; keep `trDefault=0` as the release default until phone data shows zero fallbacks. Do not start items 3/4 before that.
