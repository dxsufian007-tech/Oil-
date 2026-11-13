# B3b-1 - what `CentralNet.receivers()` depends on (audit, before any change)

`receivers(sim, ch, exceptId, exceptPort)` (central.js, B3a) returns, in order, one `{ s, b, port }` for every station `s`
that owns a building `b` which is OPERATIONAL and has a pipe edge on one of the channel's two ports (except the one
(exceptId, exceptPort) the flow came from).

```
for (const s of this.st.values()) {                       // (1) the stations, in insertion order
  if (s.b == null) continue;                              // (2) the station's building id
  const b = sim.store.get(s.b);                           // (3) the building object, live
  if (!b || !sim.ok(b)) continue;                         // (4) b.st === 'OPERATIONAL', live
  for (const port of PORTS[ch]) {                         // (5) the two ports of the channel (constant)
    if (s.id === exceptId && port === exceptPort) continue;   // (6) the exception, per call
    if (sim.edgeOf(b, port)) out.push({ s, b, port });    // (7) sim._eb.get(b.id)[port]
  }
}
```

| # | dependency | who writes it | how a change is noticed by the new code |
|---|---|---|---|
| 1 | `this.st` membership and order | only `addStation` (`st.set` + `rev++`); nothing ever deletes a station | `this.rev` and `this.st.size` are part of the cache key |
| 2 | `s.b` | `addStation` (`rev++`) and `applyPlan` (`st.b = ...`, followed by `cn.rev++` at the end of the function); `tap` goes through `addStation` | `this.rev` is part of the key; in addition every cached station remembers the `b` it had and a mismatch on any call drops the cache and falls back to the old full scan |
| 3 | the building object `sim.store.get(s.b)` | the building store | NOT cached: read live on every call |
| 4 | `sim.ok(b)` (building state) | any building state change | NOT cached: evaluated live on every call |
| 5 | `PORTS[ch]` | constant | - |
| 6 | exceptId / exceptPort | the caller | NOT cached: evaluated live |
| 7 | `sim._eb` (edge map by building and port) | only `Sim.build()`, which creates a NEW Map each time (the topology: pipes, links between buildings, changes of the central network that `dirty()` sees) | the identity of `sim._eb` is part of the key; `edgeOf` is still evaluated live on the candidates |
| 8 | the `sim` object itself | the caller | the identity of `sim` is part of the key |

What the new code remembers: **only which stations can possibly have an edge on this channel** (stations whose building id
has an entry for one of the channel's ports in `sim._eb`), as a list per channel, valid for one value of
(`sim`, `sim._eb`, `this.rev`, `this.st.size`). The final result is never stored, and neither is any state that can change
between two calls (building, its state, exceptions, edge test).
`stOf()` already relies on `this.rev` for station / `s.b` changes in the same way.
