# S6 — Full Tank Probe Skip (branch perf/s6-full-tank-skip)

Switch: `Sim.fullTankSkip` (1 = on, 0 = old behaviour, immediate). Base: perf/s4-positive-probes b10bb03. Tree OFF. No merge, no APK.

## What changed
`Sim.probeDead` additionally returns "dead" when the far device is a single tank/gas (not in a tank group), keep>0 and
`cap*capacityMultiplier - vol - _pend <= 0` (accept() would return 0). Only omitted write: `s._off = max(_off, f.r)` (approved).
No change to production/economy/pressure/flow equations, capacities, limits.

## Save file difference (exact)
Only `state._off` of full single tanks is absent/older. Real save 48 h: 241/244 buildings identical; 3 tanks differ in `_off` only.
Net, economy, other store fields, building count identical. `_off` is read only by help text of pump/junction/separator/refinery, never tanks.

## Equality (Node, sandbox)
- Real save 240 h, `_off` of tanks normalised: 0 differing hours. Control without normalisation: differs (so `_off` is the only difference).
- 38 perturbation runs (pump fault/dir, channels, faults, tank full/empty, refinery limit, removal, additions, forced saturation), 572 h: 0 differing hours, 4,302 saturation events.

## Performance (Node, sandbox; NOT phone)
- Real save, 60 h x9 interleaved: 19.2 -> 18.2 ms/h (-5.2%), GC 37 -> 33 ms, heap 15 MB unchanged.
- Real save vs original engine (all switches 0): 24.9 -> 17.6 ms/h (-29.3%), GC 56 -> 35 ms.
- Synthetic M-5000: -11.8% (3 runs); C-1000 +5.0% and C-4000 -1.8% (9 runs) = noise (these scenes have few full tanks).

## Tests
`test-full-tank-skip.js` passes. Full suite 221 files: only the 13 known base failures + 2 load flakes (pass alone).
