/* Oli - OFFLINE PRODUCTION (isolated module; nothing in core.js / hydraulics / network is changed or bypassed).

   Idea: the app is never "running" while it is closed. When it is saved / sent to the background it stores the simulation state AND a timestamp.
   On the next launch / resume it asks THIS module how much time passed, runs the existing simulation (Game.step) forward for that time with fixed
   steps, and goes on. Every production, pipe, pump, valve and tank rule is the one in core.js, because core.js does the stepping.

   Determinism: same saved state + same elapsed seconds = same result.
   - fixed step schedule that depends only on `sec` (never on the device speed or frame rate)
   - the game's random source (game.rng) is replaced by a seeded generator while advancing (seed = f(game time, sec)) and restored afterwards
   - no Date.now / performance.now inside advance(); the clock is read once, by the caller, and passed in

   Time policy (see docs/OFFLINE_PRODUCTION.md):
   - credited time = now - savedAt, never negative, never more than MAX_OFFLINE_SEC (24 h) per resume
   - the highest wall-clock value ever seen (`maxSeen`) is kept: setting the clock back and forward again cannot be credited twice
   - if the platform can give a monotonic clock + a boot id (Android SystemClock.elapsedRealtime, via a tiny plugin), `mono`/`bootId` are stored and,
     when the boot id is unchanged, the monotonic difference is used instead of the wall clock (the player cannot move it)
   - the same timestamp resumed twice credits nothing the second time

   Extension point for later systems (refinery, ...): register(name, { step(game, dt, ctx) }). Registered systems run after every Game.step,
   in registration order, in the offline loop and (when the host calls tickSystems) in the normal loop - one architecture for both. */
(function (root) {
  'use strict';
  const POLICY = {
    MAX_OFFLINE_SEC: 24 * 3600,   // longest span credited in one resume
    MIN_OFFLINE_SEC: 5,           // shorter gaps are not worth a catch-up (the normal loop handles them)
    DT_FINE: 1,                   // seconds per step for the first FINE_WINDOW seconds
    FINE_WINDOW: 600,
    DT_COARSE: 15,                // seconds per step afterwards (measured: <0.6 % away from 1 s steps for production over an hour)
    EVENTS_KEEP: 30               // game.events / log are trimmed to this many entries after a catch-up
  };

  const systems = [];
  function register(name, sys) { if (!sys || typeof sys.step !== 'function') throw new Error('system needs step(game, dt, ctx)'); const i = systems.findIndex(s => s.name === name); const e = { name, step: sys.step.bind(sys) }; if (i >= 0) systems[i] = e; else systems.push(e); }
  function unregister(name) { const i = systems.findIndex(s => s.name === name); if (i >= 0) systems.splice(i, 1); }
  function tickSystems(game, dt, ctx) { for (const s of systems) s.step(game, dt, ctx || { offline: false }); }

  // a small seeded generator (mulberry32); same seed -> same sequence
  function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const seedFor = (game, sec) => (Math.floor(game.s.time * 1000) * 2654435761 + Math.round(sec) * 40503) >>> 0;

  /* the step schedule for `sec` seconds: [{ dt, n }...]; the sum is exactly `sec` */
  function schedule(sec, P = POLICY) {
    const out = []; let left = sec;
    const fine = Math.min(left, P.FINE_WINDOW), nf = Math.floor(fine / P.DT_FINE); if (nf) out.push({ dt: P.DT_FINE, n: nf }); left -= nf * P.DT_FINE;
    const nc = Math.floor(left / P.DT_COARSE); if (nc) out.push({ dt: P.DT_COARSE, n: nc }); left -= nc * P.DT_COARSE;
    if (left > 1e-9) out.push({ dt: left, n: 1 });
    return out;
  }

  /* how many seconds may be credited. meta = { savedAt, maxSeen, mono, bootId } from the last save; clock = { now, mono, bootId } from the host. */
  function computeElapsed(meta, clock, P = POLICY) {
    const now = clock.now;
    if (!meta || !isFinite(meta.savedAt)) return { sec: 0, raw: 0, capped: false, rewound: false, source: 'none' };
    let raw, source;
    if (meta.bootId != null && meta.bootId === clock.bootId && isFinite(meta.mono) && isFinite(clock.mono) && clock.mono >= meta.mono) { raw = (clock.mono - meta.mono) / 1000; source = 'monotonic'; }
    else { const base = Math.max(meta.savedAt, isFinite(meta.maxSeen) ? meta.maxSeen : -Infinity); raw = (now - base) / 1000; source = 'wall'; }
    const rewound = raw < 0; if (rewound || !isFinite(raw)) raw = 0;
    const capped = raw > P.MAX_OFFLINE_SEC, sec = Math.min(raw, P.MAX_OFFLINE_SEC);
    return { sec: sec < P.MIN_OFFLINE_SEC ? 0 : sec, raw, capped, rewound, source };
  }

  /* what is stored next to game.serialize(): the timestamp bookkeeping */
  function makeMeta(prev, clock) {
    return { v: 1, savedAt: clock.now, maxSeen: Math.max(clock.now, prev && isFinite(prev.maxSeen) ? prev.maxSeen : -Infinity), mono: clock.mono != null ? clock.mono : null, bootId: clock.bootId != null ? clock.bootId : null };
  }
  const wrapSave = (game, prevMeta, clock) => ({ game: game.serialize(), offline: makeMeta(prevMeta, clock) });

  const oilTotal = game => game.buildings.reduce((a, b) => a + (b.type === 'tank' ? b.amt : 0), 0);

  /* run the existing simulation forward `sec` seconds. Pure with respect to the host: no clock reads, no UI, no I/O. */
  function advance(game, sec, P = POLICY) {
    const before = { oil: oilTotal(game), cash: game.s.cash, time: game.s.time };
    if (!(sec > 0)) return { simulated: 0, steps: 0, before, after: before, produced: 0 };
    const rng0 = game.rng; game.rng = mulberry32(seedFor(game, sec));
    let steps = 0;
    try {
      for (const { dt, n } of schedule(sec, P)) for (let i = 0; i < n; i++) { game.step(dt); tickSystems(game, dt, { offline: true }); steps++; }
    } finally { game.rng = rng0; }
    if (game.events && game.events.length > P.EVENTS_KEEP) game.events.splice(0, game.events.length - P.EVENTS_KEEP);
    const after = { oil: oilTotal(game), cash: game.s.cash, time: game.s.time };
    return { simulated: sec, steps, before, after, produced: after.oil - before.oil };
  }

  /* the whole resume: loads nothing itself (the host loads the game from the save, then calls this). Returns the new meta to store. */
  function resume(game, meta, clock, P = POLICY) {
    const el = computeElapsed(meta, clock, P), report = advance(game, el.sec, P);
    return { meta: makeMeta(meta, clock), elapsed: el, report };
  }

  const api = { POLICY, register, unregister, tickSystems, schedule, computeElapsed, makeMeta, wrapSave, advance, resume, mulberry32, seedFor, oilTotal, _systems: systems };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OliOffline = api;
})(typeof window !== 'undefined' ? window : globalThis);
