# PERF 5000 - integration review (branch integration/perf-s3, tip 21c285e + this report)
Not merged into main or release, no APK. Node numbers are sandbox measurements (2 cores). No phone was measured.

## 1. Were the S3 numbers from the three improvements together or one by one?
Together: they came from the top of the stack (perf/s3-jointcap = S2a + S2b code + S3-1 + S3-2 + S3-3, each behind a switch). Single contributions were NOT separated there. This review separates them with the switches (table 3). S3-3 (joint tiers) has no switch; it was compared by code tree and was below noise.
Branch: integration/perf-s3 = perf/s3-jointcap + measurement tools. It contains the stack in this order: S2a (hop sharing + sparse path cache) -> S2b (search tree, OFF) -> S3-1 hopFreezeSkip -> S3-2 rcvSkip -> S3-3 joint tiers.

## 2. Configurations
orig = everything off | s2a = hopShare+pcSparse | s2b = s2a + tree | rcvonly = rcvSkip on the ORIGINAL engine | s2a_rcv = s2a + rcvSkip | best = s2a + rcvSkip + hopFreezeSkip, tree OFF | best_tree = best + tree.

## 3. Hour time (median ms/hour) / heap MB / GC ms in the measured window
Real save: 7 runs x 60 game hours (about 240 buildings). Scenes: 3 runs (C-2000: 1 run), 20 hours (C-4000: 12, C-2000: 6). Interleaved runs.
| scene | orig | s2a | s2b | rcvonly | s2a_rcv | best | best_tree |
|---|---|---|---|---|---|---|---|
| REAL SAVE | 23.5 / 15 / 55 | 23.9 / 14 / 49 | 24.5 / 15 / 55 | 19.0 / 14 / 39 | - | 19.3 / 14 / 36 | 18.6 / 14 / 40 |
| M-1000 | 10.4 / 13 / 18 | 9.8 / 13 / 12 | 11.1 / 13 / 17 | 8.8 / 13 / 17 | 9.4 / 13 / 12 | 9.7 / 13 / 17 | 10.8 / 13 / 16 |
| M-3000 | 16.8 / 23 / 25 | 14.2 / 22 / 27 | 12.6 / 22 / 22 | 13.3 / 21 / 17 | 13.6 / 21 / 28 | 11.6 / 21 / 17 | 11.6 / 21 / 14 |
| M-5000 | 72.8 / 48 / 148 | 65.8 / 41 / 83 | 41.3 / 41 / 87 | 28.2 / 35 / 50 | 27.8 / 33 / 46 | 25.7 / 33 / 35 | 23.5 / 33 / 37 |
| C-1000 | 115 / 40 / 213 | 100 / 26 / 178 | 60 / 26 / 142 | 28 / 20 / 39 | 23 / 16 / 27 | 22 / 16 / 25 | 19 / 17 / 29 |
| C-2000 | 1014 / 171 / 575 | 796 / 73 / 323 | 541 / 74 / 342 | 161 / 45 / 85 | 120 / 30 / 52 | 120 / 30 / 51 | 153 / 31 / 73 |
| C-4000 | 263 / 91 / 229 | 238 / 57 / 186 | 140 / 57 / 165 | 54 / 39 / 46 | 42 / 34 / 35 | 42 / 33 / 34 | 36 / 34 / 37 |
Real save, per-run spread (mean ms/hour): orig 22.7-24.5, rcvonly 18.4-19.9, best 18.1-21.9, best_tree 17.9-19.5. p95: orig 27.5, best 25.6, best_tree 23.2.
Noise is about +-10%; M-1000 and M-3000 differences are noise.

## 4. What each piece is worth
- rcvSkip: the whole gain on the real save (-19% hour time, GC -30%) and the dominant gain on central-heavy scenes (C-2000 -84%, C-4000 -79%, M-5000 -61% vs orig).
- S2a (hop sharing + sparse cache): no speed change on the real save; it is what cuts memory on big central networks (C-2000 heap 171 -> 73 MB alone, 45 -> 30 MB on top of rcvSkip) and a little time (-3 to -20%).
- hopFreezeSkip and joint tier cache: at or below noise (about 0-3%).
- Tree (S2b): worth about -40% by itself before rcvSkip, but after rcvSkip it is within noise on the real save (+-0.7 ms) and on M scenes, 10-15% on C-1000/C-4000, and WORSE on C-2000 (120 -> 153 ms, 1 run). The tree can be dropped.
## 5. Best combination = `best`: s2a + rcvSkip + hopFreezeSkip, tree OFF
Real save: 23.5 -> 19.3 ms/hour (-18%), GC 55 -> 36 ms, heap 15 -> 14 MB. Scenes: M-5000 -65%, C-1000 -81%, C-2000 -88%, C-4000 -84%, memory -30 to -82%.
Honest note: the large gains are on synthetic scenes where 97% of probes hit a dead receiver. On the real save 57% of probes are dead (skipped), 31% succeed and 11% hit a full tank; that is why the real gain is 18%, not 80%.

## 6. Equality of `best` vs original (hour by hour, sha1 of store+net+economy)
- Real save, 240 game hours: 0 different hours.
- Real save with perturbations (pump faults/direction, channel open/close, segment fault, tank full/empty, refinery limit, building removal, tap+tank add), seeds 41-46 x capacity 1/0.02/0.005: 18 runs x 24 h = 432 h; plus 2 runs with the tree on and verify every 4th: 48 h. Total 480 h, 0 different hours, perturbations identical, 4,214 saturation events exercised.
- Earlier: 40 runs / 704 h on scenes up to 4000 buildings (S3 report), 22-run battery for the tree (S2b report), 18 fault-injection runs for the tree fallback.
- Test suite (220 files) on the tip: 13 fail, identical to base d678359; two more fail only under parallel load (test-game-time-ui, test-tank-group-big: both pass alone on tip and base).

## 7. Full receivers (study, nothing implemented)
Classified every probe: real save 119,737 probes / 12 h = 37,419 positive (31%), 68,681 dead (57%, already skipped), 13,637 full tanks (11%); generated scenes: 3% positive, 85% dead, 12% refineries (no free capacity).
Potential: at most about 11% of the probes on the real save, roughly 5-8% of hour time (the probes that succeed and the plan memo remain the cost).
Blocker for bit-exact: a probe of a tank writes `s._off = max(_off, f.r)` before it finds the tank full, and `_off` is part of the saved state (it appears in the save JSON; it is read only by a help text for pump/junction/separator/refinery overload, never for tanks). Skipping the probe would leave tank `_off` at a different value in the saved file although no game result depends on it. Not done: I will not change saved fields without approval. If you accept that tank `_off` is no longer written for full tanks, the skip is simple and I would prove everything else identical.

## 8. Merging the economy / industry passes (study, nothing implemented)
Real save profile: economy 4.4%, industry stepGen 1.7% -> at most 2-3% available. Large synthetic scenes: economy _tickGen+_tick+loadOf+matNeedDay about 17% of M-5000, of which a merge might save a third (about 5%). Float sums must keep the exact order, so each merged pass needs its own hash proof; gain too small versus risk for the real save. Not recommended now.

## 9. Remaining risks
- The real gain is ~18% on a 240-building save; the 5000-building claim rests on synthetic scenes (generated, really connected, but with an unusually high share of dead receivers).
- rcvSkip relies on probeDead repeating the first tests of offer()/accept(): a future change to those functions without updating probeDead could break equality. Mitigation: keep the equality battery (tools in perf-scale5000/) in the release checks; switch `CentralNet.rcvSkip=0` restores the old path instantly.
- Not tested: a real phone, games longer than 240 hours, C-4000 at capacity 0.02 (the original engine itself runs out of memory).
- The tree (S2b) stays OFF; its fallback is proven by injection (18 cases) but unverified answers can exist between checks.

## 10. Recommendation
1. Adopt `best` (tree OFF) as the candidate set: it is the best speed/memory/risk trade-off. 2. Do not activate the tree. 3. Next real gain on the real save would need a cheaper way to answer positive probes (plan/offer/accept chain, 30-35% of the hour) - needs a design and a risk plan first. 4. Full-tank skip only with your decision on tank `_off`. 5. Before any merge: phone measurement (not available now).
