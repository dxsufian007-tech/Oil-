// Stage 5-7: the ten required checks (real engine), save/reload, old save, conservation
const H=require('./test-reserve-helpers.js'),{B,I,E,game,put}=H;const fs=require('fs');let pass=0,fail=0;const ck=(n,c,x)=>{if(c){pass++;console.log('  ok  '+n+(x?' '+x:''))}else{fail++;console.log('FAIL '+n+(x?' '+x:''))}};
const vol=(g,b)=>g.sim.ensure(b).vol, prime=(g,bs)=>{for(const b of bs)g.sim.ensure(b).prod='CRUDE'};
// faithful reload: store + net (with conn/open) + company
function reloadAll(g){const sj=JSON.parse(JSON.stringify(g.store.toJSON())),nj=JSON.parse(JSON.stringify(g.net.toJSON())),cj=JSON.parse(JSON.stringify(g.co.toJSON())),g2=game();loadInto(g2,sj,nj,cj,g.store.cash);return g2}
function loadInto(g2,sj,nj,cj,cash){const r=B.BuildingStore.fromJSON(g2.ts,sj);g2.store.items=r.store.items;g2.store.occ=r.store.occ;g2.store.bucket=r.store.bucket;g2.store.nextId=r.store.nextId;g2.store.time=r.store.time;g2.store.cash=cash;g2.net=I.PipeNet.fromJSON(g2.ts.W,nj);g2.sim=new I.Sim(g2.store,g2.net);if(cj)g2.co.fromJSON(cj);}
{ // 1 tank <-> tank (both lines, both directions, conservation)
  const g=game(1e12),a=put(g,'crude_tank_m',50,50),b=put(g,'crude_tank_m',70,50),r=I.layConnect(g.store,g.net,g.ts,a.id,b.id,{});ck('1 tank-tank: two lines built',r.ok&&r.lines.length===2);
  g.sim.build();g.sim.ensure(a).vol=30000;prime(g,[a,b]);g.sim.run(2);ck('1 oil moved A->B, none lost',Math.abs(vol(g,a)+vol(g,b)-30000)<1&&vol(g,b)>25000,Math.round(vol(g,b)));
  const [l1,l2]=r.made;I.setLineOpen(g.net,l1.id,false);I.setLineOpen(g.net,l2.id,true);g.sim.build();g.sim.run(2);ck('1 other line open: B->A, none lost',Math.abs(vol(g,a)+vol(g,b)-30000)<1&&vol(g,a)>25000,Math.round(vol(g,a)));}
{ // 2 tank -> pump -> tank
  const g=game(1e12),a=put(g,'crude_tank_m',50,50),p=put(g,'pump_station_l',62,52),b=put(g,'crude_tank_m',76,50);const r1=I.layConnect(g.store,g.net,g.ts,a.id,p.id,{}),r2=I.layConnect(g.store,g.net,g.ts,p.id,b.id,{});
  ck('2 tank-pump and pump-tank: one line each',r1.ok&&r2.ok&&r1.lines.length===1&&r2.lines.length===1);g.sim.build();g.sim.ensure(a).vol=50000;prime(g,[a,b]);g.sim.run(1);ck('2 pump moves its rating (20,000/day), conserved',Math.abs(vol(g,b)-20000)<2&&Math.abs(vol(g,a)+vol(g,b)-50000)<1,Math.round(vol(g,b)));}
function vol2(){}
{ // 3 pump -> central store, 4 central store -> refinery
  const g=game(1e12),a=put(g,'crude_tank_l',40,40),p=put(g,'pump_station_l',54,42),s=put(g,'crude_tank_c',70,38),rf=put(g,'refinery_s',90,40),pt=[put(g,'gasoline_tank_s',108,36),put(g,'diesel_tank_s',108,42),put(g,'jet_tank_s',108,48),put(g,'gas_sphere_s',108,54)];
  const r1=I.layConnect(g.store,g.net,g.ts,a.id,p.id,{}),r2=I.layConnect(g.store,g.net,g.ts,p.id,s.id,{}),r3=I.layConnect(g.store,g.net,g.ts,s.id,rf.id,{});pt.forEach(t=>I.layConnect(g.store,g.net,g.ts,rf.id,t.id,{}));
  ck('3 pump -> central store connected',r1.ok&&r2.ok);ck('4 central store -> refinery connected (CRUDE_IN, one line)',r3.ok&&r3.lines.length===1&&r3.lines[0].b.port==='CRUDE_IN',r3.reason);
  g.sim.build();g.sim.ensure(a).vol=200000;prime(g,[a,s]);g.sim.ensure(s).prod='CRUDE';const t0=vol(g,a);g.sim.run(3);
  const st=g.sim.ensure(rf);const inRef=(st.crudeIn!=null?st.crudeIn:0);
  ck('3 central store receives oil through the pump',vol(g,s)>0||(g.sim.ensure(rf)._in||0)>0,Math.round(vol(g,s)));
  ck('4 the refinery really takes crude from the central store and makes products',(st.crude||0)>1000&&Object.values(st.made).some(v=>v>100),Math.round(st.crude)+' crude');
  ck('3/4 no oil created or lost: source loss = store + refinery intake',Math.abs((t0-vol(g,a))-(vol(g,s)+st.crude))<1,Math.round(t0-vol(g,a))+' = '+Math.round(vol(g,s))+' + '+Math.round(st.crude));}
{ // 7 independent lines + 8 save/reload + 10 conservation after reload
  const g=game(1e12),a=put(g,'crude_tank_m',50,50),b=put(g,'crude_tank_m',70,50),c=put(g,'crude_tank_s',60,66);const r=I.layConnect(g.store,g.net,g.ts,a.id,b.id,{}),r2=I.layConnect(g.store,g.net,g.ts,b.id,c.id,{});
  const ids=[...g.net.lines.keys()];I.setLineOpen(g.net,r.made[1].id,true);I.setLineOpen(g.net,r2.made[1].id,false);
  const snap=[...g.net.lines.values()].map(l=>[l.id,l.conn,l.open===false,l.a.port,l.b.port,l.path.length].join('|'));
  g.sim.build();g.sim.ensure(a).vol=20000;prime(g,[a,b,c]);g.sim.run(1);const tot=vol(g,a)+vol(g,b)+vol(g,c);
  const g2=reloadAll(g);const snap2=[...g2.net.lines.values()].map(l=>[l.id,l.conn,l.open===false,l.a.port,l.b.port,l.path.length].join('|'));
  ck('8 the network survives save + reopen: same lines, ids, connection ids, valves, ports, paths',JSON.stringify(snap)===JSON.stringify(snap2));
  ck('8 buildings and their oil survive: same count, same volumes',g2.store.list().length===g.store.list().length&&Math.abs(vol(g2,g2.store.get(a.id))-vol(g,a))<1e-6);
  ck('8 new line ids after reopening continue after the old ones (no clash)',(()=>{const x=put(g2,'crude_tank_s',40,66),y=I.layConnect(g2.store,g2.net,g2.ts,a.id,x.id,{});return y.ok&&y.made.every(l=>!ids.includes(l.id))})());
  g2.sim.build();const all=()=>g2.store.list().filter(x=>/tank/.test(x.d)).reduce((s,x)=>s+vol(g2,x),0),t2=all();g2.sim.run(1);const t3=all();
  ck('10 after reopening the oil keeps moving and nothing is created or lost',Math.abs(t2-tot)<1&&Math.abs(t3-t2)<1,Math.round(tot)+' -> '+Math.round(t3));
  ck('7 each line has its own valve after reopening (open state kept per line)',g2.net.lines.get(r2.made[1].id).open===false&&g2.net.lines.get(r.made[1].id).open!==false);
}
{ // 9 old save (written by the Stage 4d code from the backup branch)
  const f='./fixture-old-save-stage4d.json';if(!fs.existsSync(f)){ck('9 fixture present',false)}else{const d=JSON.parse(fs.readFileSync(f)),g=game(1);let err=null;try{loadInto(g,d.store,d.net,d.eco,d.cash)}catch(e){err=e}
    ck('9 the old save loads without error',!err,err&&err.message);const n=Object.keys(d.net.lines||d.net.l||{}).length;
    ck('9 all old buildings are back (well, pump, 2 tanks, refinery)',g.store.list().length===5,g.store.list().length);
    ck('9 all old pipelines are back and keep their ports',g.net.lines.size===(d.net.lines||d.net.l).length&&[...g.net.lines.values()].every(l=>l.a&&l.b),g.net.lines.size);
    ck('9 old lines are open by default (no valve data in old saves)',[...g.net.lines.values()].every(l=>l.open!==false));
    const a=g.store.get(d.ids.a),b=g.store.get(d.ids.b);g.sim.build();g.sim.ensure(a).vol=d.vol.a;g.sim.ensure(b).vol=d.vol.b;g.sim.ensure(a).prod='CRUDE';g.sim.run(1);ck('9 the old network behaves exactly as it did on the old engine after one more day (tank A '+Math.round(d.after1.a)+', tank B '+Math.round(d.after1.b)+')',Math.abs(vol(g,a)-d.after1.a)<0.01*d.after1.a+1&&Math.abs(vol(g,b)-d.after1.b)<0.01*d.after1.b+1,Math.round(vol(g,a))+' / '+Math.round(vol(g,b)));
    ck('9 old 4-port tank still has its original port ids (INPUT_W, INPUT_N, OUTPUT_E, OUTPUT_S)',['INPUT_W','INPUT_N','OUTPUT_E','OUTPUT_S'].every(id=>B.DEFS[a.d].connections.some(c=>c.id===id)));
    const x=put(g,'crude_tank_s',70,70);ck('9 an old network can be extended with the new auto-connect (branch from an old line)',(()=>{const L=[...g.net.lines.values()].find(l=>l.path.length>4);const r=I.branchTo(g.store,g.net,g.ts,x.id,{line:L.id},{commit:false});return r.lines.length>0})());}
}
console.log('pass',pass,'fail',fail);process.exit(fail?1:0);
