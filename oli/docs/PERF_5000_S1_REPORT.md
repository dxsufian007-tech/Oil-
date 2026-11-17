# S1 report - measurement tools and first numbers for 5,000 buildings (branch perf/scale5000-s1)
Tools only: no engine file was changed (git diff of the game files is empty); no equation, limit, capacity or price was touched. No merge, no APK.
Tools (oli/perf-scale5000/): gen-scene.js (generator), run-gen.js (checkpoints), measure.js (Node), engine-page.html + browser-measure.js (Chromium, engine only), scale-probe.js (earlier probe).
Label: MEASURED = this sandbox (Node 22, Chromium via playwright, 2 cores), nothing here is measured on the phone.

## What the generator builds (every pipe through the player's own layPipe/planPipe routing, every tap through planTap/commitTap)
- PRODUCER: 3 wells -> junction -> pump -> separator -> crude tank -> one central tap (CRUDE port).  PRODUCER-M: up to 8 wells -> main manifold -> pump -> separator -> tank -> tap.
- REFINERY (central): crude from its own tap, products into 4 local product tanks.  LOCAL CHAIN: wells -> junction -> pump -> separator -> tank -> refinery -> 4 product tanks, no trunk.  SINK: product tank taking from a central product channel.
- Map: FLAT 1920x1280, fully buildable, oil everywhere (terrain / oil-field / existing-pipe obstacles removed on purpose, see "limits"); the REAL central plan (29 stations, 34 routes, 18 pumps) installed; empty company. Harness action: sink and product tanks are emptied every hour (stands for sales; it is outside the engine).
- Connectivity proof (measure.js): share of buildings with at least one pipe; wells producing; flows. Scene 5,001: 4,788 buildings connected (95.7%; the rest are 213 "orphan" central stations, see limits); all 972 wells producing 444,750 b/d, 392 refineries.
Scenes (cumulative checkpoints of one run each): M = mixed (about 75% of rounds local chains): 1,009 / 3,003 / 5,001 buildings. C = central-heavy: 1,007 (33 producers + 35 manifold producers + 10 refineries, 409 taps), 2,006 (46 + 108 + 17, 654 taps), 4,002 (44 + 59 + 9 + 236 local chains, 543 taps).

## Hour time (ms per game hour; X1 / X2 / X5 need < 780 / 390 / 156 ms at the game's 0.78 share)
| scene | buildings | stations | Node mean (p95, max) | Chromium x1 mean | Chromium x16 mean (p95) | fits X1/X2/X5 at x16 |
| M-1000 | 1,009 | 62 | 9.8 (19, 28) | 6 | 95 (143) | yes / yes / yes |
| M-3000 | 3,003 | 126 | 19.3 (33, 41) | 18 | 341 (462) | yes / yes / no |
| M-5000 | 5,001 | 287 | 89.8 (140, 161) | 66 | 1,602 (1,758) | no / no / no |
| C-1000 | 1,007 | 438 | 128.9 (165, 165) | 86 | 1,942 (2,389) | no / no / no |
| C-2000 | 2,006 | 683 | 1,174.9 (1,444, 1,444) | 755 | 23,130 (24,782) | no / no / no |
| C-4000 | 4,002 | 572 | 330.2 (451, 462) | 256 | 6,455 (8,314) | no / no / no |
Node: 24 h window after 6 h warm-up (C-2000: 6 h). Chromium: 8 h (x1) / 3-4 h (x16). Browser x16 is the project's phone-like factor for the ENGINE only (no rendering, no UI); it is not an FPS number. The real save (244 buildings, 64 stations) costs 26-31 ms in Node and about 500-600 ms on the phone.

## Memory, GC, save (Node unless noted)
| scene | heap after load -> after 24 h (MB) | rss (MB) | GC in window | save stringify (Node / x16) | save size |
| M-1000 | 10.9 -> 13.5 | 128 | 10 (0 major), 5.6% | 20 ms / 319 ms | 632 KB |
| M-3000 | 17.2 -> 23.7 | 189 | 12 (0 major), 5.7% | 43 ms / 614 ms | 1,621 KB |
| M-5000 | 24.9 -> 52.9 | 519 | 32 (1 major), 8.4% | 52 ms / 828 ms | 2,696 KB |
| C-1000 | 12.2 -> 40.0 | 317 | 30 (3 major), 7.1% | 14 ms / 410 ms | 712 KB |
| C-2000 | 18.4 -> 167.8 | 834 | 65 (2 major), 6.4% | 114 ms / 735 ms | 1,694 KB |
| C-4000 | 25.4 -> 91.3 | 548 | 69 (4 major), 6.7% | 67 ms / 878 ms | 2,649 KB |
GC from --trace-gc inside the measured window. The heap growth during the window is the central-network caches (path cache allocates N x N slots per channel, N = number of stations).

## CPU profile (Node, self time)
- C-scenes: central.js 69-83% (_pathCore 37-50%, _planHops 12-23%, _pcStore ~5%), industry.js 5-6%, GC 9-20% (profile run).
- M-5000: central.js 61% (_pathCore 42%, _planHops 11%), industry.js 13%, GC 10%.  M-1000: economy.js _tickGen 35%, industry.js stepGen 31%, central.js 9%.
- Path searches per game hour (cache stats): M-1000 48, M-3000 428, M-5000 3,851, C-1000 4,454, C-4000 9,270, C-2000 60,521. Path cache hit 0.5-14% (72% in C-2000). The deliver memo got 0 hits in every generated scene (it hits in the real save).

## Answer: did we reach 5,000 connected buildings?
Yes in the flat benchmark map: 5,001 buildings, 5,039 pipelines, 287 central stations, 95.7% connected, every well producing. Two caveats: the map is flat (the real map is far more restrictive, see below) and 4.3% are orphan stations (taps whose link failed, the generator cannot remove a tap).
The cost does NOT follow the building count: M-3000 costs 19 ms, C-2000 costs 1,175 ms. It follows the size of the central network (stations x path searches per hour); local chains are cheap (about 7-10 ms per 1,000 buildings).

## Limits and bottlenecks met while expanding (counts for the 5,001 run, all failures are the player's own rules refusing the action)
- pipe:noRoute 8,234; noLinkSpot (no place where the pipe can reach) well 649, pump 258, others < 25 each; invalidProduct 254 (a port of the wrong channel tried first).
- route() is a bounded breadth-first search (14-tile margin, 60,000 nodes) that cannot cross a central trunk line and cannot pass the access tile of another port: long links and enclosed ports fail.
- A central station has 12 ports (2 per channel) but they sit on neighbouring tiles of the same side (top row CRUDE, WATER, GASOLINE; bottom row GASOLINE2, WATER2, CRUDE2): a second pipe usually cannot reach its neighbour. In practice every producer / refinery output needs its OWN tap: 258 taps for 63 central modules in M-5000, 654 taps for 171 modules in C-2000.
- The 29 pre-built stations sit at trunk crossings; their ports are fenced by the trunk lines, so only tapped stations were usable.
- Real map (first attempt on the real save, before the flat mode): only 64 of 415 drillable fields lie within 150 tiles of the trunk, and terrain, slope and oil-field rules refused most placements: 12 producers could be added. The flat mode removes this on purpose; the real map's own ceiling is a separate, much lower number.
- Orphan stations (213-530 per scene) are an artefact of the generator but also something a player can leave behind; they stay in the central graph and make every path search longer.
- Generator speed: about 1.5-30 buildings/s depending on the mix; central modules get slower as the trunk fills.

## Biggest bottleneck
The central network path search per delivery: _pathCore (+_planHops, _pcStore) is 50-80% of the hour in every scene that has hundreds of stations, and the number of searches per hour grows with the number of producers x receivers; the caches hit little because each (source, receiver) pair is a different key. Second: GC 6-10% (20% in the profile run) and cache memory N x N per channel.

## Proposal for S2 (not started; needs approval)
1. Path search: avoid the full Dijkstra per (source, receiver) pair - search once per source and channel and reuse the tree for all receivers of the same step, keeping the exact tie rules and the per-step saturation checks; shadow-compare every hour against the original (bit-identical required).  Risk: medium (saturation changes mid-step); mitigation: use the tree only until the first saturation event, then fall back.
2. Cache structure: replace the N x N arrays per channel by sparse maps keyed by (source) and drop entries of stations that are not part of any delivery; lowers memory and GC.  Risk: low.
3. Orphan / pass-through stations: shorten paths by contracting stations that only join two segments, keeping segment-by-segment pressure and capacity arithmetic in the same order so results stay identical.  Risk: high for bit-identity, so research only.
4. offer/accept and stepGen allocation (industry.js 5-18%): temporary objects per call.  Risk: low-medium.
Order: 2 (low risk), then 1 with shadow mode, 3 only as a study.
Measurements to repeat at every S2 step: this report's six scenes, Node + Chromium x1 + x16, equality of every hour against the original.
