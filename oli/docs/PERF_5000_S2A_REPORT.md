# S2 item 1 - cache memory (branch perf/scale5000-s2a, from perf/scale5000-s1 caa655b)
Change: only oli/central.js, +14 lines, two instant switches (CentralNet.hopShare, CentralNet.pcSparse; 0 = the original code).  No equation, limit, port or capacity changed; item 2 (search-tree reuse) NOT started.

## Finding that changed the plan
Memory per path cache was NOT the N x N arrays: V8 already kept them as sparse holey arrays (sparse maps alone: -2 MB, ~no time change).  The memory is the cached hop objects: every path search built a new {g, dir, from, to, ix} object per hop and the cache kept ~54,000 paths (C-2000) alive for the hour (the cache is cleared at every begin(), i.e. once per game hour -> also the source of GC churn).  A hop is fully fixed by its adjacency edge, so the fix is one frozen hop object per edge for the life of the graph (S2a).  The hops were already frozen once cached, and no code writes to them (central.js is the only user of path()).
1. hopShare (the real gain): central.js _pathCore builds the path from per-edge frozen objects (e._h), same values and order; only when the cache mode is on (pcMode > 0); with the cache off the old code runs.
2. pcSparse (requested): the cache arrays are Maps keyed by the same index.  Neutral-to-slightly-positive; kept.

## Equality (hour by hour, sha1 of JSON of store + pipe net + economy = everything the save holds: pressures, flows, production, stock, journal)
Old code (both switches 0) vs new (both 1), every hour must match:
- real save, 72 hours: 0 hours different.  M-1000 24 h, M-3000 12 h, C-1000 24 h, M-5000 6 h: 0 hours different.
- Tests: 25 of 26 central / perf / network / stress / tank-group tests pass; test-tank-group-big failed once under 2 parallel jobs on a 5 ms timing limit and passes alone on both old and new code (it does not touch the central path).

## Before / after (MEASURED here, never on the phone).  off = both switches 0, on = both 1
Node (24 h window after 6 h warm-up; C-2000 6 h; 2-3 runs each, values shown as range):
| scene | hour ms off -> on | heap MB off -> on | rss MB off -> on | GC % off -> on |
| M-5000 | 85-123 -> 76-84 | 49 -> 41 | 355 -> 259 | 7-9 -> 6 |
| C-1000 | 112-129 -> 111-112 | 40 -> 26 | 315 -> 240 | 7.4 -> 6-10 |
| C-2000 | 1,508-1,526 -> 880-1,019 | 172 -> 74 | 840-1,405 -> 415 | 9-9.6 -> 7-8 |
| C-4000 | 296-345 -> 258-294 | 91 -> 57 | 544-568 -> 392-398 | 7-7.5 -> 5.3-5.7 |
Chromium, engine only (x1: 8 h; x16: 4 h, the phone-like factor):
| scene | x1 off -> on | x16 off -> on | heap MB off -> on |
| M-5000 | 73 -> 56 ms | 1,513 -> 1,079 ms | 24 -> 19-20 |
| C-1000 | 110 -> 79 ms | 1,761 -> 1,865 ms (noise) | 19.6 -> 12 |
| C-4000 | 275 -> 248 ms | 5,520 -> 4,979 ms | 45 -> 26-27 |
Reading: memory -17% to -57% (clear); hour time -7% to -37% in Node, -10% to -29% in Chromium except one noisy cell; save stringify time unchanged.
X1 / X2 / X5 (fit < 780 / 390 / 156 ms at x16): no scene changed class, M-5000 is still above X1 at x16 (1,079 ms): the large-network search cost remains for item 2.

## Not done / limits
No phone measurement; flat benchmark scenes (not the real map); one generator family.  The remaining hour cost is the path search itself (_pathCore), which item 2 targets.
Rollback: set CentralNet.hopShare = 0 and CentralNet.pcSparse = 0 (or revert the commit).
