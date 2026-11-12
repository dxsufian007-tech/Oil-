# Phase B / B1 tools (tests only; no game file)
Original = `757fed1`. Put a copy of its `oli/` next to a path given as `ORIG_ROOT`; the new tree is `NEW_ROOT` (default: this repo's `oli/`).
- `fuzz.js [seeds]`: random networks, same operations on the ORIGINAL and the NEW `central.js`, every result bit-identical (paths, plans, usage, end() state).
- `edge.js`: capacity boundary (CAP - used around 1e-6, both sides) and channel names that are not one of the six.
  `CAP - used = 1e-6` exactly cannot occur: CAP = 300000 has ulp 2^-34 in [2^18, 2^19), and 1e-6 / 2^-34 = 17179.869... is not an integer, so `<=` and `<` are the same test for every reachable value.
- `identity-b1.js`: `ROOT=<oli dir> SCENE=real|scene HOURS=n TRACE=1` state SHA, flows, stock, exact cash and a hash of every toStation / _apply call. `SAVE=<file>` selects the save for `real`.
- `counters.js`: read-only counters (distinct (ch,from,to), would-be cache hit rate, invalidations).

## B2 (shadow only)
`central.js` has `pcMode` (0 = off, the default; 1 = shadow). In shadow mode `path()` still returns its own result; a cache keyed (channel, from, to) only watches and compares (`pcStats`).
- `fuzz2.js [seeds]`: ORIGINAL vs NEW with shadow on, random networks with faults, pump directions/faults, saturation, added segments/pumps/stations and taps; results bit-identical AND `pcStats.mismatch` must be 0. Mutants (skip the saturation test / the rev check / the begin() clear / the rev bump in setFault) must fail it.
- `identity-b1.js`: `PC=1` shadow on; `ACTIVE=1` TEST-ONLY experiment that answers plain path calls from the cache (production never does).
- `shadow-preload.js`: `node -r shadow-preload.js <test>` runs any existing test with shadow on.
