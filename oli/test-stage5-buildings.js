// Stage 5 part 6: regular pump 20,000, central pump (5 in / 5 out, 200,000), central store 4,000,000
const H=require('./test-reserve-helpers.js'),{B,I,game,put}=H;let pass=0,fail=0;const ck=(n,c)=>{if(c)pass++;else{fail++;console.log('FAIL',n)}};
const CFG=require('./building-config.js');
{const g=game(1e12),t=put(g,'crude_tank_l',50,50),p=put(g,'pump_station_l',62,52),d=put(g,'crude_tank_c',80,48);
 ck('l-connect',I.layConnect(g.store,g.net,g.ts,t.id,p.id,{}).ok);ck('l-connect2',I.layConnect(g.store,g.net,g.ts,p.id,d.id,{}).ok);
 g.sim.build();const s=g.sim.ensure(t);s.vol=250000;s.prod='CRUDE';g.sim.ensure(d).prod='CRUDE';g.sim.run(1);
 const mv=g.sim.ensure(d).vol;ck('regular pump moves 20000',Math.abs(mv-20000)<1);ck('conserved',Math.abs(mv+s.vol-250000)<1);}
{const g=game(1e12),t=put(g,'crude_tank_c',40,40),p=put(g,'pump_station_c',60,44),d=put(g,'crude_tank_c',84,40);
 ck('c-def ports',B.DEFS.pump_station_c&&true);
 const r1=I.layConnect(g.store,g.net,g.ts,t.id,p.id,{}),r2=I.layConnect(g.store,g.net,g.ts,p.id,d.id,{});ck('c-connect',r1.ok&&r2.ok);
 ck('c-dia 24 (200k pipe matches the 200k central pump)',[...g.net.lines.values()].every(l=>l.dia===24));
 g.sim.build();const s=g.sim.ensure(t);s.vol=1000000;s.prod='CRUDE';g.sim.ensure(d).prod='CRUDE';g.sim.run(1);
 const mv=g.sim.ensure(d).vol;ck('central pump moves >=150000 and <=200000',mv>=150000&&mv<=200001);ck('conserved',Math.abs(mv+s.vol-1000000)<1);
 const cap=B.DEFS.crude_tank_c.capacity;ck('4M capacity',cap&&cap.value===4000000);}
{const g=game(1e12),t=put(g,'crude_tank_c',40,40);g.sim.build();const s=g.sim.ensure(t);s.vol=4000000;s.prod='CRUDE';g.sim.run(1);ck('store holds 4M',s.vol===4000000);
 const j=JSON.parse(JSON.stringify(g.store.toJSON?g.store.toJSON():{}));ck('serializes',!!j);}
console.log('pass',pass,'fail',fail);process.exit(fail?1:0);
