/* Oli - fault-repair.js : EXECUTING repairs with the player's approval -- PHASE 4A ONLY.
 *   4A covers exactly: open a closed pipe, open a closed / partly closed valve, delete an ORPHAN pipe (no live building at either end).
 *   Not here: building replacement, new pipes, widening, demolition (4B / 4C), spare parts (equipment repair only), any change to the save format.
 * A repair is a TICKET:  PLANNED -> (confirm x1, or x2 for a deletion) -> EXECUTING -> DONE | ROLLED_BACK | REJECTED.   A ticket is used once.
 * Execution is ATOMIC: re-diagnose, re-check every precondition and the price, change the network through an undo log, post the money LAST as one balanced journal entry,
 * run the company audit; ANY failure undoes every step (the journal is never touched before the last step, so no money moves on a failure).
 * Allowed only while the game is paused.  Nothing runs unless the player taps; the simulation never calls this module.
 * env = { store, net, sim, company, scan() -> fresh inspector report, remedies(f, rep) -> catalog entry, nowMs(), __inject(stage) (tests only) }
 */
(function (root) {
  'use strict';
  const nodeReq = typeof module !== 'undefined' && module.exports, FR = nodeReq ? require('./fault-registry.js') : root.OliFaultRegistry, RM = nodeReq ? require('./fault-remedies.js') : root.OliFaultRemedies;
  const TTL = 120000, MAX_T = 60, REFUND = RM ? RM.REFUND : 0.5;
  const fpPipe = L => L.path.length + ':' + L.dia + ':' + JSON.stringify(L.a) + JSON.stringify(L.b) + ':' + L.path[0] + '>' + L.path[L.path.length - 1];
  const live = (env, e) => !!(e && env.store.get(e.b));
  const refundOf = (env, L, PIPES) => Math.floor(L.path.length * (PIPES[L.dia] || PIPES[16]).cost * REFUND);

  /* ---- the three supported actions: check (pure) / apply (changes, pushes its undo) / quote ---- */
  const ACT = {
    SET_LINE_OPEN: {
      check(env, a) { const L = env.net.lines.get(a.line); if (!L) return { ok: false, reason: 'GONE', ar: 'الأنبوب لم يعد موجوداً.' }; if (L.open !== false) return { ok: false, reason: 'NOT_CLOSED', ar: 'المسار ليس مغلقاً الآن.' }; return { ok: true, fp: fpPipe(L), refund: 0 }; },
      apply(env, a, undo) { const L = env.net.lines.get(a.line), was = { flow: L.flow }; undo.push(() => { const M = env.net.lines.get(a.line); if (M) { M.open = false; M.flow = was.flow; env.net.rev++; } }); delete L.open; env.net.rev++; return true; },
      title: a => 'فتح المسار PIPE-' + a.line
    },
    SET_VALVE: {
      check(env, a) { const b = env.store.get(a.id); if (!b) return { ok: false, reason: 'GONE', ar: 'الصمام لم يعد موجوداً.' }; const d = env.DEFS[b.d]; if (!d || d.type !== 'valve') return { ok: false, reason: 'NOT_VALVE', ar: 'العنصر ليس صماماً.' }; if (a.mode !== 'OPEN') return { ok: false, reason: 'UNSUPPORTED', ar: 'هذه المرحلة تفتح الصمامات فقط.' };
        const m = b.s && b.s.mode; if (m !== 'CLOSED' && m !== 'PARTIAL') return { ok: false, reason: m === 'FAULT' ? 'FAULT_NOT_4A' : 'NOT_CLOSED', ar: m === 'FAULT' ? 'إصلاح الصمام المعطل ليس ضمن هذه المرحلة.' : 'الصمام ليس مغلقاً أو جزئياً الآن.' }; return { ok: true, fp: b.id + ':' + b.d + ':' + m + ':' + ((b.s && b.s.opening) || 0), refund: 0 }; },
      apply(env, a, undo) { const b = env.store.get(a.id), was = { mode: b.s.mode, opening: b.s.opening }; undo.push(() => { const c = env.store.get(a.id); if (c && c.s) { c.s.mode = was.mode; if (was.opening === undefined) delete c.s.opening; else c.s.opening = was.opening; } }); return env.sim.setValve(b, 'OPEN', 1); },
      title: a => 'فتح الصمام #' + a.id
    },
    DELETE_PIPE: {
      check(env, a) { const L = env.net.lines.get(a.line); if (!L) return { ok: false, reason: 'GONE', ar: 'الأنبوب لم يعد موجوداً.' }; if (live(env, L.a) || live(env, L.b)) return { ok: false, reason: 'NOT_ORPHAN', ar: 'الأنبوب متصل بمنشأة قائمة: ليس يتيماً.' }; return { ok: true, fp: fpPipe(L), refund: refundOf(env, L, env.PIPES) }; },
      apply(env, a, undo) { const L = env.net.lines.get(a.line), bk = { id: L.id, a: L.a, b: L.b, path: L.path.map(p => p.slice()), product: L.product, dia: L.dia, conn: L.conn, open: L.open, flow: L.flow }, next = env.net.nextId, order = [...env.net.lines.keys()]; undo.push(() => { env.net.lay(bk); const m = new Map(); for (const k of order) if (env.net.lines.has(k)) m.set(k, env.net.lines.get(k)); for (const [k, v] of env.net.lines) if (!m.has(k)) m.set(k, v); env.net.lines = m; env.net.nextId = next; env.net.rev++; }); return env.net.remove(a.line); },
      title: a => 'حذف الأنبوب اليتيم PIPE-' + a.line
    }
  };

  function create() {
    const tickets = new Map(); let seq = 0, busy = false;
    const now = env => (env && env.nowMs ? env.nowMs() : Date.now()), prune = () => { while (tickets.size > MAX_T) tickets.delete(tickets.keys().next().value); };
    const fresh = (env) => { const rep = env.scan(); return rep; };
    const reject = (t, reason, ar, terminal) => { if (terminal !== false) { t.status = 'REJECTED'; } t.result = { ok: false, reason, ar }; return Object.assign({ ok: false, status: t.status }, t.result); };

    /* PLAN: from a finding + the catalog option the player picked */
    function plan(f, optionId, env, rep) {
      if (!f || !env || !rep) return { ok: false, reason: 'ARGS', ar: 'بيانات ناقصة.' };
      const R = RM.forFault(f, env.catalogEnv || env, rep), opt = R.options.find(o => o.id === optionId); if (!opt) return { ok: false, reason: 'NO_OPTION', ar: 'الخيار غير موجود لهذا العطل.' };
      if (!opt.actions.length) return { ok: false, reason: 'NOT_EXECUTABLE', ar: 'هذا الخيار قرار إداري لا يُنفَّذ آلياً.' };
      for (const a of opt.actions) if (!ACT[a.kind]) return { ok: false, reason: 'OUT_OF_SCOPE', ar: 'هذا النوع من الإصلاح غير متاح في هذه المرحلة (4A).' };
      const pre = [], quote = { pay: 0, refund: 0 }; for (const a of opt.actions) { const c = ACT[a.kind].check(env, a); if (!c.ok) return { ok: false, reason: c.reason, ar: c.ar }; pre.push(c.fp); quote.refund += c.refund; }
      if (opt.cost.pay > 0) return { ok: false, reason: 'OUT_OF_SCOPE', ar: 'خيار يتطلب دفعاً: خارج المرحلة 4A.' };
      const del = opt.actions.some(a => a.kind === 'DELETE_PIPE'), t = { id: 'R' + (++seq), key: FR.keyOf(f), code: f.code, no: f.no, optionId, titleAr: opt.actions.map(a => ACT[a.kind].title(a)).join(' + '), actions: opt.actions.map(a => Object.assign({}, a)), pre, quote, needConfirms: del ? 2 : 1, confirms: 0, status: 'PLANNED', createdMs: now(env), result: null, expectBbl: opt.effect ? opt.effect.recoverBblDay : 0 };
      tickets.set(t.id, t); prune(); return { ok: true, ticket: view(t) };
    }
    const view = t => ({ id: t.id, key: t.key, code: t.code, no: t.no, optionId: t.optionId, titleAr: t.titleAr, status: t.status, needConfirms: t.needConfirms, confirms: t.confirms, quote: Object.assign({ net: t.quote.pay - t.quote.refund }, t.quote), result: t.result, expectBbl: t.expectBbl });
    function confirm(id, env) { const t = tickets.get(id); if (!t) return { ok: false, reason: 'NO_TICKET' }; if (t.status !== 'PLANNED') return { ok: false, reason: 'NOT_PLANNED', status: t.status }; if (now(env) - t.createdMs > TTL) return reject(t, 'EXPIRED', 'انتهت صلاحية التذكرة: أعد التخطيط.'); if (t.confirms < t.needConfirms) t.confirms++; return { ok: true, confirms: t.confirms, need: t.needConfirms, ready: t.confirms >= t.needConfirms }; }
    function cancel(id) { const t = tickets.get(id); if (t && t.status === 'PLANNED') { t.status = 'REJECTED'; t.result = { ok: false, reason: 'CANCELLED', ar: 'أُلغيت.' }; } return !!t; }

    /* EXECUTE: the atomic part */
    function execute(id, env) {
      const t = tickets.get(id); if (!t) return { ok: false, status: null, reason: 'NO_TICKET', ar: 'التذكرة غير موجودة.' };
      if (t.status === 'DONE' || t.status === 'ROLLED_BACK' || t.status === 'REJECTED') return { ok: false, status: t.status, reason: 'USED', ar: t.status === 'DONE' ? 'نُفِّذت هذه التذكرة من قبل: لا تُنفَّذ مرتين.' : 'التذكرة منتهية.' };
      if (busy || t.status === 'EXECUTING') return { ok: false, status: t.status, reason: 'BUSY', ar: 'تنفيذ آخر جارٍ.' };
      if (t.confirms < t.needConfirms) return { ok: false, status: t.status, reason: 'NEEDS_CONFIRM', ar: t.needConfirms > 1 ? 'الحذف يحتاج تأكيداً بخطوتين.' : 'يلزم تأكيد.' };
      if (now(env) - t.createdMs > TTL) return reject(t, 'EXPIRED', 'انتهت صلاحية التذكرة: أعد التخطيط.');
      if (!env.company || env.company.speed !== 0) return { ok: false, status: t.status, reason: 'NOT_PAUSED', ar: 'أوقف اللعبة مؤقتاً أولاً: الإصلاح لا يُنفَّذ أثناء التشغيل.' };
      busy = true; t.status = 'EXECUTING'; const undo = []; let posted = null, rev0 = null, next0 = null;
      try {
        /* 1. is the fault still there? a FRESH diagnosis, not the screen's old one */
        const rep = fresh(env), f = rep.faults.find(z => FR.keyOf(z) === t.key); if (!f) return reject(t, 'RESOLVED', 'العطل انتهى (لم يعد موجوداً في التشخيص الجديد): لا حاجة للإصلاح.');
        /* 2. every precondition and the price, again */
        let refund = 0; for (let i = 0; i < t.actions.length; i++) { const c = ACT[t.actions[i].kind].check(env, t.actions[i]); if (!c.ok) return reject(t, c.reason, c.ar); if (c.fp !== t.pre[i]) return reject(t, 'CHANGED', 'تغيّر العنصر منذ المعاينة: أعد التخطيط.'); refund += c.refund; }
        if (refund !== t.quote.refund) return reject(t, 'PRICE_CHANGED', 'تغيّر السعر منذ المعاينة (' + t.quote.refund + ' ← ' + refund + '): أعد التخطيط.');
        const co = env.company; rev0 = env.net.rev; next0 = env.net.nextId;
        /* 3. the structural change through the undo log (no money moves here) */
        for (let i = 0; i < t.actions.length; i++) { if (env.__inject && env.__inject('apply:' + i)) throw new Error('injected failure at step ' + i); const ok = ACT[t.actions[i].kind].apply(env, t.actions[i], undo); if (ok === false) throw new Error('step ' + i + ' refused'); }
        /* 4. the money, LAST, as one balanced entry (a deletion refund); a failure here leaves cash and journal untouched */
        if (env.__inject && env.__inject('post')) throw new Error('injected failure before the journal entry');
        if (refund > 0 && isFinite(env.store.cash)) { co.sync(); posted = co._post({ type: 'REPAIR', flow: 'INV', desc: 'Repair ' + t.id + ' · ' + t.titleAr + ' · refund' }, [['CASH', refund], ['FIXED', -refund]]); }
        /* 5. the company audit: the books must still balance */
        if (env.__inject && env.__inject('audit')) throw new Error('injected audit failure'); const au = co.audit(); const errs = (au && au.errors) || []; if (errs.length) throw new Error('audit: ' + errs[0]);
        co._event('info', 'إصلاح مُنفَّذ بموافقتك: ' + t.titleAr + (refund > 0 ? ' · استرداد ' + refund.toLocaleString('en-US') + ' $' : ' · بلا كلفة') + ' (' + t.id + ')');
        t.status = 'DONE'; t.result = { ok: true, refund, executedHours: co.hours };
        /* 6. structural verification on a fresh scan (flows update when the game resumes: the simulation is not stepped here) */
        let v = { fixed: null }; try { const r2 = fresh(env); v.fixed = !r2.faults.some(z => FR.keyOf(z) === t.key); v.lostBefore = rep.rca ? rep.rca.totals.lostBblDay : null; v.lostAfter = r2.rca ? r2.rca.totals.lostBblDay : null; v.solved = !env.sim.dirty(); } catch (e) { v.error = e.message; }
        t.result.verify = v; return Object.assign({ ok: true, status: 'DONE', id: t.id }, t.result);
      } catch (e) {
        const errs = []; for (let i = undo.length - 1; i >= 0; i--) { try { undo[i](); } catch (x) { errs.push(x.message); } }
        if (rev0 !== null) { env.net.rev = rev0; env.net.nextId = next0; }                                   // the network revision is exactly what it was
        if (posted) { try { env.company._post({ type: 'REPAIR_REVERSAL', flow: 'INV', desc: 'Reversal of repair ' + t.id }, [['FIXED', t.quote.refund], ['CASH', -t.quote.refund]]); } catch (x) { errs.push('reversal: ' + x.message); } }
        t.status = 'ROLLED_BACK'; t.result = { ok: false, reason: 'ROLLED_BACK', ar: 'فشل التنفيذ فتم التراجع عن كل شيء ولم يُخصم أي مبلغ: ' + e.message, rollbackErrors: errs }; return Object.assign({ ok: false, status: 'ROLLED_BACK' }, t.result);
      } finally { busy = false; if (t.status === 'EXECUTING') t.status = 'REJECTED'; }
    }
    return { plan, confirm, cancel, execute, get: id => { const t = tickets.get(id); return t ? view(t) : null; }, list: () => [...tickets.values()].map(view), supported: kind => !!ACT[kind] };
  }
  const api = { create, SCOPE: ['SET_LINE_OPEN', 'SET_VALVE', 'DELETE_PIPE'], TTL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OliFaultRepair = api;
})(typeof window !== 'undefined' ? window : globalThis);
