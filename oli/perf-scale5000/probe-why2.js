const S=require('./gen-scene.js'),C=require('../central.js'),CN=C.CentralNet;Object.assign(CN,{hopShare:1,pcSparse:1,trDefault:0,rcvSkip:1});
const P=CN.prototype,o=P.toStation;const st={probe:0,positive:0,dead:0,zeroOther:0};const cat={};const sim0=()=>global.__sim;
P.toStation=function(sim,ch,srcId,d,want,f,commit,...r){const was=sim.probeDead(d.b,d.port,f,want);const g=o.call(this,sim,ch,srcId,d,want,f,commit,...r);
 if(!commit){st.probe++;if(g>1e-9)st.positive++;else if(was)st.dead++;else{st.zeroOther++;const e=sim.edgeOf(d.b,d.port);let k='noedge';if(e){const fw=e.ab===d.b.id&&e.ap===d.port,far=sim.store.get(fw?e.bb:e.ab);const def=far&&require('../buildings.js').DEFS[far.d];const s=far&&far.s||{};k=def?def.type:'nofar';
  if(def&&def.type==='tank'){const cap=def.capacity.value;const avail=Math.max(0,cap*(sim.levelCap?1:1)-(s.vol||0)-(s._pend||0));k+=avail<=1e-9?':full':':room';k+=sim._gof&&sim._gof.has(far.id)?'+group':'';}
  else if(def&&def.type==='pump'){k+= f.p<def.params.minInletPsi?':lowP':':ok';}
  else if(e.lvl)k+=':lvl'; if(e.cap-e.flow<=1e-9)k+='|pipeFull';}
  cat[k]=(cat[k]||0)+1;}}return g};
const g=process.argv[2]==="real"?S.boot():S.load(process.argv[2]);const sk=(g.sinks||[]).map(id=>g.store.get(id)).filter(Boolean);for(let h=0;h<4;h++){for(const b of sk)g.sim.ensure(b).vol=0;g.co.advanceHours(1);}
console.log(JSON.stringify({st,cat},null,0));
