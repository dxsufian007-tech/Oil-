#!/usr/bin/env python3
"""B6: nine mutants (P1..P9) of the plan() memo of central.js, run against plan-guard.js.  A mutant is DETECTED when the guard exits non-zero.
usage: python3 mutplan.py <tree> <scratch-dir>   (needs SAVE)"""
import os, subprocess, sys
T = os.path.abspath(sys.argv[1]); W = os.path.abspath(sys.argv[2]); TOOLS = os.path.join(T, 'docs/phaseB/tools')
src = open(os.path.join(T, 'central.js')).read()
M = {
 'P1 _apply does not invalidate the channel': ("      if (CI[ch] !== undefined) this._plV[CI[ch]]++;      // B6: every use of this channel invalidates its memoised plans\n", ""),
 'P2 rev ignored': ("if (this._plRev !== this.rev) {", "if (false) {"),
 'P3 begin() does not invalidate': ("begin(dt) { this._plE++; this._graph();", "begin(dt) { this._graph();"),
 'P4 pump snapshot ignores the fault flag': ("if (pf[j] !== p.fault || pf[j + 1] !== p.dir", "if (pf[j + 1] !== p.dir"),
 'P5 key ignores r': ("&& Object.is(e.r, r) && Object.is(e.p, p0) &&", "&& Object.is(e.p, p0) &&"),
 'P6 key ignores p0': ("&& Object.is(e.r, r) && Object.is(e.p, p0) &&", "&& Object.is(e.r, r) &&"),
 'P7 over with entries is memoised': ("from === to || (over && over.size)) { if (m !== 0) this.plStats.bypass++;", "from === to) { if (m !== 0) this.plStats.bypass++;"),
 'P8 null answers are not stored': ("e.r = r; e.p = p0; e.res = res; this._plPumpsSnap", "e.r = r; e.p = p0; if (res) e.res = res; this._plPumpsSnap"),
 'P9 stamp of the wrong channel': None,
 'P10 pump snapshot ignores the direction (extra)': ("|| pf[j + 1] !== p.dir ||", "||"),
}
env = {**os.environ, 'NODE_OPTIONS': '--preserve-symlinks --preserve-symlinks-main'}
bad = 0
for n, mu in M.items():
    if mu is None:
        a1 = "e.v === this._plV[ci] &&"; a2 = "e.v = this._plV[ci]; e.r = r;"
        assert src.count(a1) == 1 and src.count(a2) == 1, n
        code = src.replace(a1, "e.v === this._plV[(ci + 1) % NCH] &&").replace(a2, "e.v = this._plV[(ci + 1) % NCH]; e.r = r;")
    else:
        a, b = mu; assert src.count(a) == 1, n; code = src.replace(a, b)
    d = os.path.join(W, n.split()[0]); os.makedirs(d, exist_ok=True)
    for e in os.listdir(T):
        l = os.path.join(d, e)
        if e != 'central.js' and not os.path.lexists(l): os.symlink(os.path.join(T, e), l)
    open(os.path.join(d, 'central.js'), 'w').write(code)
    r = subprocess.run(['node', os.path.join(TOOLS, 'plan-guard.js')], env={**env, 'ROOT': d}, capture_output=True, text=True, timeout=110)
    last = (r.stdout.strip().splitlines() or ['?'])[-1]
    print(n, '->', 'DETECTED' if r.returncode != 0 else 'MISSED', '|', last)
    bad += r.returncode == 0
sys.exit(1 if bad else 0)
