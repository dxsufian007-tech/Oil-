# NETWORK DIAGNOSTICS — فاحص الشبكة

A read-only inspector of the whole oil network. Files: `network-diag.js` (engine, no DOM), `diag-ui.js` (panel + map overlay), tests `test-network-diag.js` (49 checks, in `npm test`) and `test-network-diag-ui.js` (18 browser checks, run separately with playwright).
`industry.js`, `central.js`, `central-plan.js` and every simulation file are untouched; the inspector only reads.

## How the network is stored (what the inspector is built on)
- **Buildings**: `store.items` (id, def key `b.d`, x, y, rotation `b.r`, state `b.st`, simulation state `b.s`). Ports come from `buildings.js worldPoints(b)`: id, `role` (in / out / both), `product`, the cell and the access tile (`ax, ay`), `required`, `excl` (refused products).
- **Pipes**: `net.lines` (PipeNet). Each line: `a` / `b` = `{ b: building id, port }` (`b` may be null = an open pipe), `path` (tiles; the first and last are the ports' access tiles), `product`, `dia` (capacity / max pressure in `building-config.js PIPES`), `open` (false = closed valve). The simulation writes `flow`, `over`, `hiP`, `lowP`, `pressure` on each line and `_sat`, `_lowIn`, `_hiP`, `_in`, `_out` on `b.s`.
- **Graph the simulation uses** (rebuilt here independently): open lines whose two ends exist, plus directly docked facing ports with compatible role/product.
- The Central Hybrid Network (`net.central`) has its own system and is not scanned (the report says so).

## What is checked (all from the structures above)
| Code | Meaning | Severity | Basis |
|---|---|---|---|
| OPEN_END | pipe with a free end | critical (required port) / high | `line.a` or `line.b` null |
| MISSING_BUILDING / BAD_PORT | pipe names a deleted building / a port that does not exist | critical | store + port table |
| WRONG_POINT | registered port ≠ where the path ends | critical | path end vs port access tile |
| BROKEN_PATH, PATH_BLOCKED, TILE_SHARED, PORT_TWICE | geometry / port conflicts | critical | tiles, cell owners, port use |
| PRODUCT_MISMATCH, WRONG_DIRECTION | product refused by a port; line pushed out of an in-port / into an out-port | high | `compatible()` and port roles |
| DEAD_END | a well's oil cannot reach any tank / refinery; names the element where it stops and why (closed pipe, open pipe, closed/faulty valve, no outlet) | critical | graph reachability, per well |
| NO_SUPPLY, NO_INPUT, NO_OUTPUT, PUMP_DISCONNECTED, ISOLATED, BRANCH_NO_EXIT | processing buildings / pumps / manifolds without a working inlet or outlet | high–medium | graph + ports |
| OVER_CAPACITY, HIGH_PRESSURE, LOW_PRESSURE, ELEMENT_OVERLOAD | taken from the **engine's own results** | high–medium | `line.over/hiP/lowP`, `sim.warnings(b)` |
| NEAR_CAPACITY, TANK_FULL, CLOSED_LINE, VALVE_CLOSED, VALVE_PARTIAL, FACING_MISMATCH, SELF_LOOP, JUNCTION_USELESS, BLOCKED | **warnings** (state that needs review; may be intentional) | medium / low | flagged `confirmed: false` |

Every finding carries: number, type, severity, element + id, zone, coordinates, previous / next element in the flow, exact cause, effect (quantified from real well capacities where it can be), suggested fix, evidence, and `confirmed` (fact / engine result) vs warning.
Health % = elements (buildings + pipes) with no finding / elements checked.

## Not reported on purpose
- **Leaks / losses**: the simulation has no leak model, so none is invented.
- Optional unused ports are not reported (a refinery's unused product outlets, a tank's spare ports are normal).
- When the cause of an engine-reported `BLOCKED` well cannot be tied to a structural fault, the finding says the cause is not determined.

## Read-only guarantee and cost
Tests compare the full saved state (buildings, lines, flows, cash, sim dirty flag) before and after a scan. It runs only when the player taps «فحص الشبكة» / «إعادة الفحص». 4,032 elements: ~80 ms. Capacity / pressure checks use the last simulation solve; if the simulation is stale the report says so.

## Central network inspector (network-diag-central.js)

An independent read-only inspector for the Central Hybrid Network (stations, segments, central pumps, six channels). It reads `net.central` and the store, builds its own indexes (it does not even touch the net's caches) and never calls the planner, so flow and simulation results are untouched. `diag-ui.js` merges both reports into one numbered list with its own Central block and a filter (all / oil / Central); Central segments are drawn on the map (green = sound, coloured = fault) and a tap jumps to the segment, station or pump.

| Finding | Class | Basis |
|---|---|---|
| segment end station missing | CRITICAL, confirmed | structure |
| channel recorded as faulty | CRITICAL, confirmed | engine state |
| segment recorded faulty (per channel) | HIGH if no alternative path, MEDIUM if a loop carries the flow | engine state + graph |
| channel partitioned by faulty segments | HIGH, confirmed (names the faulty segments) | graph |
| pump faulty / no station / no segment / segment not touching its station | HIGH, confirmed | structure / state |
| station without building, building without station, damaged station, isolated station (with branches) | HIGH, confirmed | structure |
| trunk split into islands, channel closed, gap in the drawing, path across a building, near capacity, low suction pressure | warning | review needed |
| segment end away from its station, channel pressure above rating | indicator | no proven effect on flow |

Not reported because the engine does not model it: leaks / losses, and pressure per segment (the engine keeps pressure per channel only).

## Over capacity: instant offer vs sustained saturation

The engine raises `over` on a line inside `offer()` when the rate OFFERED to the pipe exceeds its room (`cap - flow`) - before water-filling shares the oil among receivers and also during probe calls - so the flag can be set while the committed flow is far below capacity. The inspector therefore reports `OVER_CAPACITY` (confirmed, HIGH) only when the flag AND at least 95% of the capacity in real flow agree; otherwise it is the indicator `OFFER_EXCEEDS` (instant offer) and shows how often it was seen across the scans of the session. On the real save PIPE-221/222 (stations #242/#244 to tank #243) carry 10,798 of 30,000 bbl/day (36%); over 48 simulated hours the flag was up only during the first 10 steps (the flow decaying from 10,708 to 9,255) and never again: a transient surge, not saturation.

## High pressure

`HIGH_PRESSURE` (engine flag `hiP`: pressure above the pipe rating) is an indicator, not a fault: it is counted apart, never lowers the health figure and is listed last. It becomes a finding to act on only once an effect on flow is shown.

## Repeatable real-save test

`oli/local-saves/` is git-ignored (so are `*realsave*.json`): put a personal save there and run `npm run test:realsave` (`SAVE=<path>` works too; `VERBOSE=1` prints every finding). Export: in the game page console `copy(localStorage.getItem('oli-lab-v2'))` and paste into `oli/local-saves/realsave.json`. The test asserts invariants that hold for any save (read-only, one indicator per engine flag, Central elements all counted, only structural / recorded-state findings confirmed), injects deliberate Central faults into the in-memory copy (the file is never written) and checks each is found at the right place. `test-network-diag-real.js` does the same in the real page with screenshots (`SAVE=... SHOTS=dir`).

## Real-save validation (244 buildings, 234 pipes, 7,137 Central tiles)

Run with `SAVE=<realsave.json> node test-network-diag-real.js` (skipped without a save). Findings after calibration on the real save:
- 0 critical faults; the engine's own flags are reproduced one-to-one (65 pipes over pressure rating, 2 pipes over capacity).
- Pipes carry no fixed direction in the engine (an edge joins two ports; oil goes from the end that can send to the end that can take), so the diagnostic graph follows port roles, not the registered a->b order.
- Geometry-only findings (a drawn path across a building, a shared tile, a reversed registration) are MEDIUM warnings: the simulation follows the registered connection, so flow is unaffected.
- Central stations are hand-off points: they are terminals and sources, never dead ends or "no supply".

### NOT covered
- Flow decisions inside the Central planner (routing, water-filling): only the structure, recorded faults and the engine's own channel figures are checked; the oil network scan does not follow oil through Central stations (they are hand-off points).
- There is no leak/loss model in the engine, so none is reported.
- Capacity/pressure checks mirror the last simulation solve (peak offered flow within a step is not recoverable from stored data).
- Unused optional ports are not reported.
