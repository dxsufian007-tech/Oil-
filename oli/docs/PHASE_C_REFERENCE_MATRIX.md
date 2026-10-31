# PHASE C REFERENCE MATRIX — Pipe construction

Sources and licences are the ones verified earlier from real clones (`LICENSE_MATRIX.md`, `REFERENCE_MATRIX.md`, `PHASE_B_REFERENCE_MATRIX.md`).
For Phase C the repositories were **not re-read**; only conclusions from that earlier reading were used. Commercial games are behaviour references from general knowledge, not from code.
**Result: CODE REUSED: none. CODE ADAPTED: none. Everything below was written originally in Oli's own structures (`core.js`, `v2.js`).**

| SOURCE | LICENSE | WHAT WE LEARNED | WHAT WE ADAPTED (idea only) | WHAT WE DID NOT COPY |
|---|---|---|---|---|
| Satisfactory (closed) | Proprietary | The placement/belt hologram says *why* it is red and where it will snap; the held object follows the hand | Reason text on the invalid pipe; a mark on the snapped connection; the pipe end glued to the finger | Any code, model, UI art, sound |
| Mini Motorways (closed) | Proprietary | One finger draws the road, big touch tolerance, instant preview, gentle feedback | Hold-drag-release with a touch area larger than the drawn point (`pickNode`, `PICK_PX`); no pixel-perfect aiming | Art, sound, animation |
| Cities: Skylines (closed) | Proprietary | Cost shown while dragging a road; snap to existing nodes; valid/invalid cannot be told by colour alone | Live cost bar while dragging; ✕ / ✓ marks and a translucent invalid ghost | Assets, UI |
| Factorio (closed) | Proprietary | Pipes carry the fluid state (flow, fullness); alert text points at the cause | Pipe panel status (NORMAL … BOTTLENECK) taken from the simulation; oil speed from real flow | Art, UI, sounds |
| OpenTTD (GPL v2) | GPL — **do not touch** | Cost preview while dragging track | Same idea only; no code was looked at for this phase | All code and graphics |
| twofactor/pogicity-demo | MIT (code), art excluded | Neighbour-mask joins for roads, depth by sort point | Oli already has its own piece/join drawing (`pipeGeom`, `drawPiece`); nothing new needed | Everything in `public/`, the road-segment scheme |
| openoasis-ai/oasis-builder | README "MIT", no LICENSE file → YELLOW | Hover preview redrawn only on cell change | Target re-ranking only when the finger enters another tile (already in `pipeDragMove`) | All code and sprites |
| phaserjs/examples | README: code MIT, assets not for commercial use | Pointer/camera API usage | Nothing new (Phase A is final) | Any asset |
| jjcapellan/Phaser3-ScrollingCamera | MIT | Single-pointer scroller with inertia | Nothing — the brief forbids inertia / lerp for the pipe end | Code |
| timmywil/panzoom | MIT | Pointer bookkeeping when the finger count changes | A second finger drops the pipe and starts a pinch (no stale pointer) | Code |

## Where each Phase C behaviour lives (all original)
| Behaviour | Where |
|---|---|
| Hold + drag + release (no tap-tap) | `v2.js` pointer controller (`PIPE_DRAG`), `tapPipe` now only explains |
| Connection points lit when the pipe tool is armed | `core.pipeStartPoints()` + scene `update` |
| Smart snap: distance + drag direction + validity + route feasibility | `v2.js magnetTarget` (Phase 1/2, kept) |
| Live cost, balance, "not enough cash" | `v2.js updateConfirm` (dragging branch) |
| Valid / invalid not by colour only | `drawPreview`, scene tip drawing (✓ / ✕, translucent ghost) |
| Pipe info status | `core.pipeStatus()` from `lineHyd` + warnings |
| Second finger | `v2.js` pointerdown: always drops the pipe, becomes a pinch |
