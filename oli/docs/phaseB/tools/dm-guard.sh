#!/bin/bash
# B7 guard: for each seed the full-state digest must be identical with the deliver memo off (DM=0), in shadow (DM=1) and on (DM=2); shadow must report 0 mismatches.  Usage: ROOT=<oli> dm-guard.sh [from] [to] [steps]
D=$(dirname "$0"); FROM=${1:-1}; TO=${2:-60}; STEPS=${3:-150}; bad=0; hit=0; calls=0; ver=0; rep=0
for s in $(seq $FROM $TO); do
  a=$(ROOT=$ROOT SEED=$s STEPS=$STEPS DM=0 node $D/simfuzz.js 2>/dev/null | tail -1); b=$(ROOT=$ROOT SEED=$s STEPS=$STEPS DM=1 node $D/simfuzz.js 2>/dev/null | tail -1); c=$(ROOT=$ROOT SEED=$s STEPS=$STEPS DM=2 node $D/simfuzz.js 2>/dev/null | tail -1)
  da=$(echo "$a" | python3 -c "import sys,json;print(json.loads(sys.stdin.read())['dig'])"); db=$(echo "$b" | python3 -c "import sys,json;print(json.loads(sys.stdin.read())['dig'])"); dc=$(echo "$c" | python3 -c "import sys,json;print(json.loads(sys.stdin.read())['dig'])")
  mm=$(echo "$b" | python3 -c "import sys,json;d=json.loads(sys.stdin.read())['dm'];print(d['mismatch'],d['verified'])"); st=$(echo "$c" | python3 -c "import sys,json;d=json.loads(sys.stdin.read())['dm'];print(d['hit'],d['calls'],d['replayed'])")
  set -- $mm; mis=$1; ver=$((ver+$2)); set -- $st; hit=$((hit+$1)); calls=$((calls+$2)); rep=$((rep+$3))
  if [ "$da" != "$db" ] || [ "$da" != "$dc" ] || [ "$mis" != "0" ]; then echo "FAIL seed $s: off=$da shadow=$db on=$dc mismatch=$mis"; bad=$((bad+1)); fi
done
echo "seeds $FROM..$TO: failures=$bad  on-mode lookups=$calls hits=$hit replayed=$rep  shadow verified=$ver"; [ $bad -eq 0 ]
