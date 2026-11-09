test-func-zones.js: the Phase 2 test (17 display-only zones over the OLD world). Kept for the record, NOT run.
Its still-valid checks were rewritten for the real sector world and run every time:
  1a-1c (17 sectors/codes)            -> test-sector-coverage.js  1a-1d
  2a regions, 2d reserve, 2e tiles, 2f oil probability -> test-sector-coverage.js 2a, 2d, 2e, 2f
  2c refinery/tank/track/strategic data -> test-sector-coverage.js 2c (the CODE of those four functions is byte-identical; their data moves because it avoids the new field places)
  2b site list identical               -> replaced on purpose by test-sector-counts.js (exactly 306 fields / 184 dry, per sector)
  3a-3f field <-> zone lookups         -> test-sector-coverage.js 3a-3e
  4a-4d tank farms / refinery zones     -> test-sector-coverage.js 4a-4c
  5a-5d C1 / starter region / reserve   -> test-sector-coverage.js 5a-5d
  6a-6d E1                             -> test-sector-coverage.js 6a-6d
  7a-7c F1 strip, slots, world size    -> test-sector-coverage.js 7a-7c
  8a-8c no overlap                     -> test-sector-coverage.js 8a-8b
  9a other seed, 10a external mode     -> test-sector-coverage.js 9a-9b, 10a
