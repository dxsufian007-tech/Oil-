# S6 phase 1 — real phone measurement (branch perf/s6-full-tank-skip)

## Device / conditions (measured, from the page itself)
Honor BRP-NX1, Android 16, 8 cores, 8 GB (rounded API value), Chrome/157 WebView **inside the Claude app** (not the game's WebView).
Save: the real save, 244 buildings. Page: perf-scale5000/make-phone-bench.js (engine only, no rendering, save read-only copy). Standard run: 40 h x 5 reps, 6 warm-up hours dropped, 3 configs interleaved.

## Results (ms per game hour)
| config | median of medians | mean | p95 | best | worst |
|---|---|---|---|---|---|
| S6, Sim.fullTankSkip=1 | 31.3 | 32.2 | 41.5 | 29.4 | 74.6 |
| S6, Sim.fullTankSkip=0 | 32.4 | 34.3 | 36.9 | 31.5 | 72.1 |
| original engine (all switches off) | 40.4 | 42.2 | 46.4 | 39.6 | 82.1 |
S6 on vs off: -3.4%. S6 vs original: -22.5%. (Quick run, 3 reps: -0.9% / -19.1%.)
Per-rep S6 medians 36.2 32.3 31.3 30.0 30.8: the first rep is slower (JIT warm-up of the first config); S6-off per-rep spread is tight (32.1-33.4).

## Headroom (budgets X1 780 / X2 390 / X5 156 ms per hour, frame share 0.78)
S6 median 31.3 ms/h -> X1 24.9x, X2 12.5x, X5 5.0x. Worst single hour 74.6 ms is still inside every budget.

## Phone vs Node (sandbox, same save)
| | Node | phone | ratio |
|---|---|---|---|
| S6 | 17.6 | 31.3 | 1.8x |
| original | 24.9 | 40.4 | 1.6x |
| S6 gain vs original | -29% | -22.5% | |
The old x16 estimate (295 ms/h) was ~9x too pessimistic; it must not be used.

## Not measured / limits
- GC time: not exposed to a web page. Worst hours (~2x the median) are probably GC, unproven.
- Memory: 149.7 MB is the whole page in the Claude WebView (3 configs x 5 reps keep parsed saves alive), not engine memory; not comparable. Chromium in the sandbox showed ~9.5 MB. Real engine memory needs the test APK in the game's WebView.
- Browser/WebView differs from the game's WebView; the game's own rendering load is not included.
