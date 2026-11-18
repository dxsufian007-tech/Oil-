import json,glob,collections,sys
p=json.load(open(glob.glob(sys.argv[1]+'/*.cpuprofile')[0]))
lines=collections.Counter(); fns=collections.Counter()
for n in p['nodes']:
    cf=n['callFrame']; u=cf['url'].split('/')[-1]
    if u in('worldmap.js',): continue
    for pt in n.get('positionTicks',[]): lines[(u,pt['line'])]+=pt['ticks']; fns[(u,cf['functionName'] or '(anon)',cf['lineNumber']+1)]+=pt['ticks']
tot=sum(lines.values())
print('TOP FUNCTIONS (self, share of non-map ticks)');[print('%5.1f%%'%(100*t/tot),k) for k,t in fns.most_common(int(sys.argv[2]))]
print('TOP LINES');[print('%5.1f%%'%(100*t/tot),k) for k,t in lines.most_common(int(sys.argv[3]))]
