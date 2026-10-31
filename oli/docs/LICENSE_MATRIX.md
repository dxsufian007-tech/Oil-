# LICENSE MATRIX — Oli (commercial mobile game)

Checked on 2026-10-31 by reading the actual `LICENSE` files and READMEs of shallow clones (commit in the SOURCE column).
Open source does **not** automatically mean commercially reusable: the code licence and the asset licence are separate columns.
Nothing below has been copied into Oli. Status colours: **GREEN** = code may be reused under its licence (with notice) · **YELLOW** = study/reference only unless separately reviewed · **RED** = do not copy code or assets.

| SOURCE | LICENSE | CODE STATUS | ASSET STATUS | COMMERCIAL USE | ACTION |
|---|---|---|---|---|---|
| jjcapellan/Phaser3-ScrollingCamera `306230c` (2023-12-26) | MIT (LICENSE file, © 2019-2020 J. J. Capellán) | GREEN | none used (demo images only) | Yes, keep notice | Study only. Single-pointer list scroller with inertia and snap points; no pinch. Nothing needed in Oli. |
| timmywil/panzoom `ca8217f` (2026-09-02) | MIT (MIT-License.txt, © 2016-2019 T. Willison) | GREEN | none | Yes, keep notice | Reference for pointer bookkeeping and pinch maths (`pointers.ts`). Oli already has an equivalent; do not add the dependency (it is DOM/CSS-transform based). |
| twofactor/pogicity-demo `e7c6928` (2026-01-06) | MIT (code) + README exceptions | GREEN (code only) | **RED**: art is "for learning, demos, prototyping", some from commercial packs; characters proprietary | Code yes; assets **no** | Study `roadUtils.ts` bitmask auto-connect and the depth-from-sort-point idea. Never copy anything from `public/`. |
| openoasis-ai/oasis-builder `d24d1fc` (2026-02-07) | README says MIT, **no LICENSE file in the repository** | YELLOW | YELLOW: README credits Kenney City Kit; `public/` holds third-party sprites | Unclear until a LICENSE file exists | Reference only (grid↔iso formulas are textbook). Do not copy files. |
| phaserjs/examples `eb87db8` (2026-10-26) | README: source code MIT; **no LICENSE file in the checkout** | GREEN for short snippets (keep the README statement as evidence) | **RED**: README says assets come from classic games / stock art and cannot be used in commercial games or games carrying ads | Code snippets yes; assets **no** | Use as API usage reference (camera, pointer events). Never use its assets. |
| atahan-git/UnityFactorySimulator `2379e69` (2021-05-06) | MIT (LICENSE, © 2021 A. Öztürk) | GREEN but C#/Unity | GIF in README only | Yes, keep notice | Reimplement the NODE→CONNECTOR→NODE idea and the unit-test style in JS. No code paste (different language and engine). |
| volokin0/factory-sim-bottleneck `a8fc200` (2026-01-04) | **No licence of any kind** (no LICENSE file, none in README) | **RED** (all rights reserved by default) | RED (PNG/CSV outputs) | **No** | Ideas only (utilisation + queue-wait ⇒ bottleneck "with evidence", scenario comparison, KPI list). Do not copy code, text or charts. |
| rexrainbow/phaser3-rex-notes (camera pan/pinch method) | MIT (© 2018 Rex) | GREEN — **already credited** in `THIRD_PARTY_NOTICES.md` | none used | Yes | Keep. Nothing new to add. |
| Phaser 3.80.1 (engine, `phaser.min.js`) | MIT | GREEN | n/a | Yes | Already shipped. Keep the licence text with the app. |
| Capacitor 8.x (`@capacitor/*`) | MIT | GREEN | n/a | Yes | Already shipped. |
| Factorio | Proprietary | RED | RED | No | Study behaviour only (belt/pipe readability, blueprints/ghosts, alert panel). |
| Satisfactory | Proprietary | RED | RED | No | Study behaviour only (building hologram, snapping, throughput overlay). |
| OpenTTD | GPL v2 (code); graphics/sound separate (OpenGFX etc., GPL/CC) | **RED for Oli** (GPL is not auto-integrated) | RED | No | Study economy/UX concepts only. No code. |
| Cities: Skylines / Transport Fever / Anno / Mini Motorways | Proprietary | RED | RED | No | Study behaviour only (road drawing preview, cost-while-dragging, overlays). |

## Rules adopted for Phase 3
1. No GPL/LGPL/AGPL code enters Oli. No source without a licence file enters Oli.
2. Any code taken from a GREEN source must be the smallest function, rewritten in Oli's style, listed in `THIRD_PARTY_NOTICES.md` with repo, file, commit and licence text, and covered by a test.
3. No art, sound or font from any reference. Oli's own art (`art.js` pump etc.) and the fonts already in `fonts/` stay the only assets; each added asset needs its licence recorded.
4. A repository that says "MIT" only in its README (oasis-builder, phaserjs/examples) is treated as YELLOW for anything larger than a few lines until a LICENSE file is found.
