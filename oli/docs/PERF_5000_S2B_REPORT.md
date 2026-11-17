# PERF 5000 — S2 item 2: reuse of the search tree (branch perf/scale5000-s2b)

Status: implemented, OFF by default (`CentralNet.trDefault = 0`). Not merged, no APK.
All numbers are from the sandbox (Node 22, Chromium, 2 cores). None come from a phone.

## What changed
- One Dijkstra tree per (source, channel) is built on the second miss of that source and reused for all its receivers.
- Used only when the answer is provably identical: no ban / bias / over, same rev and saturation state (the cache is cleared on those events as before).
- `trMode`: 0 off, 1 shadow (every answer compared with the original; the original answer is used), 2 on (every `trVerify`-th answer verified, default 16).
- Any mismatch or exception -> `_treeOff` : tree disabled permanently for that net, original answer used.
- Instant disable: `CentralNet.trDefault = 0` or `net.setTreeMode(0)`.
- Not touched: equations, station/port/capacity limits, save system, items 3 and 4.

## Equality (hour by hour, sha1 of store+net+eco)
22 runs: real save (seeds 1-5, capacity scale 1 / 0.02 / 0.005 to force saturation), scenes M-1000/3000/5000, C-1000/2000/4000, shadow runs, perturbations (pump fault/direction, channel open/close, segment fault, tank full/empty, refinery limit, building removal, tap+tank addition).
Result: 0 differing hours, 0 mismatches, 0 errors, 0 fallbacks.
Test suite with tree forced on and verification of every answer: 44/48 pass. The 4 failures:
- test-offshore-8, test-economy-screens, test-oil-trading-ui: fail also without the tree and on base d678359 (pre-existing).
- test-tank-group-big: 5 ms timing limit, flaky under parallel load, passes alone.
- Fallbacks during the suite: 0 (test-offshore-8: 19140 tree answers, 0 fallbacks).

## Hour time, Node (ms/h, mean): original -> S2a -> S2b
| scene | original | S2a | S2b |
|---|---|---|---|
| C-1000 | 163 | 129 | 78 |
| C-2000 | 1377 | 948 | 615 |
| C-4000 | 346 | 293 | 148 |
| M-5000 | 98 | 76 | 66 |
| M-1000 / M-3000 | unchanged | | |

## Chromium, engine only (ms/h, mean)
| scene | x1 off | x1 S2a | x1 S2b | x16 off | x16 S2a | x16 S2b |
|---|---|---|---|---|---|---|
| C-1000 | 101 | 90 | 48 | 2095 | 1674 | 1299 |
| C-2000 | 1157 | 760 | 470 | 20252 | 17616 | 11506 |
| C-4000 | 275 | 207 | 109 | 7880 | 5549 | 2806 |
| M-5000 | 86 | 60 | 39 | 1939 | 1621 | 900 |

## Speed classes (limits at 0.78 share: X1 <780, X2 <390, X5 <156 ms)
- x1 (no throttle): C-2000 now fits X1 (from S2a); C-4000 fits X5 with S2b; all others fit.
- x16 (phone-like factor, estimate): no scene newly meets X1 except those already under 780 ms; M-5000 is 900 ms, close but above.
- The heavy central scene C-2000 is still far from phone-fast (11.5 s/h at 16x).

## Memory / GC
Heap after load / after run is unchanged within noise (C-2000 ~39 MB); trees are dropped with the path cache at each hour begin. No extra GC pauses observed in the --trace-gc windows (see /tmp/res/s2b).

## Limits / caveats
- Gain depends on how many receivers share one source; scenes with no repeated sources get no gain (some runs had zero tree calls).
- Phone numbers are extrapolations by CPU throttle, not measurements.

## Decision needed
Approve (a) activating `trDefault=2`, or (b) keeping it off, or (c) moving to the next item. Nothing is activated or merged.
