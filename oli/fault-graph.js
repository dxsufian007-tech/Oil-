/* Oli - fault-graph.js : ROOT-CAUSE ANALYSIS of the network inspector's findings (READ-ONLY, pure: it only reads what the inspector found and what the engine last solved).
 *   analyze(ctx) -> { groups, totals, graph }      and every analysed fault gets  f.rca = { role: 'ROOT' | 'SYMPTOM' | 'INDEPENDENT', group, rootNo, lostBblDay, basis }
 * - A SYMPTOM (a blocked well, a dead end) is linked to the fault that causes it (the first failing element on its path, or the closed / open / missing pipe at the dead end).
 *   When no fault explains it, the symptom is its own root; when the inspector knows the element but it has no finding (a full tank, a saturated pump) the root is a SYNTHETIC one named after that element.
 * - Lost production is counted ONCE per well: a well is claimed by exactly one root (its own blocking trace first, then the dead end), so groups never add the same barrels twice.
 * - The facilities AFTER the root (what receives less) come from a bounded breadth-first walk with a visited set, so rings and loops end.
 * ctx = { faults (numbered), byId(id), wellLoss(id) -> { loss, nominal, basis }, downstream(element, cap) -> { items, count, truncated, members:Set }, outLines(buildingId) -> [lineId], crudePrice (optional), label(element) }
 */
(function (root) {
  'use strict';
  const SYMPTOM = new Set(['BLOCKED', 'DEAD_END']), SEVR = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }, MAX_ROOTS = 150, SHOW = 8, CAP = 400;
  const elKey = e => e.type + ':' + e.id, better = (a, b) => (!b) || (a.indicator ? 2 : a.confirmed ? 0 : 1) < (b.indicator ? 2 : b.confirmed ? 0 : 1) || ((a.indicator ? 2 : a.confirmed ? 0 : 1) === (b.indicator ? 2 : b.confirmed ? 0 : 1) && SEVR[a.severity] < SEVR[b.severity]);

  function analyze(ctx) {
    const faults = ctx.faults, byEl = new Map(), groups = new Map(), claimed = new Map(), nodes = [], edges = [];
    for (const f of faults) { if (SYMPTOM.has(f.code) || !f.element) continue; const k = elKey(f.element); let a = byEl.get(k); if (!a) byEl.set(k, a = []); a.push(f); }
    const bestOn = el => { let b = null; for (const f of byEl.get(elKey(el)) || []) if (better(f, b)) b = f; return b; };
    const group = (key, init) => { let g = groups.get(key); if (!g) { g = Object.assign({ id: 'G' + (groups.size + 1), key, symptoms: [], wells: [], lostBblDay: 0, downstream: null, maskedBy: null }, init); groups.set(key, g); } return g; };
    const claim = (g, wellId) => { if (claimed.has(wellId)) return false; claimed.set(wellId, g.id); const w = ctx.wellLoss(wellId), b = ctx.byId(wellId); g.wells.push({ id: wellId, label: b ? ctx.label({ type: 'BUILDING', id: wellId }) : '#' + wellId, loss: w.loss, nominal: w.nominal, basis: w.basis }); g.lostBblDay += w.loss; return true; };
    const rootGroupOf = (f) => { const g = f.rca && groups.get(f.rca.key); return g; };

    /* 1. blocked wells: the root is the fault on the first failing element of the well's path, else a synthetic root for that element (a full tank, a saturated pump...) */
    for (const f of faults.filter(z => z.code === 'BLOCKED')) { const T = f.trace, W = T && T.well; if (!W) continue; let g;
      if (T.responsible) { const rt = T.responsible.type === 'pipe' ? 'PIPE' : 'BUILDING', rs = { type: rt, id: T.responsible.id, label: T.responsible.label }; const cf = bestOn(rs);
        g = cf ? group('F' + cf.id, { fault: cf, code: cf.code, element: cf.element, label: cf.element.label, severity: cf.severity, synthetic: false }) : group('S' + rt + ':' + rs.id + ':' + T.cause, { fault: null, code: T.cause, element: rs, label: rs.label, causeAr: T.causeAr, severity: 'MEDIUM', synthetic: true });
        if (cf && !cf.rca) cf.rca = { role: 'ROOT', key: g.key }; }
      else g = group('F' + f.id, { fault: f, code: f.code, element: f.element, label: f.element.label, severity: f.severity, synthetic: false, unknownCause: true });
      g.symptoms.push(f.no); f.rca = { role: g.fault === f ? 'ROOT' : 'SYMPTOM', key: g.key }; claim(g, W.id); }

    /* 2. dead ends: the root is the fault on the dead end itself or on the pipes leaving it (closed, open, missing); otherwise the dead end is its own root */
    for (const f of faults.filter(z => z.code === 'DEAD_END')) { const o = f.element, cands = []; const on = bestOn(o); if (on) cands.push(on);
      for (const lid of ctx.outLines(o.id)) { const c = bestOn({ type: 'PIPE', id: lid }); if (c) cands.push(c); } let cf = null; for (const c of cands) if (better(c, cf)) cf = c;
      const g = cf ? group('F' + cf.id, { fault: cf, code: cf.code, element: cf.element, label: cf.element.label, severity: cf.severity, synthetic: false }) : group('F' + f.id, { fault: f, code: f.code, element: f.element, label: f.element.label, severity: f.severity, synthetic: false });
      if (cf && !cf.rca) cf.rca = { role: 'ROOT', key: g.key }; g.symptoms.push(f.no); f.rca = { role: g.fault === f ? 'ROOT' : 'SYMPTOM', key: g.key };
      for (const wid of (f.evidence && f.evidence.wells) || []) claim(g, wid); }

    /* 3. the facilities after each root, and roots that sit downstream of another root */
    const list = [...groups.values()].sort((a, b) => b.lostBblDay - a.lostBblDay || SEVR[a.severity] - SEVR[b.severity]);
    list.forEach((g, i) => { if (i >= MAX_ROOTS) { g.downstream = { items: [], count: 0, truncated: true, skipped: true }; return; } const d = ctx.downstream(g.element, CAP); g.downstream = { items: d.items.slice(0, SHOW), count: d.count, truncated: d.truncated }; g._members = d.members; });
    for (const g of list) for (const h of list) if (g !== h && g._members && g._members.has(elKey(h.element)) && !(h._members && h._members.has(elKey(g.element)))) { h.maskedBy = h.maskedBy || g.id; }       // h is after g: g's break hides h's effect on the wells g already claimed
    const price = ctx.crudePrice > 0 ? ctx.crudePrice : null; let total = 0;
    for (const g of list) { g.lostBblDay = Math.round(g.lostBblDay * 10) / 10; total += g.lostBblDay; g.lostUsdDay = price ? Math.round(g.lostBblDay * price) : null; delete g._members; g.wells.sort((a, b) => b.loss - a.loss); }
    /* 4. the dependency graph: cause -> symptom (CAUSES), root -> facility after it (AFFECTS), root -> well that lost production (STARVES) */
    const nid = new Set(), addN = (id, kind, label, extra) => { if (!nid.has(id)) { nid.add(id); nodes.push(Object.assign({ id, kind, label }, extra || {})); } };
    for (const g of list) { addN(g.id, g.synthetic ? 'ROOT_ELEMENT' : 'ROOT', g.label, { code: g.code, severity: g.severity, lostBblDay: g.lostBblDay });
      for (const no of g.symptoms) { addN('F' + no, 'SYMPTOM', '#' + no); edges.push({ from: g.id, to: 'F' + no, kind: 'CAUSES' }); }
      for (const w of g.wells) { addN('B' + w.id, 'WELL', w.label, { loss: w.loss }); edges.push({ from: g.id, to: 'B' + w.id, kind: 'STARVES' }); }
      for (const d of g.downstream.items) { addN(d.type[0] + d.id, 'FACILITY', d.label); edges.push({ from: g.id, to: d.type[0] + d.id, kind: 'AFFECTS' }); } }
    for (const f of faults) if (!f.rca) f.rca = { role: 'INDEPENDENT', key: null };
    for (const f of faults) { const g = f.rca.key && groups.get(f.rca.key); if (g) { f.rca.group = g.id; f.rca.rootNo = g.fault ? g.fault.no : null; f.rca.lostBblDay = f.rca.role === 'ROOT' || f.rca.role === 'SYMPTOM' ? g.lostBblDay : 0; f.rca.basis = g.wells.length ? g.wells[0].basis : null; f.rca.reason = g.synthetic ? g.causeAr : null; } delete f.rca.key; }
    return { groups: list.map(g => ({ id: g.id, rootNo: g.fault ? g.fault.no : null, synthetic: g.synthetic, code: g.code, causeAr: g.causeAr || null, element: g.element, label: g.label, severity: g.severity, symptoms: g.symptoms, wells: g.wells, lostBblDay: g.lostBblDay, lostUsdDay: g.lostUsdDay, downstream: g.downstream, maskedBy: g.maskedBy, unknownCause: !!g.unknownCause })),
      totals: { roots: list.length, symptoms: faults.filter(f => f.rca.role === 'SYMPTOM').length, independent: faults.filter(f => f.rca.role === 'INDEPENDENT').length, wells: claimed.size, lostBblDay: Math.round(total * 10) / 10, lostUsdDay: price ? Math.round(total * price) : null, price }, graph: { nodes, edges } };
  }
  const api = { analyze };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OliFaultGraph = api;
})(typeof window !== 'undefined' ? window : globalThis);
