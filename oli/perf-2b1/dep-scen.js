// faults / reconnection / full tanks / throttles injected every hour on the REAL save, shadow on vs off with the same seeded perturbations.  node dep-scen.js <gameDir> [hours]
const dir=process.argv[2], HRS=+process.argv[3]||36; process.chdir(dir); const fs=require('fs');
function boot(){ const { I, B, world } = require(dir+'/test-central-kit.js'), E=require(dir+'/economy.js'); const d=JSON.parse(fs.readFileSync((process.env.SAVE||'/home/claude/dxsufian007-tech/oil-/oli/local-saves/realsave.json'),'utf8'));
  const ts=B.fromWorld(world); if(d.wd){world.restoreProgress(d.wd.p);world.restoreReserve(d.wd.r);world.restoreZones(d.wd.z);} const r0=B.BuildingStore.fromJSON(ts,d.store,{cash:d.cash}),store=r0.store;store.cash=d.cash;const net=I.PipeNet.fromJSON(ts.W,d.net),sim=new I.Sim(store,net),co=new E.Company(store,net,sim,{now:()=>1e12});co.fromJSON(d.eco);co.setSpeed(0);for(const b of store.list())sim.ensure(b); return {I,B,store,net,sim,co}; }
const snap=g=>{ let prod=0,stock=0,flow=0; for(const b of g.store.list()){ const s=g.sim.ensure(b),def=g.B.DEFS[b.d]; if(def.type==='well')prod+=s._out||0; if(def.type==='tank'||def.type==='gas')stock+=s.vol||0; } for(const L of g.net.lines.values())flow+=L.flow||0; const C=g.net.central,ch=[]; if(C)for(const k in C.ch)ch.push(C.ch[k].flow,C.ch[k].pressure); return [prod,stock,flow,g.store.cash,...ch]; };
function rngf(seed){ let s=seed>>>0; return()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; }
function run(dep){ const g=boot(), cn=g.net.central, R=rngf(+process.argv[4]||12345); cn.setDeliverMode(2); if(dep)cn.setDepMode(1); const pumps=[...cn.pumps.keys()], segs=[...cn.seg.keys()], chs=Object.keys(cn.ch); const tanks=g.store.list().filter(b=>{const t=g.B.DEFS[b.d].type; return t==='tank'||t==='gas';}), refs=g.store.list().filter(b=>g.B.DEFS[b.d].type==='refinery'); const out=[], log={pumpFault:0,pumpDir:0,chan:0,segFault:0,tankFull:0,tankEmpty:0,refLimit:0};
  g.co.advanceHours(2);
  for(let h=0;h<HRS;h++){ const k=Math.floor(R()*7);
    if(k===0&&pumps.length){ const id=pumps[Math.floor(R()*pumps.length)],p=cn.pumps.get(id); cn.setPumpFault(id,!p.fault); log.pumpFault++; }
    else if(k===1&&pumps.length){ const id=pumps[Math.floor(R()*pumps.length)],p=cn.pumps.get(id); cn.setPumpDir(id,-p.dir); log.pumpDir++; }
    else if(k===2){ const c=chs[Math.floor(R()*chs.length)]; cn.setChannel(c,cn.ch[c].state==='OPEN'?'CLOSED':'OPEN'); log.chan++; }
    else if(k===3&&segs.length){ const id=segs[Math.floor(R()*segs.length)],c=chs[Math.floor(R()*chs.length)],gg=cn.seg.get(id); cn.setFault(id,c,!gg.fault[c]); log.segFault++; }
    else if(k===4&&tanks.length){ const b=tanks[Math.floor(R()*tanks.length)],s=g.sim.ensure(b),cap=g.B.DEFS[b.d].capacity.value; s.vol=cap*(0.97+0.03*R()); log.tankFull++; }
    else if(k===5&&tanks.length){ const b=tanks[Math.floor(R()*tanks.length)],s=g.sim.ensure(b); s.vol=0; s.wat=0; log.tankEmpty++; }
    else if(k===6&&refs.length){ const b=refs[Math.floor(R()*refs.length)],s=g.sim.ensure(b); s.opLimit=R()<.3?0:0.3+0.7*R(); log.refLimit++; }
    g.co.advanceHours(1); out.push(snap(g)); }
  return {out,cn,log}; }
const A=run(false),B=run(true); let diff=0; for(let h=0;h<HRS;h++)for(let i=0;i<A.out[h].length;i++) if(!Object.is(A.out[h][i],B.out[h][i]))diff++;
const S=B.cn.depStats; console.log(JSON.stringify({hours:HRS,perturbations:A.log,valuesCompared:HRS*A.out[0].length,valueDiffs:diff,shadowChecks:S.calls,shadowValid:S.valid,mismatch:S.mismatch,mismatch1b:S.mismatch1b,mismatch2:S.mismatch2}));
