/* Phase A test scene: the real world with the central network (large refinery, tapped stations, crude from far stations, product tanks) AND wells drilled on real oil fields. */
const path = require('path'), ROOT = process.env.ROOT || path.join(__dirname, '../../..'), K = require(path.join(ROOT, 'test-central-kit.js')), { I, B, C, world } = K;
function build() {
  const g = K.mk(); g.world = world;
  { let ref = null; for (let y = 420; y < 520 && !ref; y += 2) for (let x = 150; x < 230 && !ref; x += 2) if (K.secOf(x, y) === 'D1' && g.store.validate('refinery_l', x, y, 0, { ignoreCash: true }).ok) ref = g.store.place('refinery_l', x, y, 0, { instant: true, ignoreCash: true }).building;
    const cx = ref.x + 5, cy = ref.y + 4, tiles = []; for (const s of g.cn.seg.values()) for (const [x, y] of s.path) tiles.push([Math.hypot(x - cx, y - cy), x, y]); tiles.sort((a, b) => a[0] - b[0]);
    const st = []; for (const [, x, y] of tiles) { if (st.length >= 2) break; if (st.some(m => Math.hypot(m.x - x, m.y - y) < 8)) continue; const pl = C.planTap(g.store, g.net, x, y, {}); if (!pl.ok) continue; const r = C.commitTap(g.store, g.net, pl, { instant: true }); if (r.ok) st.push({ x, y, b: r.building.id }); }
    const CH = { GASOLINE_OUT: 'GASOLINE', DIESEL_OUT: 'DIESEL', JET_OUT: 'JET_FUEL', GAS_OUT: 'GAS' }, taken = (b, port) => [...g.net.lines.values()].some(L => [L.a, L.b].some(e => e && e.b === b && e.port === port));
    for (const [t, ow] of [[st[0].b, false], [st[0].b, false], [st[1].b, true], [st[1].b, true], [st[1].b, true]]) I.layConnect(g.store, g.net, g.ts, ref.id, t, { ignoreCash: true, allowOneWay: ow });
    for (const [op, ch] of Object.entries(CH)) { if (taken(ref.id, op)) continue; let ok = false; for (const t of [st[0].b, st[1].b]) for (const sp of C.PORTS[ch]) { if (ok || taken(t, sp)) continue; for (const d of [36, 16, 8]) if (!ok && I.layPipe(g.store, g.net, g.ts, { b: ref.id, port: op }, { b: t, port: sp }, d, { ignoreCash: true }).ok) ok = true; } }
    K.attach(g, 'crude_tank_l', ['N3', 'N4', 'N5', 'S1', 'FS'], 'CRUDE', 'out', 150000); K.attach(g, 'crude_tank_l', ['JN', 'JM', 'JS'], 'CRUDE', 'out', 120000);
    for (const [ch, d] of [['GASOLINE', 'gasoline_tank_l'], ['DIESEL', 'diesel_tank_l'], ['JET_FUEL', 'jet_tank_l'], ['GAS', 'gas_sphere_l']]) K.attach(g, d, ['N1', 'N2', 'N3', 'N4', 'S1', 'FS', 'F1', 'F2'], ch, 'in'); }
  g.store.cash = 3e9;
  /* real fields: wells drilled on real field sites, each with a tank and a pipe (same helpers as test-production.js) */
  const fields = world.regionSites(world.homeRegionOfWorld().id).filter(s => s.kind === 'FIELD').sort((a, b) => b.radius - a.radius), wells = [];
  const open = f => { world.discover(f.id); world.survey(f.id); world.makeDrillable(f.id); return f; };
  const spotNear = (def, cx, cy, maxr, skip) => { for (let r = 0; r <= maxr; r++) { const n = 16 + r * 6; for (let a = 0; a < n; a++) { const x = Math.round(cx + Math.cos(a / n * 6.283) * r), y = Math.round(cy + Math.sin(a / n * 6.283) * r); if (skip && skip(x, y)) continue; if (g.store.validate(def, x, y, 0, {}).ok) return [x, y]; } } return null; };
  for (const f0 of fields.slice(0, 3)) { const f = open(f0); let tries = 0, got = 0; const bad = [];
    while (got < 3 && tries++ < 40) { const s = spotNear('oil_well', f.x, f.y, f.radius, (x, y) => bad.some(q => Math.hypot(q[0] - x, q[1] - y) < 3) || g.store.list().some(o => Math.hypot(o.x - x, o.y - y) < 7)); if (!s) break; const w = g.store.place('oil_well', s[0], s[1], 0, { instant: true }); if (!w.ok) { bad.push(s); continue; }
      const drop = () => { g.store.demolish(w.building.id, { building: true, pipes: true, pipeSet: g.net }); bad.push(s); }; const ts = spotNear('crude_tank_m', w.building.x + 8, w.building.y, 16); const t = ts && g.store.place('crude_tank_m', ts[0], ts[1], 0, { instant: true }); if (!(t && t.ok)) { drop(); continue; }
      const L = I.layPipe(g.store, g.net, g.ts, { b: w.building.id, port: 'OIL_OUT_E' }, { b: t.building.id, port: 'INPUT_W' }, 16); if (!L.ok) { g.store.demolish(t.building.id, { building: true, pipes: true, pipeSet: g.net }); drop(); continue; } wells.push(w.building); got++; } }
  if (process.env.DBG) console.error('fields', fields.length, 'wells', wells.length, fields.slice(0,3).map(f => f.id + '@' + f.x + ',' + f.y + ' r' + f.radius));
  for (const b of g.store.list()) { g.sim.ensure(b); if (b.d === 'oil_well') b.s.started = true; } g.store.cash = 3e9; g.co.sync();
  const co = g.co, fieldWells = g.store.list().filter(b => b.d === 'oil_well' && b.field != null).length;
  
  return { g, co, fieldWells, K };
}
module.exports = { build };
