# Oli — development notes

## Camera / Touch (v33) — STABLE, do not rebuild

Status on a real phone (owner's test, 2026-10-31): "almost good". The controller is considered stable.
Small observations recorded here, **not** changed:

1. **Max zoom is 1.8** (`Z_MAX` in `v2.js`). A first draft of the request mentioned testing zoom 2.0; it was kept at 1.8 so the look of the game does not change.
2. **No edge scroll during a pipe drag** (by request: the camera never moves in PIPE_DRAG / BUILDING_DRAG). A target outside the screen is reached by zooming out first, or by building in segments from an open end.
3. **Tap threshold is 12 CSS px** (`TAP_PX`). The map already moves from the first pixel; a touch that moved less than 12 px in total and was never pinched counts as a tap.
4. **Moving a building needs it to be selected first** (tap, then drag). A drag that starts on a building that is not selected pans the map.
5. **A 2nd finger during a drag**: before the first finger moved → the drag is cancelled and becomes a PINCH; after it moved → ignored.
6. **Emulator frame rate is not representative** (software GPU, ~12 fps). Feel can only be judged on a phone.
7. **Android pinch measurement**: against the finger positions the app receives, the midpoint drift is 0.000 px; against the points the test sent, ~3 px — that offset comes from where the test takes its reference point while the 2nd finger lands, not from the controller.
8. **Logcat "Error injecting safe area CSS"** comes from Capacitor, not from Oli's code.

Method source: rex CameraController (MIT) — see `THIRD_PARTY_NOTICES.md`.

## Repository layout (since v34)

- `/oli` is the real project: game (`core.js` simulation, `v2.*` Phaser front-end), tests, Capacitor Android project.
- The APK is built by `.github/workflows/build-apk.yml` straight from `/oli` (no zip any more).
- `.github/workflows/android-test.yml` + `.github/android/*` run the APK on an Android 14 emulator (pipe tests + touch/camera tests).

Left exactly as they were in the move (candidates for a later cleanup, not done now):
- `oli/.github/workflows/android.yml` — an old workflow inside the project folder; GitHub ignores it (only the root `.github` counts).
- Old files: `game.js`, `game.js.orig`, `index.html`, `style.css` (the pre-Phaser version), `*.bak.js`, `*-dbg.js` tests, `tests-retired/`.
- `build-apk.yml` still copies `.github/signing/debug.keystore` to `~/.android/`; the APK is actually signed by `signingConfigs.oli` in `oli/android/app/build.gradle` (`oli-debug.keystore`), and CI checks that certificate.

## Phase 2 — advanced hydraulics & control (v35)

Everything below is computed by the one solver in `core.js`; the UI only reads it (`pumpHyd`, `valveHyd`, `lineHyd`, `game.warnings`). The network is re-solved only on a change (`hy.dirty`) or every `SOLVE_DT` = 0.2 s, never per render frame; pump/line states and warnings are refreshed after each solve (or every `STATE_DT` = 0.5 s).

**Units** — flow bbl/min (converted with `BBL_MIN` to m³/s inside the physics), pressure bar (`BAR` = 1e5 Pa), head m, ρ = 850 kg/m³, g = 9.81 m/s², power kW, cost $.
Pump curve per level: `H(Q) = H0 − k·Q²` [m], `k = H0 / Qmax²` (so H(Qmax) = 0), `ΔP = ρ·g·H` [Pa] → bar, `H0 = H0_BAR·1e5 / (ρ·g)`. Test "Units" checks `ρ·g·H0 = H0_BAR`. Boost = ΔP(Q) × spin (0..1, spin-up). Power `kW = ΔP·Q / efficiency`, cost `kW × OPEX.pumpKwMin ($/kW/min) × time`. The pump boost is a pressure *source* inside the solver: with the pump OFF it is 0 and the downstream pressure/flow fall (test 1–3 and the full scenario).

**Pump states** (`pumpStep`, measured quantities only):
| state | condition |
|---|---|
| OFF | switched off by the player, or still being built — boost 0, 0 kW |
| STARTING | on, oil flowing (> 0.05 bbl/min), rotor speed < 97% |
| RUNNING | on, oil flowing, speed ≥ 97%, flow < 98% of Qmax |
| OVERLOAD | oil flowing at ≥ 98% of Qmax (head ≈ 0, flow capped by the pump) |
| STARVED | on, no flow, a tank *with room* is reachable around the pump, and no working well supplies it (or it was in use and the oil stopped) — nothing to pump, 0 kW |
| STOPPED | on, no flow, and nothing explains it by missing oil: tanks full / outlet cut off by a closed valve |

**Valves**: OPEN / PARTIAL / CLOSED. PARTIAL is real: the solver already uses a loss coefficient `K = 0.2 + 30·((1−o)/o)²` with the animated opening `o` (VALVE_POS 1 / 0.35 / 0), so flow drops (test 19: 29.9 → 17.5 bbl/min). CLOSED cuts the network (`vblock`): flow through it is exactly 0, the part behind it is shut-in (static pressure of the reservoir), the tank side shows its back-pressure, the tank stops growing and the well stops producing.

**Pipe utilisation** = actual flow / capacity: < 60% normal, 60–80% busy, 80–95% high, > 95% bottleneck — stored on each line (`L.util`, `L.status`) in the game state. Without a pump a small pipe is often *pressure*-limited (high, not bottleneck, and the well warns LOW PRESSURE); adding a pump lifts the flow until the pipe's own capacity is the limit (BOTTLENECK) — the player's fix is a bigger pipe, a second path, a pump, or the valve.

**Warnings** (`game.warnings`, each from a simulation condition): BOTTLENECK (line util > 95%), HIGH_PRESSURE (a pipe above `WARN.P_HIGH` = 30 bar — above the strongest reservoir, 24 bar, so only a pump can cause it), LOW_PRESSURE (pressure-limited well delivering < `LOW_FLOW` = 60% of its potential), PUMP_STARVED (state above), TANK_BACKPRESSURE (tank ≥ `TANK_FILL` = 80% full while a pressure-limited well feeds it; back-pressure there is 6.1 bar), VALVE_CLOSED (a closed valve that cuts a producing well off from storage).

**Save/Load**: pump `enabled`, `level`, `dir`, `runTime`, `costTotal`; valve states (existing `valves`). State is re-derived after load.

**UI**: pump tool in the build menu; tap a pump → status, flow, pressure in/out, boost, head, operating cost + on/off, flip, upgrade; tap a pipe → flow, capacity, utilisation, pressure in/out/loss + add valve / open / partial / closed / upgrade pipe; warnings bar (tap → opens the thing). The panel DOM is only rewritten when its text changes (it used to be rewritten 4×/s, which could drop a finger that was pressing a button).

**Known limitations**: no valve opening slider (three discrete positions); pump has no separate "cavitation" model; HIGH PRESSURE cannot occur without a pump by design; emulator frame rate is not representative.

### Pump picture (v35) — inline pipeline pump

Source: the pump image supplied by the project owner (white background; used only as the source, the in-game sprite is transparent). Not a third-party asset.
How it was made (visual only; no Core / physics / network / save change):
- Background removed (flood fill from the border + soft alpha edge, colour de-contaminated), so the sprite has a transparent background and a soft ground shadow.
- **The source picture is not geometrically consistent**: its pump flanges lie on an axis of slope ≈0.16 while the pipes on its two sides lie on slope ≈0.33. The game's pipes are 2:1 (slope 0.5). The sprite is built on the axis through the *centres of the pump's own flanges*, sheared vertically (verticals stay vertical) so that axis is exactly 2:1, and cut with two planes parallel to the tile edge (u = X + 2Y = const) at the outer faces of the two end flanges. Raised parts (motor, gauge, handwheel) are kept whole.
- `ART.pump` = `{ w, h, px, py, x, y }`: 2x texture, `(px, py)` is the point of the pipe axis in the middle of the pump. In `placeSprite` the sprite origin is that point, placed on the pump's tile centre — the same point the pipe pieces on both sides pass through — and shown at half size. `y` is the mirror image (pipe along the map's y axis). Depth is above the pipe pieces on both sides, so the pump covers them and the pipe continues out of its flanges.
- Pump length ≈ 2.7 tiles along the pipe, pipe diameter inside it ≈ a branch pipe; the flanges (a little wider than a main pipe) hide the join to a main pipe.
- Check: `test-v2-pump-art.js` + `check-pump-art.py` build main/branch pipes along x and y (and a flipped pump), screenshot at 2 zooms and verify no ground-coloured gap on the axis within ±2.2 tiles of the pump.
- Not possible / not done: a pump cannot be dragged (like wells and tanks it has no move tool in the Core; it is removed and placed again); flipping the direction does not mirror the picture (the picture is symmetric enough along the axis; direction is shown in the panel).
