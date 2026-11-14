/* Oli - fault-registry.js : the ISSUE REGISTRY of the network inspector (READ-ONLY, in memory, never saved).
 * One entry per (code, element): when the inspector FIRST SAW it in this session, how many scans saw it, whether it is still there, whether it came back.
 * It only remembers what the inspector reported; it never touches the game, the save or the simulation.  "since" is the first sighting by the inspector in this session (the game time it was first reported), not necessarily when the fault was caused.
 *   const reg = OliFaultRegistry.create();  OliFaultRegistry.update(reg, report, nowHours)  ->  report.issues = { active, resolved, list }  and every fault gets f.issue = { since, ageHours, scans, reopened }
 */
(function (root) {
  'use strict';
  const MAX_RESOLVED = 200, keyOf = f => f.code + '|' + (f.element ? f.element.type + ':' + f.element.id : '?');
  function create() { return { scans: 0, map: new Map() }; }
  function update(reg, rep, now) {
    now = +now || 0; reg.scans++; const seen = new Set();
    for (const f of rep.faults) { const k = keyOf(f); seen.add(k); let e = reg.map.get(k);
      if (!e) { e = { key: k, code: f.code, element: f.element, firstSeen: now, lastSeen: now, scans: 0, status: 'ACTIVE', reopened: 0, resolvedAt: null, severity: f.severity }; reg.map.set(k, e); }
      else if (e.status === 'RESOLVED') { e.status = 'ACTIVE'; e.reopened++; e.resolvedAt = null; e.firstSeen = now; }
      e.scans++; e.lastSeen = now; e.severity = f.severity; f.issue = { since: e.firstSeen, ageHours: Math.max(0, now - e.firstSeen), scans: e.scans, reopened: e.reopened }; }
    for (const e of reg.map.values()) if (e.status === 'ACTIVE' && !seen.has(e.key)) { e.status = 'RESOLVED'; e.resolvedAt = now; }
    const res = [...reg.map.values()].filter(e => e.status === 'RESOLVED').sort((a, b) => b.resolvedAt - a.resolvedAt); for (const e of res.slice(MAX_RESOLVED)) reg.map.delete(e.key);
    const list = [...reg.map.values()]; rep.issues = { active: list.filter(e => e.status === 'ACTIVE').length, resolved: list.filter(e => e.status === 'RESOLVED').length, scans: reg.scans, list };
    return rep;
  }
  const api = { create, update, keyOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OliFaultRegistry = api;
})(typeof window !== 'undefined' ? window : globalThis);
