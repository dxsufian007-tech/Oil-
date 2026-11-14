/* Oli - fault-whatif.js : the "WHAT IF" preview of a pipe repair (Phase 4B).  READ-ONLY.
 * It applies the planned change to a COPY of the pipe network and runs the game's own ADVISORY flow model (I.flowModel) before and after.
 * The result is an ESTIMATE of the advisory model, NOT the full simulation (which would need game time).  The real network, the buildings, the cash and the save are never touched.
 *   preview(env, action) -> { ok, estimate: true, label, lines: [{id,label,before,after,capacity}], receivers: [{id,label,before,after,capacity}], bottleneck, notes }
 * env = { store, net, ts, DEFS, PIPES, planPipe, planClosePipe, flowModel, PipeNet }
 */
(function (root) {
  'use strict';
  const LABEL = 'تقدير استشاري من نموذج التدفق الاستشاري للّعبة، وليس نتيجة المحاكاة الكاملة';
  const r1 = n => Math.round(n * 10) / 10;
  function preview(env, a) {
    const out = { ok: false, estimate: true, label: LABEL, lines: [], receivers: [], bottleneck: null, notes: [] }; if (!env.flowModel || !env.PipeNet) { out.notes.push('نموذج التدفق غير متاح.'); return out; }
    let copy; try { copy = env.PipeNet.fromJSON(env.store.W, env.net.toJSON()); } catch (e) { out.notes.push('تعذّر نسخ الشبكة: ' + e.message); return out; }
    let touchedId = null, dstB = null, srcB = null;
    try {
      if (a.kind === 'LAY_PIPE') { const v = env.planPipe(env.store, copy, env.ts, a.from, a.to, a.dia, { ignoreCash: true }); if (!v.ok) { out.notes.push('لم يعد التوصيل ممكناً: ' + v.reason); return out; } const L = copy.lay({ a: v.a, b: v.b, path: v.path, product: v.product, dia: v.dia }); touchedId = L.id; srcB = a.from.b; dstB = a.to.b; }
      else if (a.kind === 'CLOSE_PIPE') { const v = env.planClosePipe(env.store, copy, env.ts, a.line, a.to, { ignoreCash: true }); if (!v.ok) { out.notes.push('لم يعد الإغلاق ممكناً: ' + v.reason); return out; } const L0 = copy.lines.get(a.line); const path = L0.path.concat(v.add), src = L0.a, dia = L0.dia; copy.remove(a.line); const L = copy.lay({ id: a.line, a: src, b: v.b, path, product: v.product, dia }); touchedId = L.id; srcB = src.b; dstB = a.to.b; }
      else if (a.kind === 'UPGRADE_PIPE') { const L = copy.lines.get(a.line); if (!L) { out.notes.push('الأنبوب لم يعد موجوداً.'); return out; } L.dia = a.to; touchedId = L.id; srcB = L.a && L.a.b; dstB = L.b && L.b.b; }
      else { out.notes.push('هذا الإجراء بلا معاينة «ماذا لو».'); return out; }
    } catch (e) { out.notes.push('تعذّرت المعاينة: ' + e.message); return out; }
    const m0 = env.flowModel(env.store, env.net), m1 = env.flowModel(env.store, copy), cap = L => (env.PIPES[L.dia] || env.PIPES[16]).capacity, nm = id => { const b = env.store.get(id); return b ? env.DEFS[b.d].name + ' #' + id : '#' + id; };
    const flow = (m, L) => { try { return L.a && L.b && env.store.get(L.a.b) && env.store.get(L.b.b) ? m.lineFlow(L) : 0; } catch (e) { return 0; } };
    /* lines touching the source building (their split can change) and the changed line */
    const seen = new Set(), add = id => { if (seen.has(id)) return; seen.add(id); const A = env.net.lines.get(id), B = copy.lines.get(id); if (!A && !B) return; out.lines.push({ id, label: 'PIPE-' + id + (A ? '' : ' (جديد)'), before: A ? r1(flow(m0, A)) : 0, after: B ? r1(flow(m1, B)) : 0, capacity: B ? cap(B) : cap(A) }); };
    add(touchedId); for (const L of copy.lines.values()) if (L.a && L.a.b === srcB) add(L.id);
    /* what arrives at each destination before and after */
    const dests = new Set(); for (const L of copy.lines.values()) if (L.a && L.a.b === srcB && L.b) dests.add(L.b.b); if (dstB != null) dests.add(dstB);
    const inflow = (net, m, id) => { let s = 0; for (const L of net.lines.values()) if (L.b && L.b.b === id) s += flow(m, L); return s; };
    for (const id of dests) { const b = env.store.get(id), d = b && env.DEFS[b.d], c = d && d.capacity && /day/.test(d.capacity.unit || '') ? d.capacity.value : null; out.receivers.push({ id, label: nm(id), before: r1(inflow(env.net, m0, id)), after: r1(inflow(copy, m1, id)), capacity: c }); }
    /* the next bottleneck: the changed pipe itself, the destination, then the lines leaving the destination (3 hops) */
    const T = copy.lines.get(touchedId), tf = T ? flow(m1, T) : 0; let bn = null;
    if (T && tf >= cap(T) * 0.98) bn = { kind: 'PIPE', id: T.id, label: 'الأنبوب نفسه PIPE-' + T.id, flow: r1(tf), capacity: cap(T) };
    if (!bn && dstB != null) { const r = out.receivers.find(z => z.id === dstB); if (r && r.capacity && r.after > r.capacity * 1.0001) bn = { kind: 'BUILDING', id: dstB, label: r.label, flow: r.after, capacity: r.capacity }; }
    if (!bn && dstB != null) { let frontier = [dstB]; const vis = new Set([dstB]); for (let hop = 0; hop < 3 && !bn; hop++) { const nxt = []; for (const id of frontier) for (const L of copy.lines.values()) { if (!L.a || L.a.b !== id || !L.b || vis.has(L.b.b)) continue; vis.add(L.b.b); nxt.push(L.b.b); const f = flow(m1, L); if (f >= cap(L) * 0.98 && f > 0) { bn = { kind: 'PIPE', id: L.id, label: 'PIPE-' + L.id + ' بعد الوجهة', flow: r1(f), capacity: cap(L) }; break; } } frontier = nxt; } }
    out.bottleneck = bn; out.ok = true; return out;
  }
  const api = { preview, LABEL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OliFaultWhatIf = api;
})(typeof window !== 'undefined' ? window : globalThis);
