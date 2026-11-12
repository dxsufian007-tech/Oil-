# Phase A tools (measurement only)

Game files changed: `oli/live-diag.js` only (everything else under `oli/docs/phaseA/`).

- `identity-central.js` (+ `scene-central.js`): wrappers on/off give the same state, bit for bit (central network + wells on real fields, 24 h atomic + 24 h sliced; modes off, count, t1, t2all, mid = installed and removed in the middle of an open hour).
- `wrap-edge.js`: `this`, missing/extra arguments, return values, exceptions, generator next/return/throw, originals restored.
- `anatomy-e2e.js`: the two tests end to end on the central scene, driven like the live game. `browser-anatomy.js`: the same in the real page (`THR=16 N=10000` emulates a compute-bound phone).
- `overhead-browser.js`, `overhead-node.js`: wrapper overhead with many paired random-order blocks.
- `export-test.js`, `assemble-save.js`: save export in a secure and an insecure origin, parts, SHA-256 check, reassembly.
