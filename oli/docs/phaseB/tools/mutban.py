#!/usr/bin/env python3
"""B4: mutants of the extended path cache (x1..x5) of central.js, run against ban-guard.js (and optionally fuzz2).  A mutant is DETECTED when the guard exits with a non-zero code.
usage: python3 mutban.py <tree> <scratch-dir>   (needs SAVE; ORIG_ROOT for the optional fuzz2 run)"""
import os, subprocess, sys
T = os.path.abspath(sys.argv[1]); W = os.path.abspath(sys.argv[2]); TOOLS = os.path.join(T, 'docs/phaseB/tools')
src = open(os.path.join(T, 'central.js')).read()
M = {
 'x1 no clear of the extended cache when a saturation flips': ("{ this._pcA[CI[ch]] = null; this._pcB[CI[ch]] = null; if (this.pcStats)", "{ this._pcA[CI[ch]] = null; if (this.pcStats)"),
 'x2 over predicate check skipped': ("_overKeepsPredicate(over) { const U = this._used;", "_overKeepsPredicate(over) { return true; const U = this._used;"),
 'x3 ban key ignores the banned segment': ("sub = bx + 2; }", "sub = 2; }"),
 'x4 the extended cache survives begin()': ("_pcClearAll(why) { for (let i = 0; i < NCH; i++) { this._pcA[i] = null; this._pcB[i] = null; }", "_pcClearAll(why) { for (let i = 0; i < NCH; i++) { this._pcA[i] = null; }"),
 'x5 bias entries share the plain key': ("else if (bias) sub = 1;", "else if (bias) sub = 0;"),
}
env = {**os.environ, 'NODE_OPTIONS': '--preserve-symlinks --preserve-symlinks-main'}
bad = 0
for n, (a, b) in M.items():
    assert src.count(a) == 1, n
    d = os.path.join(W, n.split()[0]); os.makedirs(d, exist_ok=True)
    for e in os.listdir(T):
        l = os.path.join(d, e)
        if e != 'central.js' and not os.path.lexists(l): os.symlink(os.path.join(T, e), l)
    open(os.path.join(d, 'central.js'), 'w').write(src.replace(a, b))
    r = subprocess.run(['node', os.path.join(TOOLS, 'ban-guard.js')], env={**env, 'ROOT': d}, capture_output=True, text=True, timeout=110)
    last = (r.stdout.strip().splitlines() or ['?'])[-1]
    print(n, '->', 'DETECTED' if r.returncode != 0 else 'MISSED', '|', last)
    bad += r.returncode == 0
sys.exit(1 if bad else 0)
