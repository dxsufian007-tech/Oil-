# Oli — Phase 2: Buildings & Oil Industry

Branch `feature/building-system` (not merged to `main`). Files: `oli/building-config.js` (all numbers), `oli/buildings.js` (registry, placement, rotation, ports, save), `oli/industry.js` (ProductType pipelines + flow simulation), `oli/building-art.js` (drawings), `oli/building-lab.js` (mobile UI on the Phase 1 world).

## Architecture
- **Definition** (frozen, shared) + **Instance** `{id, d, x, y, r, st, c, t0, lv, s}`; `s` = dynamic state (volume, reserve, mode…), saved with the game.
- **Ports**: `{id, kind:'pipe', role in|out|both, cell, side, product, group, required}` rotated together with the footprint.
- **Products**: `CRUDE GASOLINE DIESEL JET_FUEL GAS WATER OTHER`. A port has a fixed product, or `*` (pump, valve, junction: product-transparent). `networkProducts()` walks the transparent devices and refuses any pipeline that would join two different fixed products → **INVALID PRODUCT CONNECTION**; nothing is built.
- **PipeNet**: explicit pipelines port→port `{product, dia, path}`; length = tiles×12 m, capacity / max pressure from the diameter table (8" 6,000 bbl/d · 16" 30,000 · 24" 90,000 · 36" 250,000; 1,500/3,000 psi). Lines never merge by touching and a crossing is refused (no route) — only a **Junction** merges/splits. Phase C pipes carry no product: `PipeNet.legacyView()` reads them as CRUDE.
- **Sim** (`industry.js`): wells and tanks are sources; pumps, valves, junctions, separators, refineries are pass-through; tanks are sinks. A source *offers* a flow `{rate, product, composition, pressure}`; the pipeline loses pressure by friction and limits the rate to its capacity; the device on the far side answers first as a probe, then as a commit, so back-pressure travels upstream (a full gasoline tank slows the refinery, which slows the crude tank …). One step = a fraction of a game day (1 day = 12 s); it only runs when buildings exist (≈0.08 ms per step for the full chain).
- **Placement** is one verdict (`validate`) for the ghost, the confirm step and `place()`: bounds, terrain/slope, overlap, safety zone (clearance), refinery zone, oil field state, port access tiles, product of any pipe on an access tile, cost.

## Formulas
`PressureOut = PressureIn + Boost × Efficiency` (pump) · `FlowOut ≤ MaxFlow` · `Fill% = Volume / Capacity × 100` · `Available = Capacity − Volume` · `Utilization = Throughput / Capacity × 100` ·
`ActualThroughput = min(InputOil, Capacity × level × operatingLimit, AvailableStorage of every connected product line)` · `Product = Throughput × Yield × Efficiency` (per 100 bbl: 45 gasoline / 30 diesel / 10 jet / 5 gas / 10 other) ·
`Efficiency = 0.95 × crudeQuality × temperature × pressure × utilization × maintenance × level` · pipe friction `tiles × 0.5 psi × (flow/capacity)^1.8 × 16/dia` · tank cost `base + capacity × costPerBarrel` · pump power `kW = 0.01269 × Q × boost / 1000 / eff`.

## Conflicts with existing systems (nothing was changed in them)
| # | CONFLICT | WHY | PROPOSED INTERFACE |
|---|---|---|---|
| 1 | The playable game (`core.js`, 140×88 map, hydraulics) is not the 1920×1280 Phase 1 world; the 13 buildings live in the Building System on the Phase 1 world, not inside `core.js` Game State | core.js knows only well/tank/pump/valve + crude pipes and has its own map | `BuildingStore` + `Sim` take a `TerrainSource`; `core.js` would feed them through `building-core-bridge.js` (read-only adapter, tested) |
| 2 | Core `pump` is a 1×1 in-line pump; Pump Station is 2×2 / 3×2 | different machines | keep both; the bridge reports the difference |
| 3 | Core tank has inlets on every side and no outlet; the registry tank has INPUT W/N and OUTPUT E/S | tanks must feed refineries | registry inputs ⊂ core inlets (tested); outputs are an extension |
| 4 | Phase 1 scale table lists a 3×3 "processing" building | not one of the 13 | left alone |
| 5 | core hydraulics has no ProductType | crude only | `legacyView` = CRUDE; the Sim computes product flow itself and never touches Phase C |

## Not in Phase 2 (by instruction)
Economy, market, contracts, taxes, loans, company management, salaries, profit/loss. Cost, operating and maintenance cost per day are configuration + display only; nothing is charged per day. Level architecture exists (`level` + four multipliers = 1), no upgrade system. No disasters: safety limits are warnings only.
