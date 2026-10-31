# Map / Oil Fields (parallel track, branch `feature/map-oil-fields`)

Isolated, original implementation. **No shared file is modified** (v2.js, core.js, camera/input, placement, pipes, hydraulics, network, pumps, tanks, economy, market, save/load are untouched). Nothing here is loaded by the game; it is reachable only through `world-preview.html`.

Files: `worldmap.js` (model), `world-preview.html` + `world-preview.js` (visual preview, own camera), `test-world.js` (96 checks), `test-world-preview.js` (15 checks), `docs/map-preview/*.png` (real screenshots).

## MAP ARCHITECTURE
World 1920 x 1280 tiles = **199.5x** the current 140 x 88 map. Chunks of 64 x 64 tiles (30 x 20 = 600). Regions of 5 x 5 chunks = 320 x 320 tiles (6 x 4 = 24, named A1..D6). Chunks are generated **lazily** from the seed and cached in a bounded LRU (160): reading one tile builds one chunk. Regions carry name, kind (desert plains, dune sea, rocky badlands, mountain belt, valley basin, coastal shelf...), richness (POOR / MEDIUM / RICH), starter flag, unlocked flag. Region C3 is the starter (MEDIUM). Isometric transform is identical to `tc()` in v2.js (checked by a test), so the world can later sit under the existing camera.
Zoom levels (`CONFIG.ZOOM`): FAR < 0.2 (world, regions, terrain), MEDIUM 0.2-0.6 (fields, zones, networks), CLOSE >= 0.6 (wells, pipes, buildings, ground detail). Min zoom 0.0038 fits the whole world on a phone.

## TERRAIN TYPES
FLAT_DESERT, SAND_DUNES, ROCKY_GROUND, ROCKY_RIDGE, LOW_VALLEY, WATER. Each has `buildable`, `buildCost` (modifier, stored only), `oilMod`, `maxSlope`, colour. Elevation 0..1 per tile, reported also as level 0..7; slope per tile. Measured share (seed 20260101, sampled): flat 28%, rocky ground 24%, ridge 16%, valley 14%, dunes 12%, water 5%. Tiles are **not** lifted on screen (elevation shades the ground), so isometric picking stays exact.

## OIL FIELD MODEL
Types SMALL / MEDIUM / LARGE / MAJOR (radius 3-18 tiles). Per field: `initialReserve`, `remainingReserve`, `estimatedReserve` (+ `estimateError`), `pressurePotential`, `quality` (LOW/MEDIUM/HIGH), `depth`, `terrainType`, `geologyScore`, region, state. Big-but-deep and small-but-shallow both exist. **Dry prospects** (about 0.6 per field) look as promising as real fields and never become drillable. Oil probability is a product of terrain modifier, region richness, a basin noise layer and a structure noise layer (valleys and rocky ground favour oil, ridges rarely hold it, but a basin or structure can override). Seed 20260101: 200 fields (110 small, 67 medium, 19 large, 4 major) + 120 dry holes; rich regions hold about 2x the fields of poor ones.

## DISCOVERY STATES
`UNDISCOVERED -> DISCOVERED -> SURVEYED -> DRILLABLE -> DEPLETED`, strictly in order (skipping and going back are refused; dry sites stop at SURVEYED; DEPLETED only when the reserve is 0). `visibleInfo(id)` is the only thing a UI may show the player: UNDISCOVERED = nothing; DISCOVERED = a rough dashed area that contains the field, no type/size/depth; SURVEYED = type, estimated reserve with a range, pressure class, quality, success probability; DRILLABLE = depth, pressure potential and a **drilling cost estimate (preview only, never charged)**. Survey and drill foundations are data + rules only; no economy hook exists.

## GENERATION
Terrain: fractal value noise (elevation, mountain belts, ridge lines, sand, rock patches, coastline). Sites: per region, from a region seed, rejection sampling weighted by geology, min gap between sites, no overlap (tested). Refinery zones: 24 x 16 tiles, flat, no ridge/valley/water, no field nearby, scored by flatness and expansion room (>30% free ring), up to 2 per region (every region has one). Facility rules (`CONFIG.FACILITIES`): footprint, max slope, terrain list, ports, `needsZone` (refinery). `canBuildAt(type,x,y)` returns ok/reason (water, slope, terrain, needsZone, outside) and cost modifier.

## SEED SYSTEM
`createWorld({seed})`, default 20260101. Same seed = identical terrain, fields, zones (tested); another seed differs. Discovery progress is separate state: `progressSnapshot()/restoreProgress()` (not wired to save/load).

## VISUAL SYSTEM
Preview: one 64x64 bitmap per chunk (hillshaded + noise), drawn through the iso affine transform with 1-tile overlap; generated in time slices (UI never blocks). Overlays: region borders/labels, refinery zones, oil sites by state (dashed "?" area, dashed blue survey ring, green drillable ring, grey depleted, grey X dry hole), original vector derrick glyph 10-22 px (never covers the map), CLOSE-only ground detail (rocks, dune arcs, reeds, pebbles, waves), facility footprint probe to scale, developer layers (hidden geology, oil odds heat map). Screenshots in `docs/map-preview/`. Layers: NORMAL implemented; OIL / PRESSURE / FLOW / TERRAIN are interface stubs (`LAYERS`).

## PERFORMANCE
No thousands of sprites: chunk bitmaps + a handful of vector overlays. Desktop Chromium (software canvas, headless): chunk generation about 8-12 ms each, frame draw 0.2 ms MEDIUM, 0.5 ms CLOSE, **about 28 ms FAR** (600 chunk bitmaps drawn with smoothing; a pre-composited overview would fix it - listed as future work). Whole-world load in the preview: 600 chunks built in the background in a few seconds. Android: not measured here.

## INTERFACES (data only, game does not call them)
`toLegacyWindow(ox,oy,w,h)` -> `{water, block, terrain}` arrays in the legacy ids (so a 140x88 slice could feed the current Game); `WellLink.bind/fieldOf/extract` (well -> field, reduces `remainingReserve`, depletes); `canBuildAt`, `refineryZones`, `resourceZone`, `visibleInfo`, `drillEstimate`, `progressSnapshot/restoreProgress`.

### CONFLICT / WHY / PROPOSED INTERFACE
- CONFLICT: `core.js makeMap/makeTerrain/makeAreas` (140x88, fixed 5 regions, 4 terrain ids, `areas` with kind/quality/remaining). WHY: the game needs one map; this world is 200x and chunked. PROPOSED INTERFACE: `Game` opts `{ world, window:{ox,oy} }` calling `toLegacyWindow` for water/block/terrain and mapping `areas` from the sites inside the window (`oilFieldAt`). Not applied.
- CONFLICT: save/load. WHY: discovery state and `remainingReserve` must persist. PROPOSED INTERFACE: store `{seed, progress: progressSnapshot(), reserves}` in `serialize()`; reserves are derivable (`initialReserve - extracted`).
- CONFLICT: economy/survey/drill cost. WHY: `drillEstimate` is a preview number. PROPOSED INTERFACE: `world.survey(id)` / `makeDrillable(id)` called by a future economy action after it charges money.
- CONFLICT: Phase A camera (zoom range 0.0038-2 here, own preview camera). PROPOSED INTERFACE: reuse `levelForZoom` and the same iso formula; the game camera decides its own limits.
- CONFLICT: build-www.js/CI build only `main`. WHY: a feature-branch APK needs a shared-file change. PROPOSED: none until approval.

## REFERENCES / LICENSES
No code, art or data copied from games or from the supplied reference image; the image only informed the layout idea (region spread, scale, density). Value-noise / fBm and mulberry32 are standard published algorithms written from scratch in this repo. No third-party code added, no new dependencies.

## FUTURE EXTENSIONS
Overview bitmap for FAR; OIL/PRESSURE/FLOW/TERRAIN layers; survey/drill actions and costs; integration through `toLegacyWindow` window streaming; flooding in valleys; coast/ports; refinery placement with product tanks and export; Android monotonic offline hooks.
