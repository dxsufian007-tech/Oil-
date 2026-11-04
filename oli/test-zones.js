/* Phase 2 of the oil system: exploration zones. The map is divided into zones (one per region) of very different geology; the real reserve stays hidden until the zone is evaluated.
 *   node oli/test-zones.js */
const { createWorld, CONFIG } = require('./worldmap.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const W = createWorld({ seed: 20260101 }), Z = W.regions.map(r => W.zoneInfo(r.id)), trueOf = r => W.regionSites(r.id).filter(s => s.kind === 'FIELD').reduce((a, s) => a + s.initialReserve, 0);
const E = createWorld({ seed: 20260101 }); E.regions.forEach(r => E.evaluateZone(r.id)); const EV = E.regions.map(r => E.zoneInfo(r.id));

console.log('1. every zone has the required properties');
T('1a the map is divided into ' + Z.length + ' zones', Z.length === 24 && Z.every(z => z));
T('1b every zone has area, geology, depth, discovery probability, reserve estimate, exploration cost, drilling difficulty and expected quality',
  Z.every(z => z.areaKm2 > 0 && z.geology.basin && z.geology.formation && z.depthRange.length === 2 && z.depthRange[0] < z.depthRange[1] && z.discoveryProbability >= 0 && z.discoveryProbability <= 1 && z.reserveRange.length === 2 && z.exploreCost > 0 && z.evaluateCost > 0 && z.drillingDifficulty >= 1 && z.drillingDifficulty <= 5 && z.expectedQuality.LOW >= 0), Z[0]);
T('1c zones differ in cost and difficulty (not all alike)', new Set(Z.map(z => z.exploreCost)).size >= 4 && new Set(Z.map(z => z.drillingDifficulty)).size >= 3);

console.log('2. the zones are very uneven');
const cls = k => EV.filter(z => z.potentialClass === k).length;
T('2a all five classes exist: rich ' + cls('RICH') + ', promising ' + cls('PROMISING') + ', medium ' + cls('MEDIUM') + ', weak ' + cls('WEAK') + ', non-commercial ' + cls('NON_COMMERCIAL'), ['RICH', 'PROMISING', 'MEDIUM', 'WEAK', 'NON_COMMERCIAL'].every(k => cls(k) >= 1));
const tot = W.regions.map(trueOf).filter(v => v > 0);
T('2b the richest zone holds at least 10 times the oil of the poorest commercial one (' + Math.round(Math.max(...tot) / 1e6) + 'M vs ' + Math.round(Math.min(...tot) / 1e6) + 'M bbl)', Math.max(...tot) / Math.min(...tot) >= 10);
T('2c the class really follows the oil in the ground', W.regions.every((r, i) => { const t = trueOf(r), k = EV[i].potentialClass, C = CONFIG.ZONE_CLASS; return k === 'NON_COMMERCIAL' ? t === 0 : t >= C[k].min; }));

console.log('3. non-commercial zones');
const NC = W.regions.filter((r, i) => EV[i].potentialClass === 'NON_COMMERCIAL');
T('3a they contain no real field, only dry prospects', NC.every(r => W.regionSites(r.id).every(s => s.kind === 'DRY') && W.regionSites(r.id).length > 0));
T('3b a dry prospect can never be made drillable there', NC.every(r => { const s = W.regionSites(r.id)[0]; W.discover(s.id); W.survey(s.id); return W.makeDrillable(s.id).reason === 'dry'; }));
T('3c the starter zone and the zones open at the start are commercial', W.regions.filter(r => r.unlocked).every(r => !r.nonCommercial && trueOf(r) > 0));
T('3d evaluated: reported as not commercial with a zero reserve', EV.filter(z => z.potentialClass === 'NON_COMMERCIAL').every(z => z.commercial === false && z.reserveRange[0] === 0 && z.reserveRange[1] === 0 && z.discoveryProbability === 0));

console.log('4. the real reserve is hidden before the evaluation');
const secret = W.regions.map(trueOf);
T('4a the player-facing data of a zone has no field named like the real data', Z.every(z => !('total' in z) && !('trueReserve' in z) && !('initialReserve' in z) && !('real' in z) && !('cls' in z)));
T('4b before the evaluation the reserve is only a wide range for the rough class (the same for equal classes), not the real number', Z.every(z => z.assessment === 'PRIOR' && z.reserveRange[1] / Math.max(1, z.reserveRange[0]) >= 2.5 && z.estimatedReserve === undefined) && !Z.some((z, i) => secret[i] > 0 && JSON.stringify(z).includes(String(secret[i]))));
const right = Z.filter((z, i) => z.potentialClass === (EV[i].potentialClass === 'NON_COMMERCIAL' ? 'WEAK' : EV[i].potentialClass)).length;
T('4c the rough class is often right but not always (' + right + ' of ' + Z.length + ')', right >= 8 && right <= 22);
T('4d the prior never says "non-commercial": it cannot be told from a weak zone', Z.every(z => z.potentialClass !== 'NON_COMMERCIAL'));

console.log('5. evaluating a zone');
const r0 = W.regions[10], before = W.zoneInfo(r0.id), ev = W.evaluateZone(r0.id), after = W.zoneInfo(r0.id);
T('5a the first evaluation succeeds and reports its cost (the caller charges it)', ev.ok && ev.cost === before.evaluateCost && ev.cost > 0, ev);
T('5b a second evaluation of the same zone is refused', W.evaluateZone(r0.id).reason === 'done');
T('5c the evaluated zone says so and has a narrower reserve range than the prior', after.assessment === 'EVALUATED' && after.evaluated && (after.reserveRange[1] - after.reserveRange[0]) < (before.reserveRange[1] - before.reserveRange[0]), [before.reserveRange, after.reserveRange]);
T('5d the evaluated range brackets the real reserve of every zone (an estimate, but an honest one)', W.regions.every((r, i) => { const z = EV[i], t = secret[i]; return z.reserveRange[0] <= t && t <= z.reserveRange[1]; }));
T('5e but the evaluation is not exact (the estimate is never the real number)', EV.filter((z, i) => secret[i] > 0).every((z, k) => z.estimatedReserve !== W.regions.filter((r, i) => secret[i] > 0).map(trueOf)[k]));
T('5f the evaluated depth range and discovery probability come from the real sites', EV.filter(z => z.commercial).every(z => z.depthRange[0] > 0 && z.discoveryProbability > 0 && z.discoveryProbability < 1));

console.log('6. save and restore, determinism');
const snap = E.zoneSnapshot(), F = createWorld({ seed: 20260101 }); F.restoreZones(snap);
T('6a the evaluated zones are saved and come back', snap.length === 24 && F.regions.every(r => F.zoneInfo(r.id).evaluated) && JSON.stringify(F.zoneInfo(3)) === JSON.stringify(E.zoneInfo(3)));
const G = createWorld({ seed: 20260101 }), H = createWorld({ seed: 99 });
T('6b the same seed gives the same zones', JSON.stringify(G.regions.map(r => G.zoneInfo(r.id))) === JSON.stringify(Z));
H.regions.forEach(r => H.evaluateZone(r.id));
T('6c another seed gives another map', JSON.stringify(H.regions.map(r => H.zoneInfo(r.id).potentialClass)) !== JSON.stringify(EV.map(z => z.potentialClass)));
T('6d other seeds also contain every class on the whole (checked on 5 seeds, at least 4 classes each)', [1, 2, 3, 4, 5].every(sd => { const w = createWorld({ seed: sd }); w.regions.forEach(r => w.evaluateZone(r.id)); return new Set(w.regions.map(r => w.zoneInfo(r.id).potentialClass)).size >= 4; }));

console.log('\nEXPLORATION ZONE TESTS: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
