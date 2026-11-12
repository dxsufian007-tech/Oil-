/* Phase A: the diagnostic wrappers do not change the game.  One process per MODE (the world is a module-level singleton, so every mode starts from a fresh process).
 *   ROOT=<oli dir> MODE=off|count|t1|t2all node identity-central.js
 * Scene: the real world with the central network (a large refinery wired to tapped stations, crude from far stations, product tanks) AND real oil fields (wells drilled on
 * real fields, tanks, pipes).  24 h in one go with a daily sale, then 24 h in the smallest slices the live game can use (run() with ~0 budget, screens reading while an hour is open).
 * Output: one line with the sha-256 of the whole state (company + store + pipes + central), the cash as an exact double, the hours, and what the wrappers saw. */
const path = require('path'), fs = require('fs'), crypto = require('crypto'), ROOT = process.env.ROOT || path.join(__dirname, '../../..'), MODE = process.env.MODE || 'off';
const K = require(path.join(ROOT, 'test-central-kit.js')), { I, B, C, world } = K;
global.window = global; global.document = { addEventListener() { }, createElement() { return { style: {}, setAttribute() { }, appendChild() { }, querySelector() { return null; }, addEventListener() { } }; }, body: { appendChild() { } } }; const si = global.setInterval; global.setInterval = () => 0;
require(path.join(ROOT, 'live-diag.js')); global.setInterval = si; const PA = window.OliLiveDiag.pa;
const { g, co, fieldWells } = require('./scene-central.js').build(), world_ = world;
const protoSrc = () => [Object.getPrototypeOf(co), Object.getPrototypeOf(g.sim), Object.getPrototypeOf(g.net.central), Object.getPrototypeOf(co.store)].map(P => Object.getOwnPropertyNames(P).map(n => { const d = Object.getOwnPropertyDescriptor(P, n); return n + ':' + (typeof d.value === 'function' ? Function.prototype.toString.call(d.value) : '') }).join('|')).join('##');
const before = protoSrc(), Lb = { company: co, store: g.store, sim: g.sim };
let inst = null; const every = new Map(); for (const P of [Object.getPrototypeOf(co), Object.getPrototypeOf(g.sim), Object.getPrototypeOf(g.net.central), Object.getPrototypeOf(co.store), Object.getPrototypeOf(co.market), Object.getPrototypeOf(g.net)]) for (const n of Object.getOwnPropertyNames(P)) every.set(P.constructor.name + '.' + n, 1);
if (MODE === 'count') inst = PA.install(Lb, PA.cfg.count()); else if (MODE === 't1') inst = PA.install(Lb, PA.cfg.t1()); else if (MODE === 'mid') inst = null; else if (MODE === 't2all') inst = PA.install(Lb, PA.cfg.t2(every, 1e12));
const during = protoSrc() !== before, SELLP = ['CRUDE', 'GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS'];
for (let left = 24; left > 0;) { const h = Math.min(24, left); co.advanceHours(h); left -= h; if (h === 24) for (const p of SELLP) { const q = Math.floor(co.available(p) * 0.5); if (q > 0) co.sell(p, q); } }
let slices = 0, done = 0; while (done < 24) { done += co.run(!co.midHour && co.acc < 1 ? 1 : 0, 1e-9); slices++; if (MODE === 'mid') { if (slices === 40) inst = PA.install(Lb, PA.cfg.t1()); if (slices === 125 && inst) { inst.remove(); } } if (co.midHour && slices % 3 === 0) { for (const p of SELLP) co.available(p); for (const b of g.store.list().slice(0, 40)) { g.sim.status(b); co.economics(b.id); } } } co.settle();
const calls = inst ? Object.fromEntries([...inst.stats].filter(([k]) => /^CentralNet\.(toStation|plan|path)$/.test(k) || k === 'Sim.split').map(([k, s]) => [k, s.calls])) : null, hrs = inst ? inst.H.hours.length : 0;
if (inst) inst.remove(); const midOpen = MODE === 'mid';
const strip = o => { if (o && typeof o === 'object') { for (const k of ['lastSim', 'savedAt']) delete o[k]; for (const k in o) strip(o[k]); } return o; };
const snap = JSON.stringify(strip(JSON.parse(JSON.stringify({ eco: co.toJSON(), store: g.store.toJSON({ live: true }), net: g.net.toJSON() }))));
console.log(JSON.stringify({ mode: MODE, hours: co.hours, cash: g.store.cash, cashBits: Buffer.from(new Float64Array([g.store.cash]).buffer).toString('hex'), sha: crypto.createHash('sha256').update(snap).digest('hex').slice(0, 24), len: snap.length, buildings: g.store.items.size, fieldWells, central: !!g.net.central, slices, wrappedDuring: during, restoredAfter: protoSrc() === before, seen: calls, genHours: hrs }));
