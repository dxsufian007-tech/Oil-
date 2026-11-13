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

## Real-save validation (244 buildings, 234 pipes, 7,137 Central tiles)

Run with `SAVE=<realsave.json> node test-network-diag-real.js` (skipped without a save). Findings after calibration on the real save:
- 0 critical faults; the engine's own flags are reproduced one-to-one (65 pipes over pressure rating, 2 pipes over capacity).
- Pipes carry no fixed direction in the engine (an edge joins two ports; oil goes from the end that can send to the end that can take), so the diagnostic graph follows port roles, not the registered a->b order.
- Geometry-only findings (a drawn path across a building, a shared tile, a reversed registration) are MEDIUM warnings: the simulation follows the registered connection, so flow is unaffected.
- Central stations are hand-off points: they are terminals and sources, never dead ends or "no supply".

### NOT covered
- The Central Hybrid Network (segments, stations, central pumps, its tiles): flow past or inside the Central stations is not verified; it has its own system.
- There is no leak/loss model in the engine, so none is reported.
- Capacity/pressure checks mirror the last simulation solve (peak offered flow within a step is not recoverable from stored data).
- Unused optional ports are not reported.
