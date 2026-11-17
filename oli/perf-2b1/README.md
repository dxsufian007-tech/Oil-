2b-1 (dependency tracking, SHADOW ONLY) - measurement scripts. `SAVE=<save.json> node <script> <gameDir> [hours]`.
- dep72.js: shadow on vs off, hour by hour, counts valid / mismatch.  dep-audit.js: write-coverage audit (a probe-read field changed without its stamp).
- dep-scen.js: faults / pump direction / channel close / tank full+empty / refinery throttle injected every hour.  dep-save.js: save/load identical with the shadow on.  bench-h.js: ms per game hour (Node).
Tests of the repo run the shadow with OLI_DEP_SHADOW=1 (prints DEPSHADOW totals at exit).
