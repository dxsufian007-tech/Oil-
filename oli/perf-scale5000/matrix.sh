#!/bin/bash
# matrix.sh <outdir> <reps> <scene:hours>...   runs every configuration (interleaved) and writes <outdir>/<scene>-<cfg>-r<n>.txt  (measure-real.js, --trace-gc)
OUT=$1; R=$2; shift 2; mkdir -p $OUT; cd /tmp/wt-s1/oli/perf-scale5000; export NODE_PATH=/opt/npm-tools/node_modules
declare -A CFG=(
 [orig]='{"hopShare":0,"pcSparse":0,"trDefault":0,"rcvSkip":0,"hopFreezeSkip":0}'
 [s2a]='{"hopShare":1,"pcSparse":1,"trDefault":0,"rcvSkip":0,"hopFreezeSkip":0}'
 [s2b]='{"hopShare":1,"pcSparse":1,"trDefault":2,"rcvSkip":0,"hopFreezeSkip":0}'
 [rcvonly]='{"hopShare":0,"pcSparse":0,"trDefault":0,"rcvSkip":1,"hopFreezeSkip":0}'
 [s2a_rcv]='{"hopShare":1,"pcSparse":1,"trDefault":0,"rcvSkip":1,"hopFreezeSkip":0}'
 [best]='{"hopShare":1,"pcSparse":1,"trDefault":0,"rcvSkip":1,"hopFreezeSkip":1}'
 [best_tree]='{"hopShare":1,"pcSparse":1,"trDefault":2,"rcvSkip":1,"hopFreezeSkip":1}')
for r in $(seq $R); do for e in "$@"; do sc=${e%%:*}; H=${e##*:}; n=$(basename $sc .json); [ $sc = real ] && n=real; [[ $sc == /tmp/scenes/* ]] && n=C-$n; [[ $sc == /tmp/scenes3/* ]] && n=C-$n; [[ $sc == /tmp/scenes4/* ]] && n=M-$n
  for c in orig s2a s2b rcvonly s2a_rcv best best_tree; do CN="${CFG[$c]}" node --expose-gc --trace-gc --max-old-space-size=6000 measure-real.js $sc $H > $OUT/$n-$c-r$r.txt 2>&1; done; done; done
echo done > $OUT/done
