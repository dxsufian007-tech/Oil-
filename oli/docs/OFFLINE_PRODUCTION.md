# OFFLINE PRODUCTION — design, policy, integration point

**Status: module + tests written and isolated. NOT wired into the game** (wiring touches `v2.js`/`build-www.js`, shared with Phase C; it needs approval).
Files: `offline.js` (new, pure), `test-offline.js` (new, 12 groups, chained into `npm test`). `core.js`, hydraulics, network, economy: **unchanged**.

## Model
The app never runs while closed. On save / background it stores `game.serialize()` **and** a timestamp record (`offline`). On the next launch / resume the host loads the game, then calls
`OliOffline.resume(game, savedMeta, clock)`. That computes the credited seconds and runs the **existing** `Game.step` forward with a fixed step schedule. All production, pipe-capacity, pump,
valve, tank-room, well-decline and cost rules are the ones in `core.js`, because `core.js` does the stepping. No background service, no network.

## Determinism
Same saved state + same elapsed seconds = same result (tested: byte-identical `serialize()`).
* step schedule depends only on `sec`: 1 s steps for the first 10 min, then 15 s steps (24 h = 6,320 steps ≈ 0.3 s on this machine);
* the game's random source (`game.rng`) is swapped for a seeded generator (seed = f(game time, sec)) during the catch-up and restored afterwards — random events are replaced by one deterministic sample;
* no clock is read inside `advance()`; the host passes the clock in.
Accuracy: 15 s steps vs 1 s steps differ by < 0.6 % for one hour of production (same random numbers); offline vs the live loop: 0.11 % (same random numbers).

## Time policy (clock manipulation)
| Rule | Value |
|---|---|
| credited time | `now − savedAt`, never negative |
| cap per resume | `MAX_OFFLINE_SEC` = 24 h (configurable) |
| shorter gaps | < 5 s are left to the live loop |
| clock set back | credits 0; the highest wall time ever seen (`maxSeen`) is kept, so back-and-forward cannot be counted twice |
| same timestamp resumed twice | second resume credits 0 |
| monotonic clock | if the host supplies `mono` (Android `SystemClock.elapsedRealtime`, not affected by the wall clock) and `bootId`, and the boot id is unchanged, the monotonic difference is used instead of the wall clock |
Limits that remain: without a monotonic source, moving the wall clock **forward** can still buy up to 24 h per launch. Android's `elapsedRealtime` needs a small Capacitor plugin (not added: new dependency, needs approval).

## Existing rules you will see offline (not changed)
* A full tank stops its wells (tested: tank stays at capacity, next hour delivers 0).
* A closed valve delivers nothing (tested: 0.000000 bbl in 6 h).
* A pump never delivers above its maximum (tested).
* **Wells wear out while producing** (pressure falls, condition drops). With an unlimited tank, 24 h offline gave only 2,073 bbl of a possible 34,052 because the well's pressure reached 0 % — exactly what 24 h of live play would do. This is the current game design; whether an offline period should wear wells at the same rate is a **decision for you** (see below).

## Integration point (proposal; needs approval, touches shared files)
1. `v2.js save()` (line ~26): store `offline: OliOffline.wrapSave(game, prevMeta, clock)` next to `game`; call on `visibilitychange` (already), `pagehide`, and Capacitor `App.addListener('appStateChange')`.
2. `v2.js` boot (right after `game.load(d.game)`, line ~17): `const r = OliOffline.resume(game, d.offline, clock)`; show a "while you were away" summary from `r.report` (oil delivered, cash, elapsed, capped?).
3. `build-www.js` + `v2.html`: ship and load `offline.js` before `v2.js`.
4. Future refinery: `OliOffline.register('refinery', { step(game, dt, ctx) { ... } })`. The same registry is run after every offline step and can be driven by the live loop with `tickSystems(game, d)`, so a refinery behaves identically online and offline.

## Open decisions
* Should wells wear at full rate while the app is closed, or at a reduced "idle" rate? (changes core behaviour → not done)
* Cap 24 h vs longer; whether contracts/deadlines advance offline (they do now, because they use game time).
* Add the Android monotonic-clock plugin?
