#!/bin/bash
# abreal.sh <hours> <reps> <treeA oli> <treeB oli> [scene=real]: best config (S2a+rcvSkip+freezeSkip, tree off), two code trees, interleaved
H=$1;R=$2;A=$3;B=$4;SC=${5:-real};CN='{"hopShare":1,"pcSparse":1,"trDefault":0,"rcvSkip":1,"hopFreezeSkip":1}'; export NODE_PATH=/opt/npm-tools/node_modules
for r in $(seq $R); do for v in A B; do d=$A; [ $v = B ] && d=$B; (cd $d/perf-scale5000 && CN="$CN" node --expose-gc --trace-gc measure-real.js $SC $H > /tmp/res/s5-$v-$r.txt 2>&1); done; done
python3 - $R <<'PY'
import json,re,sys,statistics as st
R=int(sys.argv[1]);out={}
for v in 'AB':
    m=[];h=[];g=[]
    for r in range(1,R+1):
        t=open('/tmp/res/s5-%s-%d.txt'%(v,r)).read();j=t[t.index('{\n "winStartMs"'):];x=json.loads(j[:j.rindex('}')+1]);a,b=x['winStartMs'],x['winEndMs'];gc=0
        for l in t.split('\n'):
            q=re.search(r'\]\s+(\d+) ms: (Mark-Compact|Scavenge|Mark-sweep)[^\n]*?MB, [^,]*, ([\d.]+) / [\d.]+ ms',l)
            if q and a<=int(q.group(1))<=b: gc+=float(q.group(3))
        m.append(x['hourMs']['mean']);h.append(x['memMB']['heapAfter']);g.append(gc)
    out[v]=st.median(m);print(v,'ms/h',' '.join('%.1f'%y for y in sorted(m)),'| median %.2f'%st.median(m),'| heap %.0f'%st.median(h),'| GC ms %.0f'%st.median(g))
print('delta B vs A: %+.1f%%'%(100*(out['B']/out['A']-1)))
PY
