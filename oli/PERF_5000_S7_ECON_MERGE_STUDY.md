# S7 — study: merging the economy and industry passes (NO code change to the game; branch perf/s7-econ-merge-study from S6 f977a52)

## 1. Where an hour goes (measured, Node, `perf-scale5000/passcost.js`, real save, 100 h)
| | real save (244) | scene 1000 | scene 5000 |
|---|---|---|---|
| hour total | 13.81 ms | 18.40 | 21.08 |
| Sim.stepGen (industry) | 13.09 (94.8%) | 17.29 (94.0%) | 16.93 (80.3%) |
| everything else in the hour (the whole economy side) | 0.71 (5.2%) | 1.11 (6.0%) | 4.16 (19.7%) |
Economy per-building passes, replayed alone (ms per hour): ecoEff pre-pass 0.012 / 0.059 / 0.217; cost pass 0.030 / 0.057 / 0.327; storage pass 0.010 / 0.014 / 0.057; _qNow 0.005 / – / 0.133.
Industry per-building passes: clear `_` fields 0.027 / – / 0.439; apply-deliveries 0.009 / – / 0.080.
All passes that could even be merged add up to ~0.09 ms on the real save (0.65% of the hour) and ~1.4 ms at 5000 buildings (6.6%) before any saving (a merge saves only the loop overhead, not the per-building work).
CPU profile (real save): economy.js 4.2% + ledger 0.5% self time in total; the cost is the central-network probe chain (offer/accept/_planHops/toStation/receivers ~50%).

## 2. Order of one hour (economy.js `_tickGen` -> industry.js `stepGen`)
sync, _collect, store.tick -> **E1** per building: `s.ecoEff = effOf(b)` -> _autoBuy -> _gateMaterials (refinery matLim) -> **Sim.stepGen**: `_cv++`, S0 clear edges + clear `_` fields per building, cn.begin, S1 wells (many `split` calls), S2 tanks / tank groups, cn.end, S3 apply deliveries + derive values, copy edge values -> **E2** cost pass (loadOf/kwOf/opDay/maintDay/assetRec, production sums) -> **E3** storage cost pass -> power balance, journal posts, refinery cost allocation, staff, payroll, market, _auto, _finance.

## 3. Dependencies
- E1 reads only global economy state (pw.factor, pwStop, staffF, crudeLabel) and b.c / b.s.started; writes `ecoEff`, read ONLY by industry.js `eco(b)` of the same building (and help text). It must stay before S1; it could move into S0 without changing numbers (no cross-building read), but it saves ~0.012 ms.
- E2 reads `_in/_out/_target/_p/_inBuy/_g/_w/flared` written in S1/S2 and cleared in S0 of the next hour: it must stay after S2. It does not read fields S3 writes (vol, wat, temp, eff, power), so it could in principle be fused into the S3 loop. Its sums (kw, prod.*, crude.*, refin.*) are accumulated in building order: the fused loop would keep that order, so floating-point results would not change.
- E3 reads `vol` AFTER S3 applied `_pend`: it can only fuse into the S3 loop AFTER the per-building apply step (same order of the storageCost sum).
- Must stay separate: S1 -> S2 (the order of pushes decides who gets oil: any reorder changes results), cn.begin/end, `_cv` bumps (memo validity), the generator pause points (`sl`): the live game slices an hour; test-sliced-hour proves slices are bit-identical, a fused loop changes the pause points and must pass it.
- Side effects to keep: `ar.useStart`, `s._flSeen` written in E2; `assetRec` creates records in the building order.

## 4. Risks
1. Float order: sums stay in the same building order only if the fused loop visits buildings in the same order and skips the same ones (`b.st !== 'OPERATIONAL'`, `b.s` missing for E3).
2. A building list change inside an hour (construction finishing in `store.tick`) happens before E1, so lists are consistent; a fused loop must use the same `items` array.
3. Slicing: moving work across `yield` points changes which hour-part the live UI sees mid-hour (`view`/`$d`), and the slice budget (20 ms) that was tuned for the phone.
4. Maintenance risk: the two loops belong to two modules; a fused loop couples economy.js to industry.js internals (`s._pend`).

## 5. Expected gain (honest)
Real save: <= 0.1 ms of 13.8 ms (<= 0.7%), i.e. below the run-to-run noise (3-5%): not measurable, certainly not on the phone (31 ms/h, noise ~1 ms). Scene 5000: at most ~1.4 ms of 21 (6.6%) as an upper bound, a realistic 2-3%. The earlier estimate of 2-3% on the real save was too high: the measurement shows 0.65% upper bound.

## 6. Proposed design (only if approved, not recommended)
Step 1 (zero risk): move E1 into the S0 per-building loop. Step 2: fuse E3 into the S3 loop. Step 3: fuse E2 into S3 (a flag `Company.fusePasses`, default 0 = old code path kept side by side, instant switch). Nothing else changes; no equation, no limit, no save format.

## 7. Equality test plan (hour by hour, stop at the first difference)
- Real save 240 h: sha1 per hour of store + net + economy JSON (perf-scale5000/eq-hours.js); A = flag 0, B = flag 1.
- Perturbation battery (perturb-eq.js, 38 runs / 572 h incl. saturation, pump faults, channels, removals).
- test-sliced-hour (bit-identical sliced vs one-go hour) + full suite (compare with the 13 known base failures).
- Performance A/B interleaved (7 reps x 60 h), memory and GC, real save + scenes.
- Any difference: stop, do not adopt.

## 8. Recommendation: DO NOT MERGE the passes
The economy side is 5% of an hour on the real save and the mergeable loops <1%. The cost is 95% inside the central-network probe chain. The effort and the float-order/slicing risk are not justified by <=0.7% (inside noise). Not started, no code changed.
Where a real gain could still be (all need separate study, none started): (1) steady-state hour replay: when no input to the network changed, reuse the previous hour's flows (large gain on quiet networks, high risk, needs a proven invalidation set); (2) batching probes of one receiver port (medium gain, medium-high risk); (3) measuring memory/GC on the phone through chrome://inspect (no gain, replaces the missing numbers). On the phone the real save runs at ~31 ms/h: 25x / 12x / 5x headroom at X1 / X2 / X5, so further CPU work is optional.
