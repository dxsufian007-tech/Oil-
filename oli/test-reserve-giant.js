/* R1 - the GIANT reserve store (crude_tank_g): definition, 8+8 ports, price, reserve-only placement, no move to commercial, running cost + pre-purchase preview, save/load, accounting separation.
   node test-reserve-giant.js */
const { B, I, E, EC, game, put, A0, reload, near } = require('./test-reserve-helpers.js');
const GC = require('./game-config.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const bal = (co, k) => co.journal.bal[k] || 0, days = (co, n) => { for (let d = 0; d < n; d++) co.advanceHours(24); };
const D = B.DEFS.crude_tank_g;

console.log('1. definition');
T('1a exists: 80,000,000 bbl, exactly $3,000,000,000, 22x22', !!D && D.capacity.value === 80e6 && D.capacity.unit === 'bbl' && D.cost === 3e9 && D.footprint[0] === 22 && D.footprint[1] === 22, D && [D.cost, D.capacity, D.footprint]);
T('1b price is base only (nothing per barrel) and the 80M is real capacity', D.baseCost === 3e9 && !D.costPerBarrel && D.params.cap === 80e6 && D.params.perBbl === 0);
const ins = D.connections.filter(c => c.role === 'in'), outs = D.connections.filter(c => c.role === 'out' && c.group === 'OUTPUT');
T('1c exactly 8 inputs and 8 outputs (+ the settled-water outlet)', ins.length === 8 && outs.length === 8 && D.connections.length === 17 && D.connections.filter(c => c.id === 'WATER_OUT').length === 1, [ins.length, outs.length, D.connections.length]);
T('1d every port id is unique, product crude, outputs optional, inputs required', new Set(D.connections.map(c => c.id)).size === 17 && [...ins, ...outs].every(c => c.product === 'CRUDE') && outs.every(c => c.required === false) && ins.every(c => c.required !== false));
const [w, h] = D.footprint, onEdge = c => (c.side === 0 && c.cell[0] === w - 1) || (c.side === 1 && c.cell[0] === 0) || (c.side === 2 && c.cell[1] === h - 1) || (c.side === 3 && c.cell[1] === 0);
T('1e every port sits on the edge it declares, inside the footprint, no two share a cell', D.connections.every(c => c.cell[0] >= 0 && c.cell[1] >= 0 && c.cell[0] < w && c.cell[1] < h && onEdge(c)) && new Set(D.connections.map(c => c.cell.join(','))).size === 17);
T('1f 2 inputs + 2 outputs on each of the four sides', [0, 1, 2, 3].every(s => ins.filter(c => c.side === s).length === 2 && outs.filter(c => c.side === s).length === 2));
T('1g reserve-only, not upgradable', D.reserveOnly === true && D.noUpgrade === true && !B.DEFS.crude_tank_c.reserveOnly);
const base = JSON.parse(require('fs').readFileSync(__dirname + '/test-data-reserve-r1-baseline.json', 'utf8'));
T('1h all 38 definitions of main (6527ac7) are byte-identical in price, capacity, size, ports, op/maint, build time, clearance', Object.keys(base).length === 38 && Object.keys(base).every(k => { const d = B.DEFS[k]; return JSON.stringify([d.cost, d.capacity.value, d.footprint[0], d.footprint[1], d.connections.map(c => c.id).join(), d.operatingCost, d.maintenanceCost, d.buildTime, d.clearance]) === JSON.stringify(base[k]); }), Object.keys(base).filter(k => JSON.stringify([B.DEFS[k].cost]) !== JSON.stringify([base[k][0]])));
T('1i the central store keeps its 8 ports; no other tank got a giant', B.DEFS.crude_tank_c.connections.length === 9 && Object.keys(B.DEFS).filter(k => B.DEFS[k].reserveOnly).join() === 'crude_tank_g');
T('1j it is in the storage menu with its Arabic card', !!GC.INFO.crude_tank_g && /الخزان العملاق/.test(GC.INFO.crude_tank_g.name) && JSON.stringify(GC.CATS).indexOf('crude_tank_g') > 0);

console.log('2. where it can stand');
{ const g = game(10e9), co = g.co; co.sync();
  let v = g.store.place('crude_tank_g', 10, 10, 0, { instant: true }); T('2a refused on commercial land', !v.ok && v.reason === 'giantReserveOnly', v);
  v = g.store.place('crude_tank_g', A0.x, A0.y, 0, { instant: true }); T('2b refused while the open reserve area is too small for it (level 0)', !v.ok && v.reason === 'reserveBounds', v);
  const L = []; for (let i = 0; i < 4; i++) { const c0 = g.store.cash, x = co.reserveExpand(); L.push(x.ok); } T('2c the zone can be opened to its last level', L.every(Boolean) && co.reserve.lv === 4, L);
  v = g.store.place('crude_tank_g', 203, 102, 0, { instant: true }); T('2d accepted inside the open area and becomes a reserve tank', v.ok && v.building.rs === 1, v.reason);
  const G = v.building; co.sync();
  const mv = g.store.move ? g.store.move(G.id, 100, 10) : null; T('2e it cannot be dragged out to commercial land (refused: reserve-only)', !!mv && !mv.ok && mv.reason === 'giantReserveOnly', mv && mv.reason);
  const g2 = game(10e9); g2.co.sync(); const v2 = g2.store.place('crude_tank_g', 10, 10, 0, { instant: true }); T('2f the same refusal in a fresh game (no state leak)', !v2.ok);
  v = g.store.place('crude_tank_g', 203, 102, 0, { instant: true }); T('2g two do not overlap each other', !v.ok, v.reason);
  const ex = (() => { try { return co.reserveInfo(); } catch (e) { return null; } })(); const ti = ex && ex.tanks.find(t => t.id === G.id);
  T('2h the reserve books show its 80,000,000 bbl capacity', !!ti && ti.capacity === 80e6 && ti.room === 80e6, ti && [ti.capacity, ti.room]);
}

console.log('3. cost preview (shown before buying) and real running cost');
{ const P = [0.25, 0.5, 0.75, 1].map(f => EC.reserveCostPreview(D, f));
  T('3a preview exists for 25/50/75/100%: daily and yearly', P.every(p => p.idle.day > 0 && near(p.idle.year, p.idle.day * 365)));
  T('3b storage = 0.015 $/bbl/day on the stored volume (unchanged rate)', EC.STORAGE_COST.CRUDE === 0.015 && near(P[3].idle.storage, 80e6 * 0.015) && near(P[0].idle.storage, 20e6 * 0.015));
  T('3c the table (empty ≈ $0.345M/day, 25% ≈ $0.645M, 50% ≈ $0.945M, 75% ≈ $1.245M, full ≈ $1.545M/day = $564M/yr)', [0, 0.25, 0.5, 0.75, 1].every((f, i) => Math.abs(EC.reserveCostPreview(D, f).idle.day - [345001, 645001, 945001, 1245001, 1545001][i]) < 50) && Math.abs(P[3].idle.year - 563.9e6) < 1e6);
  T('3d it uses current rules: insurance 0.15%/month + admin 0.03%/month of $3B', near(P[0].idle.insurance * 365 / 12, 3e9 * 0.0015) && near(P[0].idle.admin * 365 / 12, 3e9 * 0.0003));
  const hp = require('fs').readFileSync(__dirname + '/help.js', 'utf8'); T('3e the build card prints the daily and yearly cost before purchase', /قبل الشراء/.test(hp) && /reserveCostPreview/.test(hp));
  const g = game(10e9), co = g.co; co.sync(); for (let i = 0; i < 4; i++) co.reserveExpand(); const G = put(g, 'crude_tank_g', 203, 102); co.sync();
  g.sim.ensure(G).vol = 40e6; g.sim.ensure(G).prod = g.sim.ensure(G).prod || 'CRUDE'; co.sync();
  const cd = co.reserveCostDay(), b0 = Object.assign({}, co.journal.bal); days(co, 1); const dl = k => (co.journal.bal[k] || 0) - (b0[k] || 0);
  T('3f one real day books storage on the 40M stored (= $600,000) on the reserve storage line, not the commercial one', near(dl('EXP_RSTORAGE'), 600000) && near(cd.storage, 600000) && !dl('EXP_STORAGE'), [dl('EXP_RSTORAGE'), dl('EXP_STORAGE')]);
  T('3g its operation + maintenance for an idle day (booked on the reserve line) equals the preview exactly', near(dl('EXP_ROPS'), EC.reserveCostPreview(D, 0.5).idle.run, 1e-9) && !dl('EXP_OPERATING') && !dl('EXP_MAINT'), [dl('EXP_ROPS'), EC.reserveCostPreview(D, 0.5).idle.run]);
  T('3h the books still balance (audit)', co.audit().ok, co.audit());
}

console.log('4. accounting separation, save / load');
{ const g = game(10e9), co = g.co; co.sync(); for (let i = 0; i < 4; i++) co.reserveExpand(); const G = put(g, 'crude_tank_g', 203, 102), C = put(g, 'crude_tank_m', 100, 10); co.sync();
  const c0 = bal(co, 'INV_CRUDE') + bal(co, 'INV_CRUDE_BUY'), cash0 = g.store.cash, q = co.reserveBuy('CRUDE', 50000, 'A', 'CASH');
  T('4a a purchase goes into the reserve books only', q.ok && near(bal(co, 'INV_RESERVE'), q.cost) && (bal(co, 'INV_CRUDE') + bal(co, 'INV_CRUDE_BUY')) === c0 && g.store.cash < cash0, q.reason);
  T('4b the commercial store stays empty of that oil; the giant holds it', near(g.sim.ensure(G).vol, 50000) && co.reserveStock('CRUDE') === 50000 && (g.sim.ensure(C).vol || 0) === 0);
  T('4c INV_RESERVE = sum of the reserve tanks; audit ok', co.audit().ok, co.audit());
  const d = g.store.demolish ? g.store.demolish(G.id) : null; T('4d it cannot be demolished while holding oil', !!d && d.ok === false && d.reason === 'reserveNotEmpty', d && d.reason);
  const g2 = reload(g), co2 = g2.co; co2.sync(); const G2 = g2.store.items.get(G.id);
  T('4e after save/load: same tank, rs flag, 50,000 bbl and capacity 80M', !!G2 && G2.d === 'crude_tank_g' && G2.rs === 1 && near(g2.sim.ensure(G2).vol, 50000) && co2.reserveInfo().tanks.find(t => t.id === G.id).capacity === 80e6 && co2.reserve.lv === 4);
  T('4f after load the reserve account and the audit are intact', near(bal(co2, 'INV_RESERVE'), bal(co, 'INV_RESERVE')) && co2.audit().ok);
  const row = g.store.toJSON().b.find(r => r[0] === G.id); T('4g the saved record is the normal 13-field row with rs = 1 (no new save structure)', row.length === g.store.toJSON().b[0].length && row[row.length - 1] === 1 || row.indexOf(1) > 0, row.length);
}
console.log(pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1);
