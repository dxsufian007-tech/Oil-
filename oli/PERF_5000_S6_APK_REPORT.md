# S6 phase 1b — in-app bench APK (game WebView), real save, Honor BRP-NX1 / Android 16
APK: com.oli.olibench (separate app, same signing key 3f5e9242...b1aaf), versionCode 102, bench-s6-f2b3108, sha256 c0146806c9b8a343f0c0d46e1cab71056a03a0f9e29c5e5142b8a2c21635798a.
Real save (244 buildings) chosen by file picker, stored only in the bench app; the game and its save untouched. 40 h x 3 reps, fresh page per run, interleaved.

| config | median ms/h | mean | p95 | best | worst |
|---|---|---|---|---|---|
| S6 fullTankSkip=1 | 32.8 | 34.9 | 42.1 | 30.6 | 74.1 |
| S6 fullTankSkip=0 | 34.5 | 38.2 | 51.4 | 32.1 | 125.5 |
| original | 42.8 | 44.4 | 54.6 | 40.1 | 88.5 |
S6 on vs off -4.9%; S6 vs original -23.4% (earlier Chrome-in-Claude run: -3.4% / -22.5%; Node: -5.2% / -29%). Three independent runs agree: S6 ~ -3..-5% on this save.

Paced at the game tick (250 ms), 15 s per speed, hours simulated in one go per tick:
| speed | S6 on | S6 off | original |  (tick mean/max ms, CPU busy %)
| X1 | 109.6 / 115, 11.0% | 110.2 / 116, 11.0% | 115.6 / 139, 11.6% |
| X2 | 94.0 / 123, 18.8% | 94.8 / 134, 19.0% | 70.5 / 125, 14.1% |
| X5 | 75.4 / 128, 30.1% | 79.3 / 126, 31.7% | 79.4 / 123, 31.7% |
All hours produced on time (15/15, 30/30, 75/75), timer lateness mean <=0.7 ms, max <=4.7 ms.

## Reading
- With idle gaps between ticks an hour costs 70-110 ms instead of 33 ms: the phone CPU governor lowers the clock when load is light. Paced numbers therefore cannot rank the configs (X2 original looks faster than S6: governor noise, not engine). Use the unpaced table for comparisons.
- Even so, the engine takes 11% / 19% / 30% of the time at X1 / X2 / X5 in the worst (low-clock) state; the game's live loop slices an hour into ~20 ms budgets, this bench did not.
- NOT measured: engine memory and GC. This WebView reports a constant 9.5 MB heap (quantised), so heap/GC-drop columns are meaningless; GC time is not exposed to a page. Real values need a profile (Android Studio / chrome://inspect) or a native hook.
