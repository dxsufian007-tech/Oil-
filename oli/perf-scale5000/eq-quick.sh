#!/bin/bash
# eq-quick.sh <A json> <B json> : hour-by-hour equality on the real save and three scenes (short)
cd /tmp/wt-s1/oli/perf-scale5000
for e in real:12 /tmp/scenes/scene-1000.json:6 /tmp/scenes4/scene-3000.json:6 /tmp/scenes4/scene-5000.json:4; do w=${e%%:*}; h=${e##*:}; node eq-hours.js $w $h "$1" "$2" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['what'],'hours',d['hours'],'DIFF',d['hoursDifferent'],'secA',d['secA'],'secB',d['secB'])"; done
