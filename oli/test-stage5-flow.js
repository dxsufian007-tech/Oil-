// Stage 5-7: central pump real flow (200,000), five independent outputs, Main Manifold 9-in / 3-out, return-line rule
const H=require('./test-reserve-helpers.js'),{B,I,game,put}=H;let pass=0,fail=0;const ck=(n,c,x)=>{if(c){pass++;console.log('  ok  '+n+(x?' '+x:''))}else{fail++;console.log('FAIL '+n+(x?' '+x:''))}};
const CAP=d=>I.PipeNet&&require('./building-config.js').PIPES[d].capacity;
const sumVol=(g,bs)=>bs.reduce((a,b)=>a+g.sim.ensure(b).vol,0);
function setup(){ // 1 big source -> central pump C -> 5 destination tanks
  const g=game(1e13),src=put(g,'crude_tank_c',30,30),p=put(g,'pump_station_c',50,36),dst=[];
  const pos=[[78,22],[78,32],[78,42],[78,52],[78,62]];for(const [x,y] of pos)dst.push(put(g,'crude_tank_l',x,y));
  const r=I.layConnect(g.store,g.net,g.ts,src.id,p.id,{});const rs=dst.map(d=>I.layConnect(g.store,g.net,g.ts,p.id,d.id,{}));
  return {g,src,p,dst,r,rs};
}
{ const {g,src,p,dst,r,rs}=setup(); ck('central pump: source and 5 outputs connected',r.ok&&rs.every(x=>x.ok),rs.map(x=>x.reason||'').join(','));
  const outs=[...g.net.lines.values()].filter(l=>l.a.b===p.id);ck('five distinct OUTPUT ports used',new Set(outs.map(l=>l.a.port)).size===5);
  g.sim.build();const s=g.sim.ensure(src);s.vol=3000000;s.prod='CRUDE';for(const d of dst)g.sim.ensure(d).prod='CRUDE';
  g.sim.run(1);const got=dst.map(d=>g.sim.ensure(d).vol),tot=got.reduce((a,b)=>a+b,0);
  ck('REAL flow through the central pump reaches 200,000 in one day (engine)',tot>=199000&&tot<=200001,Math.round(tot));
  ck('never above the pump rating 200,000',tot<=200001);
  ck('split over the five outputs: every output carries flow',got.every(v=>v>1000),got.map(Math.round).join('/'));
  ck('split is even when all have room (max/min < 1.05)',Math.max(...got)/Math.min(...got)<1.05);
  ck('no oil created or lost',Math.abs(tot+s.vol-3000000)<1,Math.round(tot+s.vol));
  const pipeMax=Math.max(...[...g.net.lines.values()].map(l=>l.flow||0)),capMin=Math.min(...[...g.net.lines.values()].map(l=>CAP(l.dia)));
  ck('no pipe carries more than its capacity',[...g.net.lines.values()].every(l=>(l.flow||0)<=CAP(l.dia)+1),'max '+Math.round(pipeMax));
  ck('pump status is not hidden: pump flow recorded',(g.sim.ensure(p)._in||0)>0);
}
{ // independent valves on each of the five outputs
  const {g,src,p,dst}=setup();const outs=[...g.net.lines.values()].filter(l=>l.a.b===p.id).sort((a,b)=>a.a.port<b.a.port?-1:1);
  const dstOf=l=>dst.find(d=>d.id===l.b.b);
  for(let k=0;k<5;k++){ // close only output k
    const g2=setup();const os=[...g2.g.net.lines.values()].filter(l=>l.a.b===g2.p.id).sort((a,b)=>a.a.port<b.a.port?-1:1);I.setLineOpen(g2.g.net,os[k].id,false);
    g2.g.sim.build();const s=g2.g.sim.ensure(g2.src);s.vol=3000000;s.prod='CRUDE';for(const d of g2.dst)g2.g.sim.ensure(d).prod='CRUDE';g2.g.sim.run(1);
    const closed=g2.dst.find(d=>d.id===os[k].b.b),tot=g2.dst.reduce((a,d)=>a+g2.g.sim.ensure(d).vol,0);
    ck('output '+(k+1)+' closed alone: its tank stays empty, the other four still carry the whole 200,000',g2.g.sim.ensure(closed).vol===0&&tot>=199000&&tot<=200001,Math.round(tot));
    I.setLineOpen(g2.g.net,os[k].id,true);ck('and it can be opened again (valve of its own)',!(g2.g.net.lines.get(os[k].id).open===false));
  }
  // only one open
  for(let k=1;k<5;k++)I.setLineOpen(g.net,outs[k].id,false);g.sim.build();const s=g.sim.ensure(src);s.vol=3000000;s.prod='CRUDE';for(const d of dst)g.sim.ensure(d).prod='CRUDE';g.sim.run(1);
  const only=g.sim.ensure(dstOf(outs[0])).vol;ck('only one output open: all 200,000 go through that one pipe (36in, cap 250,000)',only>=199000&&only<=200001,Math.round(only));
  // capacity-aware: small tank fills, the rest goes elsewhere
}
{ // capacity-aware split on the pump
  const g=game(1e13),src=put(g,'crude_tank_c',30,30),p=put(g,'pump_station_c',50,36),a=put(g,'crude_tank_s',78,22),b=put(g,'crude_tank_l',78,40);
  I.layConnect(g.store,g.net,g.ts,src.id,p.id,{});I.layConnect(g.store,g.net,g.ts,p.id,a.id,{});I.layConnect(g.store,g.net,g.ts,p.id,b.id,{});
  g.sim.build();const s=g.sim.ensure(src);s.vol=3000000;s.prod='CRUDE';g.sim.ensure(a).prod='CRUDE';g.sim.ensure(b).prod='CRUDE';g.sim.run(1);
  const va=g.sim.ensure(a).vol,vb=g.sim.ensure(b).vol,capA=B.DEFS.crude_tank_s.capacity.value;
  ck('small tank cannot exceed its capacity; the rest of the flow goes to the other output',va<=capA+1&&vb>=190000-1&&Math.abs(va+vb+s.vol-3000000)<1,Math.round(va)+'/'+Math.round(vb));
}
{ // Main Manifold: 9 inputs, 3 outputs
  const D=B.DEFS.main_manifold;ck('manifold definition: 9 inputs, 3 outputs, independent ports',D&&D.connections.filter(c=>c.role==='in').length===9&&D.connections.filter(c=>c.role==='out').length===3);
  const g=game(1e13),m=put(g,'main_manifold',60,30);ck('manifold placed',!!m);
  const srcs=[];for(let i=0;i<9;i++)srcs.push(put(g,'crude_tank_m',30,20+i*4));ck('nine source tanks placed',srcs.every(Boolean));
  const dsts=[put(g,'crude_tank_l',92,24),put(g,'crude_tank_l',92,36),put(g,'crude_tank_s',92,48)];ck('three destination tanks placed',dsts.every(Boolean));
  const OI=[0,8,1,7,2,6,3,5,4],rin=[];for(const i of OI)rin.push(I.layConnect(g.store,g.net,g.ts,srcs[i].id,m.id,{}));      // outside-in order (a wall of pipes cannot be crossed: connecting the outer sources first keeps every input reachable)ck('auto-connect: all nine inputs wired (each source ONE line, no return line)',rin.every(x=>x.ok&&x.lines.length===1),rin.map(x=>x.reason||'ok').join(','));
  const used=new Set([...g.net.lines.values()].filter(l=>l.b.b===m.id).map(l=>l.b.port));ck('nine different INPUT ports',used.size===9);
  const rout=dsts.map(t=>I.layConnect(g.store,g.net,g.ts,m.id,t.id,{}));ck('auto-connect: three outputs wired',rout.every(x=>x.ok&&x.lines.length===1),rout.map(x=>x.reason||'ok').join(','));
  const dup=I.layConnect(g.store,g.net,g.ts,srcs[0].id,m.id,{});ck('connecting the same pair again is refused (no duplicate)',!dup.ok&&dup.reason==='alreadyConnected',dup.reason);
  g.sim.build();for(const t of srcs){const s=g.sim.ensure(t);s.vol=40000;s.prod='CRUDE';}for(const d of dsts)g.sim.ensure(d).prod='CRUDE';
  const before=sumVol(g,srcs)+sumVol(g,dsts);g.sim.run(1);const after=sumVol(g,srcs)+sumVol(g,dsts);
  ck('manifold conserves oil: nothing created, nothing lost',Math.abs(before-after)<1,Math.round(before)+' -> '+Math.round(after));
  const gv=dsts.map(d=>g.sim.ensure(d).vol),capS=B.DEFS.crude_tank_s.capacity.value;ck('small destination never above its capacity',gv[2]<=capS+1,gv.map(Math.round).join('/'));
  ck('flow is shared by available capacity: the two large tanks receive close amounts',Math.abs(gv[0]-gv[1])/Math.max(gv[0],gv[1],1)<0.1,gv.map(Math.round).join('/'));
  ck('total through the manifold within its rating 300,000',(g.sim.ensure(m)._in||0)<=300001,Math.round(g.sim.ensure(m)._in||0));
  // independent output control
  const outs=[...g.net.lines.values()].filter(l=>l.a.b===m.id).sort((a,b)=>a.a.port<b.a.port?-1:1);
  for(let k=0;k<3;k++){const g2=game(1e13);const m2=put(g2,'main_manifold',60,30),ss=[];for(let i=0;i<9;i++)ss.push(put(g2,'crude_tank_m',30,20+i*4));const dd=[put(g2,'crude_tank_l',92,24),put(g2,'crude_tank_l',92,36),put(g2,'crude_tank_l',92,48)];
    [0,8,1,7,2,6,3,5,4].forEach(i=>I.layConnect(g2.store,g2.net,g2.ts,ss[i].id,m2.id,{}));dd.forEach(t=>I.layConnect(g2.store,g2.net,g2.ts,m2.id,t.id,{}));
    const os=[...g2.net.lines.values()].filter(l=>l.a.b===m2.id).sort((a,b)=>a.a.port<b.a.port?-1:1);I.setLineOpen(g2.net,os[k].id,false);
    g2.sim.build();ss.forEach(t=>{const s=g2.sim.ensure(t);s.vol=40000;s.prod='CRUDE'});dd.forEach(d=>g2.sim.ensure(d).prod='CRUDE');g2.sim.run(1);
    const closed=dd.find(d=>d.id===os[k].b.b),others=dd.filter(d=>d!==closed).reduce((a,d)=>a+g2.sim.ensure(d).vol,0);
    ck('manifold output '+(k+1)+' closed: its tank gets nothing, the other two still receive oil',g2.sim.ensure(closed).vol===0&&others>0,Math.round(others));}
}
{ // return-line rule: by device kind, product and direction
  const g=game(1e12),a=put(g,'crude_tank_s',50,50),b=put(g,'crude_tank_s',64,50);const v=I.planConnect(g.store,g.net,g.ts,a.id,b.id);ck('tank <-> tank: BOTH directions kept (2 lines)',v.ok&&v.lines.length===2);
  const g2=game(1e12),t=put(g2,'crude_tank_s',50,50),p=put(g2,'pump_station_s',58,52);const v2=I.planConnect(g2.store,g2.net,g2.ts,t.id,p.id);ck('tank -> pump: one line, the note says why (directional device)',v2.ok&&v2.lines.length===1&&v2.notes.some(n=>n.reason==='oneWay'&&n.why==='directionalDevice'));
  const g3=game(1e12),t3=put(g3,'crude_tank_s',50,50),rf=put(g3,'refinery_s',62,50);const v3=I.planConnect(g3.store,g3.net,g3.ts,t3.id,rf.id);ck('tank -> refinery: one line, the note says why (product/direction not compatible)',v3.ok&&v3.lines.length===1&&v3.notes.some(n=>n.reason==='oneWay'&&!n.why));
  const g4=game(1e12),c=put(g4,'crude_tank_c',40,40),d=put(g4,'crude_tank_l',64,40);const v4=I.planConnect(g4.store,g4.net,g4.ts,c.id,d.id);ck('central store <-> tank: BOTH directions kept',v4.ok&&v4.lines.length===2);
}
console.log('pass',pass,'fail',fail);process.exit(fail?1:0);
