#!/bin/bash
# usage: ab-quick.sh <scene> <hours> <reps> <JSON A> <JSON B>   -> mean ms/h and heap for A and B, interleaved
sc=$1; H=$2; R=$3; A=$4; B=$5
for r in $(seq $R); do for v in A B; do ov=$A; [ $v = B ] && ov=$B
 CN="$ov" node --expose-gc --trace-gc --max-old-space-size=6000 measure.js $sc $H > /tmp/res/s3/ab-$v-$r.txt 2>&1; done; done
python3 - $R <<'PY'
import json,re,sys
R=int(sys.argv[1])
for v in 'AB':
    m=[];h=[];g=[]
    for r in range(1,R+1):
        t=open('/tmp/res/s3/ab-%s-%d.txt'%(v,r)).read();x=json.loads(t[t.index('{\n "winStartMs"'):][:t[t.index('{\n "winStartMs"'):].rindex('}')+1]);a,b=x['winStartMs'],x['winEndMs'];gc=0
        for l in t.split('\n'):
            q=re.search(r'\]\s+(\d+) ms: (Mark-Compact|Scavenge|Mark-sweep)[^\n]*?MB, [^,]*, ([\d.]+) / [\d.]+ ms',l)
            if q and a<=int(q.group(1))<=b: gc+=float(q.group(3))
        m.append(x['hourMs']['mean']);h.append(x['memMB']['heapAfter']);g.append(gc)
    print(v,'ms/h',' '.join('%.1f'%y for y in m),'mean %.1f'%(sum(m)/len(m)),'| heap',' '.join('%.0f'%y for y in h),'| GC ms',' '.join('%.0f'%y for y in g))
PY
