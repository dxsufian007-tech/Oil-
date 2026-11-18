# OLI EMPIRE performance line S1–S8 — final summary (closed temporarily, Nov 18 2026)
Nothing is merged into main or release. No official APK. The installed game (com.oli.olicentral) was never touched. Best tested version: **S6** (branch perf/s6-full-tank-skip, commit b91d0b7; branch tip f977a52 adds the phone report).

## 1. Best result (candidate set = S2a + rcvSkip + hopFreezeSkip + S6, S2b tree OFF)
Real save (244 buildings), Node (sandbox): 24.9 -> 17.6 ms/game hour (-29%), GC 56 -> 35 ms per 60 h, heap ~15 MB unchanged. Synthetic scenes (Node): 5000 buildings -65%, C-1000 -81%, C-2000 -88%, C-4000 -84% (S3 candidate; S6 adds ~-5..-12% only where full tanks exist).
**Real phone (Honor BRP-NX1, Android 16, 8 cores, 8 GB), real save, measured:**
| | median ms/h | worst |
|---|---|---|
| Chrome WebView inside the Claude app, original engine | 40.4 | 82.1 |
| same, candidate + S6 off | 32.4 | 72.1 |
| same, candidate + S6 on | 31.3 | 74.6 |
| game WebView (bench APK com.oli.olibench), original | 42.8 | 88.5 |
| game WebView, S6 off | 34.5 | 125.5 |
| game WebView, S6 on | 32.8 | 74.1 |
Phone gain vs original: -22.5% (Chrome) / -23.4% (APK WebView); S6 alone -3.4% / -4.9% (Node -5.2%). Headroom on the phone at the budgets X1 780 / X2 390 / X5 156 ms per hour: ~25x / 12.5x / 5x. Paced at the 250 ms game tick the engine used 11% / 19% / 30% of the time at X1 / X2 / X5, all hours on time, timer lateness <= 4.7 ms (the phone clocks down under light load, so paced numbers cannot rank configs). NOT measured: engine memory and GC time on the phone (the WebView reports a constant 9.5 MB heap; GC time is not exposed to a page). The old x16 estimate (295 ms/h) was ~9x too pessimistic and must not be used.

## 2. Branches and commits (all unmerged; pushed to origin only to keep them)
| branch | commit | content |
|---|---|---|
| perf/scale5000-s2b | af59f7d | S2a (hopShare, pcSparse), S2b tree (OFF), tools, reports |
| perf/s3-pcstore-freeze -> perf/s3-rcv-skip -> perf/s3-jointcap | da6a83e -> 39f8d95 -> 54ff7c5 / c4e34c0 | hopFreezeSkip, rcvSkip (Sim.probeDead), joint tier cache, S3 report |
| integration/perf-s3 | 4d61813 | integration of S2a + S3, best-combination report |
| perf/s4-positive-probes | b10bb03 | S4 analysis, no engine change |
| perf/s5-deliver-memo | 64c6f29 | deliver-memo shadow (dfDefault 0): NOT recommended, shadow overhead +18.6% |
| **perf/s6-full-tank-skip** | b91d0b7 (code), cc6291e (phone page generator), f977a52 (phone report) | **S6 = best version** |
| bench/s6-apk | f2b3108, workflow fix, 7fad7a2 (APK report, local) | in-app bench (separate app com.oli.olibench), workflow bench-apk.yml; APK on branch bench-apk-build: OliBench-f2b3108.apk, versionCode 102, SHA-256 of the file c0146806c9b8a343f0c0d46e1cab71056a03a0f9e29c5e5142b8a2c21635798a, signed with the fixed key 3f5e9242...b1aaf |
| perf/s7-econ-merge-study | 95cb831 | economy/industry pass merge study: do NOT merge (<=0.7% on the real save) |
| perf/s8-batch-probes-study | 0f30962 | receiver-port probe batching study: do NOT implement (<=1-1.9%) |
| perf/perf-line-summary | this file | |
S2b tree stays OFF everywhere (it adds nothing once rcvSkip is on).

## 3. Switches (instant fallback to the old behaviour; the old code paths are kept)
`CentralNet.hopShare` (S2a, default 1), `CentralNet.pcSparse` (S2a, 1), `CentralNet.rcvSkip` (S3, 1), `CentralNet.hopFreezeSkip` (S3, 1), `CentralNet.trDefault` (S2b tree: 0 off / 1 shadow / 2 on; default 0), `Sim.fullTankSkip` (S6, 1). All 0 = the original engine, bit for bit. NOTE: the defaults in the S6 branch are ON, so merging S6 would activate all of them; decide the defaults at merge time.

## 4. Equality evidence (Node)
Per-hour sha1 of store + net + economy JSON, original engine vs candidate: identical hour by hour on the real save and on scenes 1000-5000. S6 on the real save, 240 h: 0 different hours (tank `_off` normalised); 38 perturbation runs (pump fault/direction, channel open/close, segment fault, tank full/empty, refinery limit, building removal, tap + tank add; forced saturation), 572 h: 0 different hours, 4,302 saturation events; control without normalisation differs from hour 0 (`_off` is the only difference).

## 5. Tests
test-full-tank-skip.js (new, S6) passes. Full suite (221 files) on S6: only the 13 known failures that also fail on the base d678359 (test-building-lab, economy-screens, fields, full-cycle, gap-sign, offshore-8, oil-trading-ui, sector-counts, sector-coverage, sector-rules, sectors-ui, sectors, tank-ports) plus two load-only flakes (test-tank-group-big, test-game-time-ui: pass when run alone). Passing, relevant to saves and slicing: test-old-save-c4, test-old-save-reserve, test-save-safety, test-speed-oldsave, test-network-diag-realsave, test-sliced-hour, test-catchup-sliced.

## 6. Old-save compatibility
No change to the save format, field names, building data or economy. Old saves load as before (the old-save tests pass; the real save loads and runs identically). The single approved difference (S6): the saved `_off` of a FULL, single (not grouped) tank or gas store is no longer refreshed while its probe is skipped, so that one number can differ in the file (real save, 48 h: 3 of 244 buildings, `_off` only). `_off` is read only by the help texts of pump / junction / separator / refinery, never for tanks. Setting `Sim.fullTankSkip = 0` restores it. Nothing is deleted.

## 7. Notes for a developer who continues
- The real save lives only in oli/local-saves/ (read-only input, never commit it). The bench APK app keeps a copy in ITS OWN storage (com.oli.olibench); uninstall it or use "forget saved save" to remove it. The phone-bench HTML page embeds the save and is not committed.
- The phone bench app/page is a measurement tool: engine only, no rendering/UI, hours simulated in one go (the game slices hours into ~20 ms budgets).
- Method that works: per-hour sha1 of store+net+economy (perf-scale5000/eq-hours.js, hashnorm.js, perturb-eq.js, save-diff.js); interleaved A/B runs (abreal / abcfg); measurement noise is +-5-10% per run, so changes below ~3% cannot be proven.
- Cost structure (real save): ~95% of an hour is Sim.stepGen, ~80% of that the central-network probe chain (offer/accept/_planHops/toStation); the whole economy side is 5% and its per-building loops <1% (S7); identical probes never repeat in the same state, <=1% any state (S8). The chain is near its exact floor.
- The bench APK branch bench-apk-build also holds older experimental APKs from earlier sessions (A-orig, B-perf, FZon/FZoff); they are not part of this result.
- Docs of S7 live in oli/ of its branch, S8/S6 phone docs in oli/ and oli/docs/ (inconsistent locations); no code depends on them.
- Open, optional, NOT started (closed by decision): steady-state hour replay (large gain on quiet networks, high risk), phone memory/GC through chrome://inspect (diagnostic only, no game code change).
