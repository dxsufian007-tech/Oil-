# PHASE 1 — MAP / WORLD / TERRAIN / OIL FIELDS (branch `feature/map-oil-fields`, NOT merged)

Original implementation, isolated. **No shared game file is modified** (v2.js, core.js, camera/input, placement, pipes, hydraulics, network, pumps, tanks, economy, market, save/load, build-www.js, the game workflows). The map is reachable only through `world-preview.html` and the separate "Oli Map" preview APK.

Files: `worldmap.js` (model + pixel renderer), `world-preview.html` / `world-preview.js` (preview, own camera), `build-www-map.js`, `.github/workflows/map-apk.yml`, `.github/android/map-run.sh` + `map-android.js`, `test-world.js` (163 checks), `test-world-preview.js` (18 checks), `docs/map-preview/*.png`.

## WORLD SCALE (one scale for everything)
1 tile = **12 m**. World 1920 x 1280 tiles = 23.0 x 15.4 km = **199.5x** the current 140 x 88 map (1.7 x 1.1 km). 24 regions (6 x 4, A1..D6) of 320 x 320 tiles, 600 chunks of 64 x 64. Chunks are generated lazily from the seed (a bounded LRU keeps memory flat); nothing is drawn or stored for the whole world at full detail.

| Building | Footprint (tiles) | Look (height, tiles) | Note |
|---|---|---|---|
| well | 1x1 | derrick 2.2 | = core.js |
| pump / booster | 1x1 | pump jack 0.8 | = core.js |
| valve / junction | 1x1 | 0.4-0.5 | |
| pump station / pressure station | 2x2 | box 1.1 | |
| crude tank | 2x2 | cylinder 1.2 | = core.js |
| water storage | 2x2 | cylinder 1.0 | |
| crude storage | 3x3 | cylinder 1.6 | large tank |
| gas storage | 3x3 | sphere | |
| diesel / gasoline / product storage | 3x3 | cylinder 1.3-1.4 | |
| separation / processing | 4x3 / 3x3 | towers 1.8-2.0 | |
| refinery | **8x6** | towers up to 3.0 | needs a refinery zone |
| power / substation | 3x3 / 2x2 | stack 2.2 / box | |
| loading / export terminal | 3x2 / 5x3 | box | export: flat shore |
| maintenance, warehouse, security | 3x2, 3x2, 2x1 | box | |
| HQ / admin / lab | 4x3 / 3x2 / 3x3 | box 1.2-1.8 | |
| pipe | 0.18 tile wide | | |

Tests: well/tank/pump equal the numbers in `core.js`; well <= pump < tank < crude storage < separation < refinery; every storage type is bigger than a crude tank and far smaller than the refinery; a refinery is >= 6 tank footprints. The preview has a **Scale chart** that draws every building to its footprint and height side by side (`docs/map-preview/08-scale-chart.png`). Map icons (oil-field markers) are 10-22 px whatever the zoom, so they never cover the terrain.

## TERRAIN (6 types)
FLAT_DESERT, ROCKY_GROUND, ROCKY_PLATEAU, VALLEY, SAND_DUNES, WATER_WADI. Each has buildable, build-cost modifier, oil-probability modifier, max slope, elevation (0..1, level 0..7) and slope per tile; shown by colour and ground detail. Sampled share: flat 33%, rocky ground 22%, plateau 14%, valley 12%, dunes 11%, water/wadi 7%. Future transport effect is data only (`buildCost`, slope). Tiles are not lifted on screen (elevation shades the ground) so isometric picking stays exact.
**Industrial plains:** every region has two levelled, flat plains (radius ~30 tiles) held free of oil: the places where refineries, tank farms and hubs belong. Result: **every region has 2 refinery zones (28 x 18) and 3 tank farms (18 x 12)** with room to grow, plus a pipeline hub; 4 regions on the west coast have an export-terminal site; natural dirt tracks link zone -> fields and hub -> zone (future roads).

## OIL FIELDS
SMALL / MEDIUM / LARGE / MAJOR (radius 3-18 tiles). Per field: initial / remaining / estimated reserve (+error), pressure potential, quality (LOW/MEDIUM/HIGH), depth, terrain, geology score, discovery / survey / depletion state. Large-and-deep and small-and-shallow both occur; dry prospects (0.6 per field) look as promising as real fields and never become drillable. Probability = terrain modifier x region richness (POOR / MEDIUM / RICH) x basin noise x structure noise; rich regions hold ~2x the fields of poor ones; plains hold none. Seed 20260101: ~220 sites (about 100 small, 70 medium, 25 large, 1-4 major + ~120 dry holes).
States: UNDISCOVERED -> DISCOVERED -> SURVEYED -> DRILLABLE -> **PRODUCING** -> DEPLETED, strictly in order. `visibleInfo()` is the only thing a UI may show the player: nothing before discovery; a rough dashed area after (no size, type or depth); estimates with a range after survey; depth, pressure and a drilling cost **estimate (never charged)** when drillable; depletion % when producing. `WellLink.bind(well, field)` starts PRODUCING; `extract()` lowers the reserve and DEPLETES the field at 0.

## VISUAL SYSTEM
Warm industrial desert palette, no tile grid: `renderChunkRGBA(cx, cy, k)` interpolates colours between tile centres and shades from the interpolated elevation (hillshade), with per-terrain detail (dune ripples, plateau strata, rock speckle, scrub patches), smooth coast and wadi edges. A test measures that the colour change across a tile edge is not larger than inside a tile. Close level adds sparse rocks, ripples, tufts; overlays: regions, refinery zones, tank farms, hubs/export sites, tracks, fields by state (dashed "?" area, dashed blue survey ring, green drillable, orange producing, grey depleted, grey X dry hole), facility footprint probe, developer layers (hidden geology, oil odds). Screenshots: `docs/map-preview/`.

## PERFORMANCE / STREAMING
FAR (<0.2): one pre-composited 1600 x 800 overview image (z < 0.06) or 1 px/tile chunk images of the visible chunks; MEDIUM (0.2-0.6): 2 px/tile images; CLOSE (>=0.6): 3 px/tile images (cache of 70 / 36 chunks), built one per frame, nearest to the screen centre first; world generation runs in 8 ms slices in the background; no per-tile sprites. Desktop Chromium (software canvas, headless): frame draw 0.3-0.5 ms (FAR was 28 ms before the overview image), one close-up image 7-60 ms. Android emulator numbers: see the report (branch `map-android-test`); the emulator is software-rendered, so they are an upper bound, not a phone.

## INTERFACES (data only, the game does not call them)
`toLegacyWindow(ox,oy,w,h)` (arrays in the current game's terrain ids), `WellLink`, `canBuildAt`, `refineryZones`, `tankZones`, `strategicPoints`, `tracks`, `visibleInfo`, `progressSnapshot/restoreProgress`, `drillEstimate`, `levelForZoom`, `iso` (same formula as `tc()` in v2.js, tested).

### CONFLICT / WHY / PROPOSED INTERFACE
- CONFLICT: `core.js makeMap/makeTerrain/makeAreas` (140x88, 5 fixed regions, 4 terrain ids, `areas`). WHY: one game map vs a 200x chunked world. PROPOSED: `Game` option `{ world, window }` using `toLegacyWindow` for water / block / terrain and mapping `areas` from the sites inside the window. Not applied.
- CONFLICT: save/load. WHY: discovery state + remaining reserves must persist. PROPOSED: add `{ seed, progress: progressSnapshot(), extracted }` to `serialize()`.
- CONFLICT: economy (survey / drill / building costs). PROPOSED: economy actions call `world.survey()` / `makeDrillable()` after charging; `canBuildAt().costModifier` scales construction cost.
- CONFLICT: Phase A camera (own preview camera, zoom 0.0038-2). PROPOSED: reuse `levelForZoom` and the iso formula; the game camera keeps its own limits.
- CONFLICT: build-www.js / CI build only `main`. WHY: a branch APK needs its own build. DONE WITHOUT TOUCHING SHARED FILES: `build-www-map.js` + `map-apk.yml` build a separate app (Oli Map, `com.oli.mappreview`) that installs next to the game.
- CONFLICT: the master plan lists plateau / valley / wadi; core has SAND/FLAT/ROUGH/ROCK. PROPOSED: the adapter maps them (plateau -> ROCK, valley -> FLAT, dunes -> SAND, rocky ground -> ROUGH).

## REFERENCES / LICENSES
No code, art or data from games or from the supplied reference image; only the layout idea (spread of regions, scale, density) was taken from it. Value-noise / fBm / mulberry32 are standard published algorithms written here. No new dependency.

## KNOWN LIMITS
Preview only; the game still uses its 140x88 map. Layers OIL / PRESSURE / FLOW / TERRAIN are interface stubs. Wadi channels are not buildable (flood risk later). Real-device performance not measured. Phase 2 (buildings) not started.
