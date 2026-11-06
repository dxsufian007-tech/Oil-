# OLI — Performance test plan (HONOR X9d) — phase 0/1, measurement only
APK: **OliPerf.apk** (separate app "Oli Perf", id com.oli.oilperf — does not touch your real game or its save; saving is switched off while the test runs).

## Before you start
1. Charge to >80%, plug nothing in (or note it), close other apps, screen auto-lock = never, brightness fixed.
2. Disable battery saver / performance-limit modes. Same room temperature each time.
3. Open Oli Perf. Wait until the map shows. A purple **PERF** button is bottom-left.

## Run
1. Tap **PERF** → type the phone temperature (°C, from any battery app) in "بداية".
2. Tap **▶ السيناريو الكامل** (~24 min) — do not touch the screen. The panel can stay open or closed.
   (Tap **⚡ اختبار سريع** first if you only want a 3-minute check that everything works.)
3. If you SEE a stutter at any time, tap **📍 علّم تقطيعاً الآن** (the marker stores the phase, time, FPS, memory, map position).
4. At the end type the end temperature in "نهاية", tap **⬆ تصدير النتائج** → the share sheet opens → send the 2 files (oli-perf-*.json and .txt) to me (Drive / WhatsApp / email).
   If sharing fails, the summary text is copied to the clipboard and shown at the bottom of the panel.

## What the scenario does (all automatic)
| Phase | Scene state | Speed | Length |
|---|---|---|---|
| A | no pumping | ×1 | 90 s |
| B | one pump | ×1 | 90 s |
| C | 4 pumps + central pump 200k | ×1 | 120 s |
| D | same | ×5 | 120 s |
| E | same | ×10 | 120 s |
| F | same + automatic pan/zoom | ×1 | 120 s |
| G | same + automatic pan/zoom | ×10 | 120 s |
| H | same, camera still, 10 minutes (memory-leak check) | ×5 | 600 s |
| I | repeat of C (compare with C = effect of heat) | ×1 | 90 s |

Scene: ~190 buildings, ~170 tanks, 20 wells, 4 regular pumps, 1 central pump, ~110–140 pipelines.

## What is measured per phase
FPS, frame time avg/P50/P95/P99/max, % frames over 33 ms / 50 / 100, map draw time and its parts (terrain, decoration, overlays, pipes, buildings), economy/pipe simulation time per second, UI time (cards, HUD, save), DOM changes, long tasks, JS heap (start/end/min/max), GC events, allocation rate, counts (DOM nodes, sprites, tiles), resolution (dpr) changes, a per-second timeline, and for every slow frame the likely cause (draw / simulation / UI / GC / other = GPU-compositor-OS).

## Not measurable from inside the game (state them yourself)
GPU load, CPU %, real temperature — use Android Studio Profiler / `adb shell dumpsys gfxinfo com.oli.oilperf` / `dumpsys battery` if available, or just write the temperature in the panel.
