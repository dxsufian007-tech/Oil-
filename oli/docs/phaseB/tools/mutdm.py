#!/usr/bin/env python3
"""B7: mutants of the deliver memo (central.js + industry.js), each run against dm-guard.sh on the seeds given.  A mutant is DETECTED when the guard exits non-zero (a digest differs between off / shadow / on, or shadow reports a mismatch).
usage: ONLY=D2,D5 python3 mutdm.py <tree> <scratch-dir> <simfuzz seeds> [steps] [realfuzz seeds] [realfuzz steps]"""
import os, subprocess, sys
T = os.path.abspath(sys.argv[1]); W = os.path.abspath(sys.argv[2]); SEEDS = sys.argv[3].split(','); STEPS = sys.argv[4] if len(sys.argv) > 4 else '100'; TOOLS = os.path.join(T, 'docs/phaseB/tools'); REALSEEDS = (sys.argv[5] if len(sys.argv) > 5 else '1,2,3').split(','); REALSTEPS = sys.argv[6] if len(sys.argv) > 6 else '30'
C = open(os.path.join(T, 'central.js')).read(); I = open(os.path.join(T, 'industry.js')).read()
SITES = ["this._cv++; const acc = this.offer(b, 'WATER_OUT'", "this._cv++; const acc = this.split(b, ports, { prod: def.product, r, oil: 1 - wf, gas: 0, wat: wf, bf, p: SIM.tankHeadPsi }", "this._cv++; const acc = this.split(b, ports, { prod: P.CRUDE", "this._cv++; const acc = this.split(b, tOuts"]
M = [   # (name, file, old, new)
 ('D2 accept commit does not invalidate', 'I', "vis.delete(b.id); if (commit && acc > 0) this._cv++; }", "vis.delete(b.id); }"),
 ('D3 step start does not invalidate', 'I', "let Y = 0; this._cv++;", "let Y = 0;"),
 ('D4a top-level site: water draw', 'I', SITES[0], SITES[0].replace("this._cv++; ", "")),
 ('D4b top-level site: tank group', 'I', SITES[1], SITES[1].replace("this._cv++; ", "")),
 ('D4c top-level site: wells', 'I', SITES[2], SITES[2].replace("this._cv++; ", "")),
 ('D4d top-level site: tanks', 'I', SITES[3], SITES[3].replace("this._cv++; ", "")),
 ('D5 _apply does not invalidate', 'C', "this._dv++; if (CI[ch] !== undefined)", "if (CI[ch] !== undefined)"),
 ('D6 flow fields ignored', 'C', "&& sameFlow(f, e.f) &&", "&&"),
 ('D7 visited set ignored', 'C', "&& sameVis(vis, e.vis) &&", "&&"),
 ('D8 effects not replayed', 'C', "if (fx.length) { S.replayed++; replayFx(sim, fx); }", "if (fx.length) { S.replayed++; }"),
 ('D9 begin/epoch ignored', 'C', "e.ep === this._plE && e.eb === sim._eb", "e.eb === sim._eb"),
 ('D10 edge table ignored', 'C', "e.ep === this._plE && e.eb === sim._eb", "e.ep === this._plE"),
 ('D11 pump snapshot ignored', 'C', "&& sameVis(vis, e.vis) && this._plPumpsSame(e.pf, this._pxList(ch));", "&& sameVis(vis, e.vis);"),
 ('D12 nested effects not passed up', 'C', "if (prev) for (let i = 0; i < rec.length; i++) prev.push(rec[i]);", ""),
 ('D13 replay in reverse order', 'C', "for (let i = 0; i < fx.length; i += 3) { const s = fx[i]", "for (let i = fx.length - 3; i >= 0; i -= 3) { const s = fx[i]"),
 ('D14 version of the sim ignored', 'C', "e.sim === sim && e.cv === sim._cv && e.dv === this._dv", "e.sim === sim && e.dv === this._dv"),
 ('D15 refinery _blk not recorded', 'I', "s._blkPort = port; if (this._fxr) this._fxr.push(s, 1, port); }", "s._blkPort = port; }"),
 ('D16 pIn of pumps not recorded', 'I', "s._off = Math.max(s._off || 0, f.r); s.pIn = f.p; if (this._fxr) this._fxr.push(s, 0, f.p);\n            if (f.p < c0.minInletPsi)", "s._off = Math.max(s._off || 0, f.r); s.pIn = f.p;\n            if (f.p < c0.minInletPsi)"),
 ('D17 graph rev ignored', 'C', "if (this._dmRev !== this.rev) {", "if (false) {"),
]
env = {**os.environ, 'NODE_OPTIONS': '--preserve-symlinks --preserve-symlinks-main'}
only = os.environ.get('ONLY'); bad = 0
for n, f, a, b in M:
    if only and n.split()[0] not in only.split(','): continue
    src = C if f == 'C' else I; assert src.count(a) == 1, (n, src.count(a))
    d = os.path.join(W, n.split()[0]); os.makedirs(d, exist_ok=True)
    for e in os.listdir(T):
        l = os.path.join(d, e)
        if e not in ('central.js', 'industry.js') and not os.path.lexists(l): os.symlink(os.path.join(T, e), l)
    open(os.path.join(d, 'central.js'), 'w').write(src.replace(a, b) if f == 'C' else C); open(os.path.join(d, 'industry.js'), 'w').write(src.replace(a, b) if f == 'I' else I)
    det = False; last = 'all seeds equal'
    import json
    runs = [('realfuzz.js', sd, REALSTEPS, {}) for sd in REALSEEDS] + [('simfuzz.js', sd, STEPS, {'DENSE': '1'}) for sd in SEEDS]
    for script, sd, st, ex in runs:
        outs = []
        for dm in ('0', '1', '2'):
            r = subprocess.run(['node', os.path.join(TOOLS, script)], env={**env, 'ROOT': d, 'SEED': sd, 'STEPS': st, 'DM': dm, **ex}, capture_output=True, text=True, timeout=115)
            try: outs.append(json.loads(r.stdout.strip().splitlines()[-1]))
            except Exception as ex2: outs.append({'dig': 'ERR ' + (r.stderr or '')[-160:], 'dm': {'mismatch': 0}})
        if outs[0]['dig'] != outs[1]['dig'] or outs[0]['dig'] != outs[2]['dig'] or outs[1]['dm']['mismatch'] > 0:
            det = True; last = '%s seed %s digests off/shadow/on %s %s %s mismatch=%s' % (script, sd, outs[0]['dig'][:8], outs[1]['dig'][:8], outs[2]['dig'][:8], outs[1]['dm']['mismatch']); break
    print(n, '->', 'DETECTED' if det else 'MISSED', '|', last, flush=True); bad += not det
sys.exit(1 if bad else 0)
