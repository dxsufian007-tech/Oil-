# OLI MASTER REFERENCE AUDIT

Status: **research + audit only. No game code was changed.** Date 2026-10-31. Companion files: `REFERENCE_MATRIX.md`, `LICENSE_MATRIX.md`.
Method: the seven open-source references were cloned read-only and their licence files, README terms and the relevant source files were read; Oli's own files were inspected (`core.js` 2,335 lines, `v2.js` 830, `game.js` 2,489 legacy, `art.js`, `v2.css`, tests, Android workflow). Commercial games are used for behaviour only.

## 1. CURRENT ARCHITECTURE (KEEP / REFACTOR / REPLACE / ADD / DO NOT TOUCH)

| Area | What exists today (verified) | Verdict |
|---|---|---|
| CAMERA | `v2.js` Touch Controller: one explicit state machine `TOUCH = IDLE, PAN, PINCH, PIPE_DRAG, BUILDING_DRAG`; pan `scroll -= Δfinger/zoom`; pinch zoom about the fingers' midpoint with a fresh snapshot on every finger-count change; clamped to map; no tween/lerp. Method credited to rex (MIT) in `THIRD_PARTY_NOTICES.md`. Android emulator: 19/19 touch tests. | **DO NOT TOUCH** (only add tests for items 14–15 below if missing) |
| INPUT | One pipeline (Phaser pointers) with a test that lists every listener on the page; DOM listeners only for HTML buttons/panels, `contextmenu`/`dblclick` suppressed. | **KEEP** |
| PIPE SYSTEM | Hold-drag-release building from a building/pipe/open end; `routeNodes` (A→B, L-shapes first, then detour), `buildLine`, branch from a pipe tile (`J<tile>`), open ends `E<tile>`, branch deletion keeps the rest. Pipes follow grid axes; main/sub pipe types. | **KEEP**, extend preview (cost/reason) |
| SMART SNAP | `CFG.SNAP_NORMAL 56`, `SNAP_STRONG 28`, hysteresis `KEEP 1.3`, score = distance/SNAP + DIR_WEIGHT × (1 − cos(angle drag vs direction)), invalid targets do not attract. | **KEEP** |
| BUILDING | `canPlace` with reasons (OUT_OF_BOUNDS, OCCUPIED, OVERLAPPING, RESTRICTED_AREA, TERRAIN, RULE), footprints, one-gesture placement (touch → ghost, release → build), move building, pump placed *on* a pipe (`hadPipe`). | **KEEP** |
| NETWORK | Logical graph rebuilt by `rebuildNetwork`: nodes (building / junction / open end), edges (pipe segments with tiles), `graphNode`, `branchOf`, consistency checker ("junction has only N links", orphans, duplicates). | **KEEP**, make connection points explicit (§16) |
| HYDRAULICS | `hydSolve`/`routeFlow`: head/pressure per tile, capacity, loss, pump curve H(Q)=H0−kQ², valve loss K, tank back-pressure. Phase 2 tests: 23 groups + 4 final groups, Android 11/11. | **DO NOT TOUCH** |
| PUMP / VALVE / TANK | Pump states OFF/STARTING/RUNNING/OVERLOAD/STARVED/STOPPED; valve OPEN/PARTIAL/CLOSED; tank back-pressure and fill. New pump art verified flange-to-pipe. | **DO NOT TOUCH** |
| UI | Panels per object (rows from simulation values), warnings bar (tap → jumps to cause), build menu, settings, Arabic/English. HUD money + sell. No dashboard, no undo, no cost-while-dragging. | **ADD** dashboard, **REFACTOR** `v2.js` into modules |
| SAVE/LOAD | `serialize/load` including pump/valve state, `hadPipe`, pipes; round-trip tests. | **KEEP** (version-tag migrations when the model grows) |
| ECONOMY / MARKET | Price with events (DEMAND_SURGE, SUPPLY_SHOCK…), contracts, competitors, AI every 5 s, costs. | **DO NOT TOUCH**; only add decision UI |
| ANDROID | Capacitor 8 WebView, CI builds `Oli.apk` (branch `apk-build`) and runs the emulator suites (pipe 18, touch 19, phase2 11). | **KEEP**; add a real-device checklist |
| LEGACY | `game.js` (2,489 lines), `index.html`, `game.js.orig`, ~45 legacy `test-p*` files still in `oli/`. | **REPLACE/RETIRE** (§14) |

## 2. BEST CAMERA SOURCE
Oli's own controller (already built on rex's PanScroll/PinchZoom method, MIT). Cross-check with panzoom's `getMiddle/getDistance` (MIT) in a unit test. ScrollingCamera is not suitable: one pointer only, own update loop with inertia.

## 3. BEST ISOMETRIC SOURCE
Oli's `tc(x,y) = ((x−y)·32, (x+y+1)·16)` (2:1) is already correct and tested. For concepts: pogicity's bottom-centre sprite anchor and per-object *sort point* depth. No code needed.

## 4. BEST BUILDING SOURCE
Oli's `canPlace` + ghost (reasons per failure). Behaviour reference: Satisfactory hologram (green/red with the reason), Mini Motorways (one-gesture feel).

## 5. BEST PIPE/ROUTING REFERENCE
Behaviour: Cities: Skylines road tool (live length + cost while dragging, snap to nodes) and Factorio (pipe fluid readability). Code: pogicity's neighbour-mask → shape table (4-bit N/S/E/W) as a shape oracle for corner/tee/cross tiles. Oli's router (≤1 corner, detour on blocked) stays.

## 6. BEST NETWORK REFERENCE
UnityFactorySimulator (MIT): Building / Belt / Connector + one tick + capacity-limited transfer + tiny-scene unit tests. Principle only; Oli's graph and solver remain authoritative.

## 7. BEST BOTTLENECK REFERENCE
factory-sim-bottleneck (no licence → ideas only): utilisation + upstream queue as evidence, finite buffers cause blocking, scenario comparison. Oli equivalent: `util = flow/capacity` plus upstream accumulation and "what if I upgrade this pipe" preview.

## 8. BEST ECONOMY REFERENCES
OpenTTD (cost shown before committing, one-step undo, income depends on delivery time, graphs), Factorio (rates shown per second/minute), tycoon games (risk/reward timing). Behaviour only; OpenTTD is GPL.

## 9. BEST UI REFERENCES
Factorio alert panel + production stats, Cities: Skylines info-views (one metric recolours the whole map), Mini Motorways (calm, minimal HUD).

## 10. CODE WE CAN LEGALLY REUSE (smallest components, with notice)
| SOURCE REPO | SOURCE FILE | FUNCTION | PURPOSE | LICENSE | HOW TO ADAPT | TARGET OLI FILE | DEPENDENCIES | TEST REQUIREMENTS |
|---|---|---|---|---|---|---|---|---|
| timmywil/panzoom | `src/pointers.ts` | `getMiddle`, `getDistance` (≈25 lines) | independent oracle for pinch midpoint/span | MIT | Rewrite 2 helpers in JS inside the **test** only; production pinch stays | `test-v2-touch.js` (new check) | none | midpoint and span equal Oli's `startPinch` values for random finger pairs |
| twofactor/pogicity-demo | `app/components/game/roadUtils.ts` | `getRoadConnections` + `getSegmentType` (bitmask → shape) | single table deciding pipe tile shape (end/straight/corner/tee/cross) | MIT (code only) | Re-implement with pipe-tile neighbours (incl. buildings/pumps as links); keep Oli's current drawing as fallback until equal | new `oli/netshape.js` or section in `v2.js` | `core.js` graph | shape of every tile equals the current drawing for all saved test layouts; junction at 3 and 4 links |
| atahan-git/UnityFactorySimulator | `Tests/ConnectorTester.cs`, `BeltsTester.cs` | test pattern | "tiny network, one assertion" tests per connection kind | MIT | Rewrite as Node tests (no code paste) | `test-network-conn.js` (new) | `core.js` | one test per connection pair in the PIPE tests list |
| phaserjs/examples | `public/src/camera/*` | API usage | none needed | MIT (README) | none | — | — | — |
All other references: **no code**. Every adopted function is added to `THIRD_PARTY_NOTICES.md` (repo, file, commit, licence text) in the same commit.

## 11. CODE WE MUST NOT COPY
OpenTTD (GPL v2); factory-sim-bottleneck (no licence); oasis-builder (no LICENSE file); any proprietary game; pogicity's `MainScene.ts` (large, city-specific); panzoom's `zoomToPoint` (DOM-specific); any "MIT in README only" repository beyond a few lines.

## 12. ASSETS WE MUST NOT COPY
Everything in pogicity `public/` (incl. proprietary characters), oasis-builder `public/` (Kenney and others), all phaserjs/examples assets, all commercial game art/UI/sound, OpenGFX/OpenTTD graphics. Oli keeps only its own pump/well/tank art and the fonts already licensed in `fonts/`.

## 13. GAMEPLAY IDEAS TO REIMPLEMENT (originally)
1. Build preview shows **cost, length, and the reason** when red (Satisfactory/Skylines).
2. One-step **Undo** with refund after a build/upgrade/valve change; later redo (OpenTTD).
3. **Pipe overlay modes**: Flow / Pressure / Utilisation recolour all pipes (Skylines info-views, Factorio).
4. **Alert bar** already jumps to the cause; add severity order and "why / what to do" line.
5. **What-if upgrade**: tap a bottleneck → "upgrade pipe: +X bbl/min, cost $Y" computed by re-solving (bottleneck study idea).
6. **Sell now / wait / upgrade / expand** panel: price vs 10-min trend, tank fill, projected revenue.
7. Small **dashboard** (§19) readable on a phone; trend sparkline for revenue.
8. Feedback triple for every action: **what happened · why · what next**.

## 14. CURRENT OLI WEAKNESSES (found by inspection, not guessed)
1. **Two front-ends in one repo**: legacy `game.js`/`index.html` (+ `game.js.orig`) and `v2.*`; ~45 legacy `test-p*` files. Tests still point at old paths: this very session found `test-v2-*.js` loading a stale copy at `/home/claude/oli` (fixed). Risk of testing the wrong build.
2. `v2.js` is one 830-line file (very long lines); UI, input, rendering and panels share one scope.
3. No explicit **connection points** in the model: pump direction `dir` and "tiles around a building" are computed ad hoc by `routeNodes`; valve is a tile flag. Works, but not queryable (`node.ports[]`).
4. Bottleneck levels are 4 (normal/busy/high/bottleneck); the brief wants NEAR_LIMIT and BLOCKED. BLOCKED today is spread over valve-closed/tank-full/starved warnings, not one status.
5. No undo/redo, no planning mode, no cost-while-dragging, no dashboard.
6. Crossing is *refused* (`crossPipe`), which is safe but means the player cannot cross a pipe at all (no bridge/underpass piece).
7. Performance numbers exist only from an emulator with a software GPU (median frame 50–83 ms); nothing measured on a real phone.
8. Real-device behaviour (touch size, pump art connection on a real screen) **not tested**.
9. `art.js` is a single base64 line (hard to review; fine for runtime).

## 15. REQUIRED REFACTORING
- Retire legacy front-end and old tests into `tests-retired/` (folder already exists) after confirming `v2` covers them; make every test resolve paths with `__dirname`.
- Split `v2.js` into `input.js` (Touch Controller), `build.js` (tools/preview), `panels.js`, `hud.js`, `render.js` (no behaviour change; checked by the existing UI suites).
- Add `ports` to the network model (read-only view first) without changing the solver.

## 16. RECOMMENDED ARCHITECTURE (no competing systems)
- **One Camera/Input**: existing Touch Controller. **One iso system**: `tc()` + `w2s`. **One placement system**: `canPlace` + ghost + `placeAt/placeRelease`. **One router**: `routeNodes`/`buildLine`. **One model**: the graph; **one simulation**: `hydSolve`. **One save**: `serialize/load`.
- **Connection points in the model** (derived, then authoritative for validation):
  - Well: `OUT`; Tank: `IN`; Pump: `IN`,`OUT` (from `dir`); Valve: `IN`,`OUT` (axis of its tile); Junction: `N ports`; Pipe edge: `START`,`END` = its two node ids.
  - `Port { node, kind: in|out|any, tile, dir }`; the router asks `canConnect(portA, portB)` instead of per-case ifs; the snap scorer filters on it.
- **Edge record** (already mostly present): `startNode, endNode, length, diameter(type), capacity, resistance(loss/K), currentFlow, pressureIn, pressureOut, util, status`.
- **Bottleneck status** (derived each solve from measured values): `NORMAL <60%`, `BUSY 60–80`, `NEAR_LIMIT 80–95`, `BOTTLENECK >95 and the edge limits the flow`, `BLOCKED` = measured flow 0 with a cause (`VALVE_CLOSED`, `TANK_FULL`, `NO_SOURCE`, `DEAD_END`). Mapping from today's 4 levels is 1-to-1 (`high` → `NEAR_LIMIT`), so saved games and tests stay valid.
- **Planning/Undo**: a command log of whole-game snapshots is too big; use command objects (`place`, `buildLine`, `removeBranch`, `setValve`, `upgrade`) each with `do()` and `undo()` that call the existing core functions and restore cash. Undo depth 10. Preview = dry-run of the same command (`canPlace`/`routeNodes` already return cost and reasons without mutating).
- **Dashboard** reads only from `game.net` and `game.s` (no new numbers).

## 17. IMPLEMENTATION ORDER (each phase ends with an APK checkpoint)
| PHASE | FILES TO MODIFY | FILES TO CREATE | DEPENDENCIES | RISKS | TESTS | EXPECTED RESULT | APK CHECKPOINT |
|---|---|---|---|---|---|---|---|
| **A Camera/Input foundation** | `test-v2-touch.js`, `touch-android.js` | pinch-oracle test (§10) | none | regression of the stable camera | camera tests 1–16; rapid finger changes; large finger | camera proven unchanged + 2 new tests; **no code change** unless a test fails | emulator touch 19+/19+ |
| **B Building placement** | `v2.js` ghost/preview, `core.js` reasons only | `docs/` notes | A | touching placement rules | placement reasons; move; pump on pipe | red-ghost shows the reason + cost | emulator suite |
| **C Pipe construction** | `v2.js` preview, `core.js` (`ports` read-only view) | `test-network-conn.js` | A,B | breaking save compatibility | tests 17–27 | every connection pair explicit; crossing ≠ connection; cost shown while dragging | emulator pipe 18+ |
| **D Smart Snap + routing** | `v2.js` scorer uses `canConnect` | — | C | snap flicker | tests 28–30; snap at edge | invalid targets never attract; score unchanged for valid ones | emulator pipe+touch |
| **E Network visualization** | `v2.js` render | overlay modes (flow/pressure/util) | C | frame time on phones | oil speed ∝ flow; zero flow = still | one-tap overlay colours; pooled particles | emulator + frame-time log |
| **F Bottleneck/KPI** | `core.js` status mapping (derived only) | `test-phase3-kpi.js` | E | changing saved numbers | tests 33–44 | 5 statuses from measured values; what-if upgrade Δflow | emulator phase suite |
| **G Dashboard/UI** | `v2.js`, `v2.css`, `v2-lang.js` | `dashboard` section | F | clutter on small screens | UI test at 360×640 and 412×866 | Production, Total flow, Storage, Avg pressure, Utilisation, Bottleneck, Price, Revenue | emulator |
| **H Planning + Undo** | `core.js` command wrappers | `test-undo.js` | B,C | refund/economy drift | tests 31–32; undo of every command; save/load after undo | preview→cost→confirm, undo/redo | emulator |
| **I Game feel** | `v2.js` | — | all | scope creep | visual checks, no new physics | feedback for select/snap/build/error/money | emulator |
| **J Performance + Android** | build, workflow | real-device checklist | all | only emulator available to me | frame time, memory, 30-min soak | measured numbers; **real device needs the owner** | emulator + the owner's phone |

Order rule: A first (prove stability), then C before B's preview text because ports feed validation; D only after C. Nothing starts before approval.

## 18. TEST PLAN
- **Camera (1–16)**: left/right/up/down, slow/fast drag, bounds, zoom in/out, pinch centred / near edge, pan→pinch, pinch→pan, rapid finger changes, large finger, Android. Existing: 18 browser + 19 Android touch tests; add oracle check and "three fingers".
- **Pipe (17–32)**: well→pipe, pipe→pipe, pipe→tank, pipe→pump, pump→pipe, pipe→valve, valve→pipe, branch, junction, crossing without connection, invalid target, snap, release near target, cancel, undo, redo.
- **Network (33–44)**: one/multiple wells, branch, multiple tanks, pump restriction, valve closed, capacity reached, tank full, bottleneck, blocked network, save/load, Android.
- Every phase: `npm test` (core) + UI (WebGL and `?canvas`) + Android emulator suites + APK build; report WEB / EMULATOR / REAL DEVICE / APK separately.

## 19. ANDROID PLAN
CI already builds the APK and runs the emulator on every push. Add: per-phase suite file (`phaseN-android.js`), frame-time log, a one-page **real-device checklist** (pinch, pipe drag, pump tap, panel buttons, 10-minute run, battery/heat) for the owner to run. I can never mark REAL DEVICE as PASS; it stays NOT TESTED until the owner reports.

Dashboard concept (mobile): top strip = money + price arrow; tap opens a card with 8 tiles — Production (bbl/min), Total flow, Storage % (all tanks), Avg pressure, Network utilisation (flow-weighted), Worst bottleneck (tap → jumps), Market price vs trend, Revenue (last 10 min). Source: `game.net` / `game.s` only.

## 20. RISKS
1. Scope: A–J is large; do one phase per approval.
2. Breaking the stable camera or the proven Phase 2 hydraulics (mitigated: DO NOT TOUCH list + full regression each phase).
3. Licence mistakes (mitigated: LICENSE_MATRIX rules; nothing copied so far).
4. Emulator ≠ phone (software GPU, frame times 50–83 ms; touch size).
5. Refactoring `v2.js` while adding features (do the split as its own step with no behaviour change).
6. Undo vs economy/market randomness (undo restores cash only for the action, not market events).
7. Crossing pipes: if the design later wants bridges, that is a new piece type + graph rule, not a tweak.

**RECOMMENDATION: DO NOT IMPLEMENT YET — wait for approval.**
