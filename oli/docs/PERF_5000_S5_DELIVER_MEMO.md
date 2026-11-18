# PERF 5000 - S5: dependency-tracked deliver memo (SHADOW only)
Branch perf/s5-deliver-memo (from perf/s4-positive-probes). Candidate set unchanged: S2a + rcvSkip + hopFreezeSkip, tree OFF. The new memo exists only as a shadow (`CentralNet.dfDefault`, default 0 = off): it computes its own answers beside the original memo, compares them, and the simulation always uses the original answer. No equation, no saved field, no `_off`, no full-tank change. Node numbers are sandbox measurements; the phone was not measured.

## 1. Why a result is recomputed although its inputs repeat
The original memo entry (one per source station, channel, port) is valid only while `sim._cv`, `central._dv`, the plan epoch, the edge table, the flow, the visited set and the channel's pumps are all unchanged. Classification of all 35,520 deliver calls on the real save (12 hours):
- hit 7,771 (22%)
- miss 27,749: 19,280 first time for this exact flow (rate/pressure never seen: inherently new), 2,139 + 3,600 + 5,823 + 9,648 + ... changed flow, and 6,345 with the SAME flow and visited set where only `_cv` and `_dv` changed.
- All 6,345 recomputed to exactly the same answer as the previous time. Their only cause: between the two calls inside the same top-level operation, a sibling commit (accept finally -> `_cv++`, `_apply` -> `_dv++`) happened that touched something else. No operation start or step start was involved (cv bump sites between the two calls: only the commit site, 6,345 / 6,345).
So the whole addressable share is 17.9% of deliveries (6,345 / 35,520).

## 2. Dependencies (what a probe answer reads), as designed and checked
- device states of every building the probe passes through (accept) plus the sibling tanks of a tank group; edge state (flow) of every pipe offered into (offer, probeDead);
- central usage of every channel it plans on (a refinery chain also probes other channels): the per-channel version `_plV[ci]`;
- pump state of the channel, the flow, the visited set, edge table, plan epoch, graph revision (as before);
- everything changed outside a commit (step start, operation starts: sites 430/442/578/598/614) stays a global epoch `sim._ep` that invalidates every entry, exactly like `_cv` does today.
Invalidation: a commit bumps only the version of the building(s) / edge(s) it wrote (accept commit with acc > 0, tank-group siblings, offer commit with acc > 0); `_apply` already bumps its channel. An entry is reused only if the epoch, every dependency version, every touched channel version and the old conditions are unchanged. Recording: nested deliveries add their dependencies to the caller; if a dependency record is incomplete the caller's entry is marked bad.
Automatic fallback: any shadow disagreement sets `dfMode=0`, drops the memo and stores the reason (`dfStats.reason`).

## 3. Shadow results (every answer compared with the recomputed original)
| run | deliver calls | would be reused (fine valid, original recomputed) | % of calls | agree | DISAGREE | auto-disabled |
|---|---|---|---|---|---|---|
| REAL save, 240 h | 710,400 | 98,151 | 13.8% | 98,151 | 0 | 0 |
| real save with perturbations (seeds 51-55 x capacity 1/0.02/0.005, 15 runs) + scenes 1000/3000/4000/5000 (8 runs), 424 h | 417,618 | 45,703 | 10.9% | 45,703 | 0 | 0 |
| M-1000/3000/5000, C-1000/2000/4000 (4-12 h) | 77-1,470 each | 0 | 0% | - | 0 | 0 |
Perturbations: pump fault/direction, channel open/close, segment fault, tank full/empty, refinery limit, building removal, tap+tank addition. Simulation hashes in all perturbation runs: 0 hours different from the ORIGINAL engine (the shadow does not touch the result). The 240-hour real-save run: 0 different hours vs the candidate set.
Hit ratio check: for the real save the shadow found 4,941 of the 6,345 identical-answer repeats (78%) in 12 hours; the rest are repeats whose nested dependency record was marked stale or flow/visited set differed in the stored copy.
Dependency sizes: 3.6 buildings and 6.3 pipes per entry on the real save; 11-27 buildings and 78-181 pipes on the 1000-4000 scenes (and no reuse there: few deliveries repeat).
No disagreement happened, so no cause analysis was needed; the guard is in place for the next stage.

## 4. Time and memory
- Default off (code present, dfMode 0): 18.4 -> 18.6 ms/hour (+1.1%, noise); identical hashes on real + 1000/3000/4000/5000.
- Shadow with clocks off (pure bookkeeping, validation and comparison): 18.8 -> 22.3 ms/hour = +18.6% slower, GC 31 -> 43 ms, heap 15 -> 15 MB. (Per miss: an entry with copies of the flow, visited set, pump snapshot, two dependency arrays and their version arrays.)
- Time the reused answers would have saved (clock-measured, includes timer cost so it is an upper bound): 315-351 ms over 240 hours = about 1.3-1.5 ms/hour = at most 7-8% of the hour. Validation of all calls cost ~0.8 ms/hour.
- Estimated result of an ACTIVE version with this bookkeeping: about -10% (slower), because the recording is paid on every miss (78% of calls) and the saving is capped at about 7%. Even a bookkeeping twice as cheap would end near +0-3%. This is an estimate, not a measurement of an active version (none was run in the simulation).

## 5. Risks proven / not proven
Proven in these runs: the dependency set is sufficient for the real save over 240 h and under 23 perturbation runs (0 disagreements in 143,854 compared answers). Not proven: states that never occurred (tank groups with sibling changes inside one operation, edges replaced mid-hour, player actions inside a step); exactness would rest on shadow evidence, not on a proof.

## 6. Recommendation
Do NOT move to a limited activation test: the addressable share is 14% of deliveries on the real save and 0% on the large synthetic scenes, and the bookkeeping outweighs the saving. Keep the shadow code (off by default, +1.1% noise) or drop the branch; I recommend keeping it only as an analysis tool. Better next steps: (a) phone measurement; (b) the full-tank skip (needs your decision on `_off`), which targets 27% of the plan misses and does not need dependency tracking.
