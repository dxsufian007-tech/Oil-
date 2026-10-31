# REFERENCE MATRIX — Oli

Scores are "relevance to Oli" out of 10. Open-source entries were read from real clones (see LICENSE_MATRIX.md for commits).
Commercial-game rows come from general knowledge of those games, not from code; they are UX/behaviour references only.

## Open-source references

### A. jjcapellan/Phaser3-ScrollingCamera
- **URL** https://github.com/jjcapellan/Phaser3-ScrollingCamera · **TYPE** Phaser camera plugin (TypeScript, one file `src/scrollcam.ts`, 642 lines) · **LICENSE** MIT
- **CODE REUSABLE?** Yes legally; practically **no**. **ASSETS REUSABLE?** n/a
- **WHAT WE LEARN** It tracks only `scene.input.activePointer`, so it is one finger by design. It scrolls a content rectangle with friction (`_inertia_frames`, speed < 1 stop), clamps to `_bounds`, and can snap to evenly spaced points (list/menu use).
- **WHAT WE CAN ADAPT** Nothing needed. Possible later: its friction-then-stop rule for an optional, off-by-default fling.
- **MUST NOT COPY** n/a (but there is no point copying: it cannot pinch, and it moves the camera with its own update loop, which is the "catch-up" feel the brief forbids).
- **OLI RELEVANCE** 2/10

### B. timmywil/panzoom
- **URL** https://github.com/timmywil/panzoom · **TYPE** DOM/CSS-transform pan-zoom library (TypeScript, `src/pointers.ts`, `src/panzoom.ts`) · **LICENSE** MIT
- **CODE REUSABLE?** Yes, but it is DOM-specific. **ASSETS** none
- **WHAT WE LEARN** `addPointer/removePointer` keep a list of live pointers; `getMiddle` and `getDistance` give the midpoint and the span; on every move `scale = start × distance / startDistance`, then `zoomToPoint(scale, midpoint)` keeps the point under the fingers. When the pointer count changes it re-takes `startDistance` (the "fresh snapshot" that prevents jumps).
- **WHAT WE CAN ADAPT** The re-snapshot on pointer-count change (Oli already does this in `startPinch`) and `getMiddle/getDistance` as an independent oracle in a unit test of Oli's pinch maths.
- **MUST NOT COPY** `zoomToPoint` (it works in CSS pixels of a parent element, with padding/border/transform-origin corrections that do not exist in Phaser). Do not add it as a dependency.
- **OLI RELEVANCE** 6/10 (confirms the existing design)

### C. twofactor/pogicity-demo
- **URL** https://github.com/twofactor/pogicity-demo · **TYPE** Next.js + Phaser isometric city builder (`MainScene.ts` 2,810 lines, `roadUtils.ts` 692) · **LICENSE** MIT (code) with asset exceptions
- **CODE REUSABLE?** Yes (code). **ASSETS REUSABLE?** **No**.
- **WHAT WE LEARN** Auto-connecting roads by a 4-bit neighbour mask (N/S/E/W) → segment type (dead-end, straight, corner, tee, cross) in `getRoadConnections` + `getSegmentType`; sprites anchored at bottom-centre; depth derived from a per-object sort point (`depthFromSortPoint`); wheel zoom handled inside Phaser for correct coordinates; pan = pointer delta / zoom.
- **WHAT WE CAN ADAPT** The mask → shape table as the single place that decides how a pipe tile (straight / corner / tee / cross junction / end cap) is drawn and as a test oracle; "sort point" naming for Oli's piece depth (`26 + c.y`).
- **MUST NOT COPY** Anything in `public/` (art, GIF characters), the 4×4 road-segment scheme (a city-road concept, not a pipe), the traffic/lane code.
- **OLI RELEVANCE** 5/10

### D. openoasis-ai/oasis-builder
- **URL** https://github.com/openoasis-ai/oasis-builder · **TYPE** Next.js + Phaser isometric map editor (`lib/city-builder-scene.ts`, 1,152 lines) · **LICENSE** README "MIT", no LICENSE file → YELLOW
- **CODE REUSABLE?** Not until a LICENSE file exists. **ASSETS** No (Kenney set referenced; third-party sprites in `public/`).
- **WHAT WE LEARN** Standard `gridToIso` / `isoToGrid`, hover preview tile under the pointer, place/remove by pointer, IndexedDB autosave, grid expansion.
- **WHAT WE CAN ADAPT** Ideas only: hover preview, autosave scheduling. Oli already has its own `tc()` / screen→tile and a ghost preview.
- **MUST NOT COPY** Code or sprites.
- **OLI RELEVANCE** 3/10

### E. phaserjs/examples
- **URL** https://github.com/phaserjs/examples · **TYPE** Phaser 3 example gallery · **LICENSE** README: code MIT; assets not commercially reusable
- **CODE REUSABLE?** Short snippets, with the README statement kept as evidence. **ASSETS** **No**.
- **WHAT WE LEARN** Correct use of `cameras.main` (`setBounds`, `centerOn`, zoom), pointer events, depth, containers, particles.
- **WHAT WE CAN ADAPT** API usage patterns only; Oli already covers camera/pointer.
- **MUST NOT COPY** Any asset (classic-game art, audio).
- **OLI RELEVANCE** 3/10

### F. atahan-git/UnityFactorySimulator
- **URL** https://github.com/atahan-git/UnityFactorySimulator · **TYPE** Unity C# tick-based factory logic (`FactorySystem.cs` 590 lines; `Tests/` 820 lines: Connector, Belts, Building, Position) · **LICENSE** MIT
- **CODE REUSABLE?** Legal but C#/Unity — reimplement. **ASSETS** none to use.
- **WHAT WE LEARN** Three object kinds — `Building` (input/output slots, positions), `Belt` (ordered item segments with insert/remove at the ends), `Connector` (lists of input/output belts and buildings). One `Update*` per kind, driven by a single tick, each moves at most what the next object can accept. Unit tests build tiny scenes (empty belt, full belt) and assert one transfer.
- **WHAT WE CAN ADAPT** The principle NODE → CONNECTOR → NODE with *capacity-limited transfer* and the test style "one tiny network, one assertion". Oli's graph (nodes = well/tank/pump/junction/open end, edges = pipe segments) already follows this; the lesson is to make connection points first-class (see §16 of the audit).
- **MUST NOT COPY** C# code, Unity rendering, item/recipe model (discrete items; Oli is continuous flow).
- **OLI RELEVANCE** 6/10

### G. volokin0/factory-sim-bottleneck
- **URL** https://github.com/volokin0/factory-sim-bottleneck · **TYPE** Python/SimPy discrete-event line (Cut→Drill→Deburr→Wash→Inspect→Pack) · **LICENSE** **none**
- **CODE REUSABLE?** **No.** **ASSETS** No.
- **WHAT WE LEARN** A bottleneck is proven with evidence: highest utilisation **and** longest queue wait upstream; finite buffers create blocking; KPIs = throughput, lead time, WIP, utilisation, queue wait; scenario comparison (baseline vs +1 capacity at the bottleneck).
- **WHAT WE CAN ADAPT** (as ideas) rank candidates by `util` **plus** upstream accumulation; "what-if upgrade" preview = re-solve with one pipe upgraded and report Δflow; dashboard KPIs.
- **MUST NOT COPY** All code, text and charts.
- **OLI RELEVANCE** 5/10

## Commercial games (behaviour only — no code, art, sound or UI artwork)

| NAME | TYPE | LICENSE | CODE/ASSETS | WHAT WE LEARN | WHAT WE CAN ADAPT (originally) | MUST NOT COPY | OLI /10 |
|---|---|---|---|---|---|---|---|
| Factorio | Factory sim | Proprietary | No / No | Throughput visible on the object itself; belts/pipes colour and animate by load; alert list with "click to jump"; ghost (planned) buildings; pipe fluid level shown per segment | Colour/animation of a pipe by utilisation; warning bar that jumps to the cause (Oli has it); planned-build ghost with cost | Art, UI skin, sounds, blueprint file format | 9 |
| Satisfactory | 3D factory | Proprietary | No / No | Placement hologram green/red with the *reason*; snap guides; per-object throughput tooltip; mouse-held drag to lay belts | Reason text on the red preview ("tank full", "pipe crosses pipe"); live throughput on tap | Models, UI art, audio | 7 |
| OpenTTD | Transport tycoon | GPL v2 | **Do not touch** | Cost shown while dragging a track; undo of the last build; company graphs; contracts/cargo payment depending on speed and time | Cost-while-dragging; one-step Undo (refund); small trend graphs of revenue | Any code or graphics | 8 |
| Cities: Skylines | City builder | Proprietary | No / No | Road tool: drag, live length and cost, snap to existing nodes, curve guidance; info-view overlays (a map mode per metric) | A "flow/pressure overlay" mode that recolours all pipes by one metric; draw-with-cost | Assets, UI | 7 |
| Transport Fever | Transport sim | Proprietary | No / No | Line planner with bottleneck highlighting; income per line | Per-line profit/throughput list sorted by problem | Assets | 5 |
| Anno | City/economy | Proprietary | No / No | Supply chains with explicit input/output rates; clear icon when a building is starved | Starved/blocked icons (Oli has PUMP_STARVED) generalised to wells/tanks | Assets | 5 |
| Mini Motorways | Casual mobile | Proprietary | No / No | One-finger drag draws the road, immediate preview, instant feedback, calm UI, gentle camera, pinch zoom | The *feel* of hold-drag-release building and zero-menu play | Art style, sounds | 8 |
| Other: Oil Tycoon-style mobile titles, Prison Architect (overlays), Frostpunk (pipe/heat) | Various | Proprietary | No / No | Resource overlays; clear risk/reward timing for selling | Sell-now-or-wait price forecast hint | All content | 4 |

## Where the brief is already satisfied in Oli (no external code needed)
Camera state machine (IDLE/PAN/PINCH/PIPE_DRAG/BUILDING_DRAG), pinch about the fingers' midpoint, hold-drag-release pipe building, scored magnetic snap (distance + drag direction + validity), orthogonal routing with ≤1 corner first, crossing refused (`crossPipe`) and touching refused (`pipeTouch`) so no accidental junctions, junction/open-end graph, utilisation levels, warnings from measured values, flow-driven oil animation. See `MASTER_REFERENCE_AUDIT.md` for evidence and gaps.
