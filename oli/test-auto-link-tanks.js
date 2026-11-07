// Auto-link of ADJACENT storage tanks: adjacency creates the connection (two independent lines, valves CLOSED), never a duplicate, never across reserve/commercial, never mixed products; nothing flows until a valve is opened.   node test-auto-link-tanks.js
const H = require('./test-reserve-helpers.js'), { B, I, game, put, ZN, A0, reload } = H, assert = require('assert');
let n = 0; const ok = (c, m, x) => { if (!c) console.log('  FAIL ' + m + (x ? ' ' + JSON.stringify(x) : '')); assert(c, m); n++; console.log('  ok  ' + m); };
const lines = g => [...g.net.lines.values()], between = (g, a, b) => lines(g).filter(L => (L.a.b === a.id && L.b.b === b.id) || (L.a.b === b.id && L.b.b === a.id));
const link = (g, t, o) => I.autoLinkTank(g.store, g.net, g.ts, t.id, o);

{ // 1. two adjacent tanks
  const g = game(), a = put(g, 'crude_tank_m', 50, 50); ok(link(g, a).linked.length === 0 && lines(g).length === 0, 'a lone tank: nothing to link');
  const b = put(g, 'crude_tank_m', 55, 50), cash0 = g.store.cash, r = link(g, b), ls = between(g, a, b);   // gap 2
  ok(r.linked.length === 1 && ls.length === 2, 'two adjacent tanks (gap 2): ONE connection of TWO independent lines', { linked: r.linked.length, lines: ls.length });
  ok(ls.every(L => L.open !== false), 'both lines start OPEN (player request)');
  ok(ls[0].conn === ls[1].conn && (ls[0].a.b === a.id) !== (ls[1].a.b === a.id), 'one line each way (A->B and B->A), sharing one connection id');
  ok(Math.abs((cash0 - g.store.cash) - r.cost) < 1e-6 && r.cost > 0, 'the pipes are paid for once, by length: ' + r.cost);
  const n0 = lines(g).length, id0 = g.net.nextId, cash1 = g.store.cash, r2 = link(g, b);
  ok(r2.linked.length === 0 && lines(g).length === n0 && g.net.nextId === id0 && g.store.cash === cash1, 'linking again adds nothing (no duplicate line, no charge)');
  // flow: lines open -> oil levels out between the two tanks, total constant, capacity respected
  g.sim.build(); const sa = g.sim.ensure(a), sb = g.sim.ensure(b); sa.prod = sb.prod = 'CRUDE'; const cap = B.DEFS[a.d].capacity.value; sa.vol = cap * .8; sb.vol = 0; const tot = sa.vol; g.sim.run(3);
  ok(sb.vol > 0 && Math.abs(sa.vol + sb.vol - tot) < 1e-3 * tot && sb.vol <= cap + 1e-6, 'open lines: oil flows A->B, the total never changes (' + Math.round(sb.vol) + ' bbl), B stays within its capacity');
  ok(g.sim.ensure(b).vol >= 0 && g.sim.ensure(a).vol >= 0, 'no negative stock anywhere');
}
{ // 2. third and fourth tank join; old lines untouched; no loops duplicated
  const g = game(), a = put(g, 'crude_tank_m', 50, 50), b = put(g, 'crude_tank_m', 55, 50); link(g, b); const old = lines(g).map(L => L.id + ':' + L.path.length + ':' + L.conn).join('|');
  const c = put(g, 'crude_tank_m', 60, 50), rc = link(g, c);
  ok(rc.linked.length === 1 && between(g, b, c).length === 2 && between(g, a, c).length === 0, 'a third tank beside the network joins it (linked to its neighbour only)');
  ok(old.split('|').every(s => lines(g).some(L => L.id + ':' + L.path.length + ':' + L.conn === s)), 'the old connections are NOT rebuilt (same ids, paths, connection ids)');
  const d = put(g, 'crude_tank_m', 55, 55), rd = link(g, d);
  ok(rd.linked.length >= 1 && lines(g).filter(L => L.a.b === d.id || L.b.b === d.id).length === 2 * rd.linked.length, 'a fourth tank (touching b below) gets its own connection(s): ' + rd.linked.length);
  const keys = lines(g).map(L => [L.a.b, L.a.port, L.b.b, L.b.port].join('/')); ok(new Set(keys).size === keys.length, 'no two lines use the same port pair');
  const used = new Map(); let clash = 0; for (const L of lines(g)) for (const e of [L.a, L.b]) { const k = e.b + '/' + e.port; if (used.has(k)) clash++; used.set(k, 1); } ok(clash === 0, 'no port is used by two lines (port capacity respected)');
}
{ // 3. not adjacent / reasons
  const g = game(), a = put(g, 'crude_tank_m', 50, 50), far = put(g, 'crude_tank_m', 62, 50); ok(link(g, far).linked.length === 0 && lines(g).length === 0, 'tanks 8 tiles apart are not adjacent: no link');
  const g2 = game(), p = put(g2, 'crude_tank_m', 50, 50), q = put(g2, 'gasoline_tank_m', 55, 50), r = link(g2, q);
  ok(r.linked.length === 0 && r.skipped[0] && r.skipped[0].reason === 'invalidProduct' && lines(g2).length === 0, 'crude beside gasoline: not linked, reason invalidProduct', r.skipped);
  const g3 = game(), x = put(g3, 'crude_tank_m', 50, 50), y = put(g3, 'crude_tank_m', 55, 50); g3.store.cash = 10; const r3 = link(g3, y);
  ok(r3.linked.length === 0 && r3.skipped[0].reason === 'cash' && lines(g3).length === 0 && g3.store.cash === 10, 'no cash: not linked, reason cash, nothing charged', r3.skipped);
  const g4 = game(), u = put(g4, 'crude_tank_m', 50, 50), w = put(g4, 'crude_tank_m', 55, 50); const used = I.portsOf(w).length; ok(used > 0, 'tanks have ports');
}
{ // 4. reserve tank beside a commercial tank: never linked automatically
  const g = game(); g.co.injectEquity(1e9, 't'); for (let i = 0; i < 4; i++) g.co.reserveExpand(); const inZone = put(g, 'crude_tank_s', ZN.x + ZN.w - 3, ZN.y + 4), out = put(g, 'crude_tank_s', ZN.x + ZN.w + 1, ZN.y + 4);
  ok(inZone.rs === 1 && !out.rs, 'one tank is a reserve tank, the other a commercial tank (setup)'); const r = link(g, out);
  ok(r.linked.length === 0 && r.skipped.some(s => s.reason === 'zoneSeparation') && lines(g).length === 0, 'reserve beside commercial: not linked, reason zoneSeparation', r.skipped);
  const t2 = put(g, 'crude_tank_s', ZN.x + ZN.w - 6, ZN.y + 4), r2 = link(g, t2); ok(r2.linked.length === 1 && between(g, inZone, t2).length === 2, 'two reserve tanks beside each other DO link');
}
{ // 5. save / load keeps the links (they are ordinary PipeNet lines); a pump / junction is not a tank
  const g = game(), a = put(g, 'crude_tank_m', 50, 50), b = put(g, 'crude_tank_m', 55, 50); link(g, b); const n2 = I.PipeNet.fromJSON(g.ts.W, JSON.parse(JSON.stringify(g.net.toJSON()))), L2 = [...n2.lines.values()];
  ok(L2.length === 2 && L2.every(L => L.open !== false), 'after save / load: same two lines, still open');
  const pj = put(g, 'junction', 70, 70); ok(I.autoLinkTank(g.store, g.net, g.ts, pj.id).linked.length === 0, 'a non-storage building is ignored');
}
console.log('AUTO-LINK TANKS TESTS PASSED (' + n + ' checks)');
