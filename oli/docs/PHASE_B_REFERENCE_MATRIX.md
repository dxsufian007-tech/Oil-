# PHASE B REFERENCE MATRIX — Building Placement

Sources were read from real clones (commits in LICENSE_MATRIX.md). **No code was copied from any of them.** "REFERENCE" = idea studied and re-implemented originally in Oli's own structures. The matrix was completed after reading the sources and before the Phase B tests/APK; the code was written in the same session (the order "matrix first" was followed for the decisions, not for the file timestamp).

| FEATURE | SOURCE (file, function) | LICENSE | REUSE / REFERENCE | OLI IMPLEMENTATION |
|---|---|---|---|---|
| Hover preview only redraws when the grid cell changes | Oasis Builder `lib/city-builder-scene.ts` `updateHoverPreview` (compares `lastHoverGridX/Y`) | README "MIT", **no LICENSE file** → YELLOW | REFERENCE ONLY (idea) | `placeAt` returns early when the preview tile is unchanged; ghost + footprint are rebuilt only on a tile change |
| Footprint drawn as one diamond per covered cell, preview sprite centred on the footprint | Oasis Builder `updateHoverPreview` (loop over `footprint.width/height`, `gridToIso`) | YELLOW | REFERENCE ONLY | `drawPlacement(pl)` draws one diamond per cell of `game.placement().cells` (the real occupancy), green / yellow (cannot afford) / red |
| `gridToIso` / `isoToGrid` | Oasis Builder `gridToIso`, `isoToGrid`; Pogicity iso math | YELLOW / MIT | REFERENCE ONLY (textbook 2:1) | Oli's existing `tc()` and `toTile()` (already tested in Phase A); not replaced |
| Sprite anchored at bottom-centre of the footprint so it does not "float" | Pogicity README + `MainScene.ts` (origin at front corner) | MIT (code) | REFERENCE ONLY | existing `placeSprite` origins from `ART` (`px`,`py`); unchanged |
| Depth from a sort point (`sortY * mult + sortX`) | Pogicity `MainScene.depthFromSortPoint` | MIT (code) | REFERENCE ONLY | Oli's piece depth (`10 + y + …`, pipes `26 + c.y`) kept; ghost uses the same `placeSprite` so it sorts like the final building |
| Orientation-dependent footprint | Pogicity `getBuildingFootprint(building, orientation)` | MIT (code) | REFERENCE ONLY | `rotationOf(b)` (0/90/180/270 from the pump facing) and `connectionPoints(type,x,y,dir)` turn with the facing; footprints of well/tank/pump are symmetric so they do not change |
| Collision tint on the preview (red) | Pogicity `MainScene` `preview.setTint(0xff0000)` | MIT (code) | REFERENCE ONLY | existing ghost tint (green / red) kept, plus yellow for "valid but not enough money" |
| Pan / pointer handling for the scene | Phaser examples `camera/*` | MIT (README; no LICENSE file) | REFERENCE ONLY | not needed: Phase A controller is final |
| Placement hologram with a reason when red | Satisfactory | closed | UX REFERENCE ONLY | the confirm bar shows the exact reason (`touchesPipe`, `occupied`, `water`, …) |
| Cost shown before committing | Factorio / OpenTTD | closed / GPL | UX REFERENCE ONLY | confirm bar: COST · BALANCE ← AFTER BUILD; nothing is charged until the build |
| One-gesture drag-and-drop building | Mini Motorways | closed | UX REFERENCE ONLY | existing touch → drag → release = build (Phase A state machine) |
| Magnetic snap with validity + compatibility | (own design; idea of scored targets from Phase 1 pipe snap) | original | ORIGINAL | `snapPlacement`: score = distance − 0.35 bonus for touching an open pipe end; invalid tiles never attract; hysteresis `PLACE_KEEP` |
| Connection points in the model | UnityFactorySimulator `Connector` (input/output lists) | MIT | REFERENCE ONLY (C#) | `connectionPoints()`, `buildingModel()`, `valvePorts()`, `junctionPorts()` in `core.js` (read-only) |

Result: **CODE REUSED: none. CODE ADAPTED: none (ideas only). CODE WRITTEN ORIGINALLY: everything.** No new entry is needed in `THIRD_PARTY_NOTICES.md`.
