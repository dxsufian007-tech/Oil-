# Test policy
- Every test file is its own process and must finish in **120 s** at most. Over the limit it is killed and recorded as **TIMEOUT (undecided)**. Nothing longer is ever run; a big test is split into independent files, never shortened.
- Run everything: `NODE_PATH=/opt/npm-tools/node_modules node tools/run-tests.js --jobs=2 --out=/tmp/res.json` (`--list=node|pw`, `--only=a.js,b.js`). The runner writes `<out>.txt` line by line (PASS/FAIL/TIMEOUT, seconds), so a caller polls the file in short checks instead of sleeping long.
- Jobs = number of CPU cores (2 here). More browsers than cores only measures the machine.
- Split files: `test-v2-phaseA-*` (was one 217 s file: same checks, the 40-round fuzz is shared over 8 files with different seeds), `test-perf-panel-1..3` (the 9 real-time phases shared over 3 files via `PERF_PHASES`).
