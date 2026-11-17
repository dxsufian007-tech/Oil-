# Plan: stable play with 5,000 buildings (report 1 - analysis and plan; no engine change yet)
Branch perf/scale5000-plan from d678359. Constraints: no change to economy / production / pressure / flow equations, no change to the save system without approval, nothing removed, results bit-identical unless approved, no merge to main, no APK before approval.

## Evidence (label: MEASURED = this machine, Node, real game code and real save; ESTIMATE = reasoning, not measured; PHONE = not measured in this report)
- MEASURED: real save = 244 buildings, 64 central stations, 18 pumps, 69 segments. Hour = ~26-31 ms in Node (phone ~500-600 ms, measured in earlier phases).
- MEASURED (CPU profile, 72 h of the real save, self time): central.js 33% (_planHops 9.9, plan 3.6, toStation 3.5, receivers 3.1, _probeMemo 2.5), industry.js 24% (offer 9.4, accept 7.5, split 1.4), GC 6.4%; worldmap.js 29% (fbm, plainW, chunk) is mostly world generation at load (not the hour loop), but it is the same code that runs when the map streams new chunks.
- MEASURED (scale probe, perf-scale5000/scale-probe.js): adding 45-108 tank buildings (sources + sinks) to the central stations of the real save raised the hour from ~31 ms to ~50-60 ms at 289 buildings (+18% buildings -> ~+80% time) and ~100 ms at 352 (+44% -> ~3x). Caution: the added tanks also add flow, and the probe cannot attach beyond ~350 (station ports are used up), so this shows SUPERLINEAR growth, not a precise exponent.
- MEASURED: old bench-scale.js (5000 unconnected buildings: tick 9 ms/h, save 235 KB) is NOT representative: unconnected buildings do no network work. It should not be used as proof of 5000 capacity.
- MEASURED: save text 1.02 MB = eco 842 KB (market, daily log, trade log) + net 94 KB + store 53 KB at 244 buildings; store+net grow with buildings, eco mostly with time.
- ESTIMATE: at 5000 buildings with the same style of network, the hour cost is dominated by the central network and offer/accept; if growth stays superlinear (as probed) the hour is far beyond the frame budget on the phone. A real 5000-building number needs a connected generator (item A below).

## Bottlenecks, files, proposed fix, risk
| # | Bottleneck | Files | Proposal (same results) | Risk |
|---|---|---|---|---|
| A | No connected large-scale test scene: nothing measures 1000/3000/5000 honestly | perf-scale5000/ (new), test helpers | build a connected generator (modules of wells-separator-tank-pump on stations, tiled), report ms/h, memory, save size per N, Node + 16x-throttled browser | none (tool only) |
| B | central network: path/plan search per delivery (_planHops, plan, toStation, receivers) | central.js | extend the existing bit-identical memo ideas (already: plan memo, probe memo); cache per route by revision; avoid rebuilding station lists; shadow-compare every step | medium: must stay bit-identical; shadow mode first |
| C | offer/accept recursion through pipelines | industry.js | avoid temporary objects, cache edge lookups (edgeOf) per revision, no change of the water-fill order | medium |
| D | GC pressure (6-18%) from per-call objects | central.js, industry.js, economy.js | object reuse / typed scratch arrays in hot loops | low-medium |
| E | Slices: with 5000 buildings an hour is many frames; stage-1 pacing already splits it (budget share 0.78) | economy.js (run), building-lab.js | keep; verify X1/X2/X5 never drop accumulated time (backlog) at each N | low |
| F | Map: only visible chunks are drawn; building and pipe drawing (drawPipes already collects visible lines); off-screen buildings, redraw on every frame | building-lab.js, world-preview.js, map-layers.js | cull buildings by viewport, redraw only when camera or data changed, cap texture re-uploads | medium (visual regressions: screenshot compare) |
| G | Memory: heap per building not measured at scale | all | measure at 1000/3000/5000 with item A, find per-building objects and logs that grow without bound (daily log, trade log are already capped) | low |
| H | Save: autosave stall (known: ~380 ms worst on phone at 244 buildings); store+net grow with N | building-lab.js, economy.js | the approved A+B on perf/autosave-ab (byte-identical) is kept as an option; (C)(D)(E) of the save stay forbidden without approval | low (A+B already verified) |

## Order of work (independent branches, each documented before the next)
1. perf/scale5000-s1: item A (connected generator + baseline table at 1000/3000/5000, Node and throttled browser). Tool only.
2. perf/scale5000-s2: items B+C+D guided by the profile at N=1000..; shadow-compare vs original, 48 h hour-by-hour equality on the real save and on the generated scenes.
3. perf/scale5000-s3: map culling / redraw (F).
4. perf/scale5000-s4: memory plan and fixes (G) from the measured 1000/3000/5000 numbers.
5. Speeds X1/X2/X5 measured at every N in each phase (hours/s, backlog, FPS).

## Not done in this report (honest limits)
No phone measurement at scale; no real 5000-building number yet; the probe's exponent is approximate.
