import json,glob,collections,sys
p=json.load(open(glob.glob(sys.argv[1]+'/*.cpuprofile')[0]))
nodes={n['id']:n for n in p['nodes']}; parent={}
for n in p['nodes']:
    for c in n.get('children',[]): parent[c]=n['id']
self=collections.Counter()
for sid,dt in zip(p['samples'],p['timeDeltas']): self[sid]+=dt
def name(n): cf=n['callFrame']; return (cf['url'].split('/')[-1],cf['functionName'] or '(anon)',cf['lineNumber']+1)
incl=collections.Counter(); 
for sid,t in self.items():
    seen=set(); x=sid
    while x is not None:
        k=name(nodes[x])
        if k not in seen: incl[k]+=t; seen.add(k)
        x=parent.get(x)
adv=[k for k in incl if k[1]=='advanceHours']
tot=incl[adv[0]] if adv else sum(self.values())
print('advanceHours total ms',tot/1000)
for k,t in incl.most_common(int(sys.argv[2])+40):
    if k[0] in('central.js','industry.js','economy.js','building-config.js') : print('%5.1f%%'%(100*t/tot),k)
