# PERF 5000 - S4: the positive-probe chain (plan / offer / accept) on the REAL save
Branch perf/s4-positive-probes (from integration/perf-s3). Baseline = the approved candidate: S2a + rcvSkip + hopFreezeSkip, tree OFF. No engine code changed in this step (all experiments were negative or below noise and were not kept). No save field, equation, limit changed. `_off` untouched, full tanks not skipped. Node numbers are sandbox measurements; the phone was not measured.

## 1. Where the hour goes on the real save (about 240 buildings, 18.4 ms/hour in Node)
CPU profile with line ticks, 240 game hours, map generation excluded. Inclusive share of advanceHours (calls nest, so shares overlap):
deliver 81% | toStation 73% | _probeMemo 61% | plan 19% (of which _planCore 14%, _planHops 10%) | receivers 6% | path 3% | probeDead 2.7% | jointCap 2.1%.
Self time: offer 13.8%, accept 13.4%, _planHops 9.9%, toStation 7.9%, receivers 5.9%, _probeMemo 4.8%, plan 3.8%, _probeRaw 3.1%, split 2.1%, jointTiersCached 1.8%. No line above 6.5% (offer's accept call 6.4%, Math.pow in _planHops 4.4%, deliver-probe map 3.5%, memo validation 3.4%).
Nothing is a single hot spot: the code was already tuned in earlier phases (B3a, B7e, B3b ...).

## 2. Counts per 12 game hours on the real save
- deliver calls 35,520; deliver memo hit 7,771 (22%); misses 27,749.
- probes 119,737: dead 68,681 (skipped by rcvSkip), positive 37,419, zero on a full tank 13,637.
- plan calls 65,096: memo hit 14,312 (22%), planCore 50,784, always the first (shortest) route: the alternative-route branch ran 0 times; path cache hit 99% (50,400 / 50,784); average 8.9 hops per plan; 18 pumps.
- Every probe is a plan miss (rate and pressure differ each call); the hits are the commit pass repeating a probe with the same rate.
- Deliver memo misses: 21,386 are a key never seen before (the flow rate / pressure value is new), 6,354 repeat an earlier key with an identical result, 9 differ. So at most 18% of deliveries (6,354 / 35,520) can be saved by finer invalidation; the rest are genuinely new calculations.

## 3. Experiments (each against the baseline, real save, interleaved runs, median ms/hour)
| idea | how tested | result | verdict |
|---|---|---|---|
| remove the per-call station-identity loop in receivers() | upper bound: loop deleted, 5 runs x 60 h | 19.0 -> 19.1 (noise) | dead, <=2% |
| remove the pump-snapshot compare in the plan memo | upper bound: compare deleted | 19.0 -> 19.6 (noise) | dead, <=3% |
| both removed | upper bound | 19.0 -> 18.6 | dead, <=3% |
| micro bundle: one pump list per plan call, pipe-class lookup once in offer, tank-group lookup only if groups exist | implemented, last-hour hashes identical (real + 1000/3000/4000/5000), 9 runs x 60 h | 18.60 -> 18.40 (-1.1%), heap 15 -> 15, GC 33 -> 31 ms | below noise (+-5%), NOT kept |
| prefix sharing of _planHops between receivers of one deliver | counted: about 1.4 plan calls per deliver (1 positive + full tanks) | nothing to share | dead |
| per-route reuse of a plan with the same route and usage | counted earlier (S3): a repeat with the same rate and pressure that missed the memo never happens | 0 of ~23,000 | dead |
Machine noise is +-5-10% per run, so single ideas under about 3% cannot be proven here.

## 4. Opportunities, ranked
| # | opportunity | expected gain on the REAL save | risk | effect on the save | rollback |
|---|---|---|---|---|---|
| 1 | skip the probe of a full tank (needs your decision on tank `_off`) | 5-8% (27% of plan misses are full tanks) | low-medium | tank `_off` differs in the saved file (not read for tanks); everything else provable identical | switch, instant |
| 2 | finer invalidation of the deliver memo (re-use a probe when only unrelated state changed) | up to ~10% (18% of deliveries recomputed with identical inputs and result) | high: needs a dependency proof; shadow mode (dmMode 1) can verify every answer | none | switch, instant |
| 3 | merge the economy / industry per-building passes | 2-3% | low-medium (float-sum order must stay identical) | none | switch |
| 4 | micro bundle of section 3 | ~1% (noise) | very low | none | trivial |
| 5 | drop the receivers identity check / pump compare | <=2-3% (upper bounds) | medium (loses safety nets) | none | switch |
| 6 | measure on a real phone | 0, but it replaces every estimate | none | none | - |
| 7 | fewer simulation sub-steps per game hour | large | changes game behaviour | changes results | - (not allowed) |
Synthetic-scene-only items (refinery receivers 12%) do not exist in the real save and are not listed.

## 5. What this means for X1 / X2 / X5 on the real save
Node 18.4 ms/hour. A 16x slowdown is an estimate of a phone-class CPU, NOT a measurement: about 295 ms/hour, i.e. inside the X1 budget (780) and X2 (390), above X5 (156). Real phone data is still missing.

## 6. Recommendation
The chain is near its floor for exact, low-risk changes: no remaining item reaches 5% without either your approval (#1) or a proof effort (#2). Suggested order: (a) phone measurement; (b) #1 if you accept the `_off` change; (c) #2 only as a shadow-verified experiment.
