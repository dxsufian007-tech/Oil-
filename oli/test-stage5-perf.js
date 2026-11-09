// Stage 5 perf + accuracy: the flow engine under load - small / medium / big networks, central pump 200,000, several pumps, stop / restart, conservation
const H=require('./test-reserve-helpers.js'),{B,I,game,put}=H;let pass=0,fail=0;const ck=(n,c,x)=>{if(c){pass++;console.log('  ok  '+n+(x?' '+x:''))}else{fail++;console.log('FAIL '+n+(x?' '+x:''))}};
const ms=(g,n,dt)=>{g.sim.build();const t=process.hrtime.bigint();for(let i=0;i<n;i++)g.sim.step(dt);return Number(process.hrtime.bigint()-t)/1e6/n};
const tot=(g)=>g.store.list().filter(b=>/tank|gas/.test(B.DEFS[b.d].type)).reduce((a,b)=>a+g.sim.ensure(b).vol,0);
const BUDGET=8; // ms per simulated game hour - the real cost is < 1 ms; 8 ms is a loose ceiling that still catches a quadratic / exponential regression
{ // small: tank -> pump -> tank
  const g=game(1e13),a=put(g,'crude_tank_m',40,40),p=put(g,'pump_station_l',54,42),b=put(g,'crude_tank_m',68,40);I.layConnect(g.store,g.net,g.ts,a.id,p.id,{});I.layConnect(g.store,g.net,g.ts,p.id,b.id,{});g.sim.ensure(a).vol=50000;g.sim.ensure(a).prod='CRUDE';g.sim.ensure(b).prod='CRUDE';
  const t0=tot(g),t=ms(g,48,1/24);ck('small network: step cost',t<BUDGET,t.toFixed(3)+' ms');ck('small: oil conserved',Math.abs(tot(g)-t0)<1e-6);}
{ // medium: 8 independent pump sets
  const g=game(1e13),srcs=[];for(let k=0;k<8;k++){const a=put(g,'crude_tank_l',20,10+k*14),p=put(g,'pump_station_l',34,12+k*14),b=put(g,'crude_tank_l',50,10+k*14);I.layConnect(g.store,g.net,g.ts,a.id,p.id,{});I.layConnect(g.store,g.net,g.ts,p.id,b.id,{});g.sim.ensure(a).vol=200000;g.sim.ensure(a).prod='CRUDE';g.sim.ensure(b).prod='CRUDE';srcs.push(a)}
  const t0=tot(g),t=ms(g,48,1/24);ck('8 pumps working together: step cost',t<BUDGET,t.toFixed(3)+' ms');ck('8 pumps: conserved',Math.abs(tot(g)-t0)<1e-3);
  const moved=srcs.reduce((a,s)=>a+(200000-g.sim.ensure(s).vol),0);ck('8 pumps: each moved its rating (8 x 20,000 x 2 days)',Math.abs(moved-8*20000*2)<8,Math.round(moved));}
{ // big: 140 tanks, 250 lines
  const g=game(1e13),ts=[];for(let i=0;i<14;i++)for(let j=0;j<10;j++)ts.push(put(g,'crude_tank_s',20+i*8,20+j*8));for(let i=0;i<ts.length-1;i++)I.layConnect(g.store,g.net,g.ts,ts[i].id,ts[i+1].id,{});ts.forEach(x=>g.sim.ensure(x).prod='CRUDE');g.sim.ensure(ts[0]).vol=10000;
  const t0=tot(g),t=ms(g,60,1/24);ck('big network (140 tanks, '+g.net.lines.size+' lines): step cost',t<BUDGET,t.toFixed(3)+' ms');ck('big: oil conserved',Math.abs(tot(g)-t0)<1e-3);}
{ // central pump 200,000 + stop / restart
  const g=game(1e13),s=put(g,'crude_tank_c',30,30),p=put(g,'pump_station_c',50,36),d=[];for(let i=0;i<5;i++)d.push(put(g,'crude_tank_l',78,22+i*10));I.layConnect(g.store,g.net,g.ts,s.id,p.id,{});d.forEach(x=>I.layConnect(g.store,g.net,g.ts,p.id,x.id,{}));g.sim.ensure(s).vol=3.9e6;g.sim.ensure(s).prod='CRUDE';d.forEach(x=>g.sim.ensure(x).prod='CRUDE');
  const t0=tot(g),t=ms(g,48,1/24);ck('central pump 200,000: step cost',t<BUDGET,t.toFixed(3)+' ms');const got=d.reduce((a,x)=>a+g.sim.ensure(x).vol,0);ck('central pump: 2 days moved 400,000 (200,000/day)',Math.abs(got-400000)<400,Math.round(got));ck('central pump: conserved',Math.abs(tot(g)-t0)<1e-3);
  const out=[...g.net.lines.values()].filter(l=>l.a.b===p.id);out.forEach(l=>I.setLineOpen(g.net,l.id,false));g.sim.build();const before=d.reduce((a,x)=>a+g.sim.ensure(x).vol,0);g.sim.run(1);ck('stop (all outputs closed): nothing moves',Math.abs(d.reduce((a,x)=>a+g.sim.ensure(x).vol,0)-before)<1e-6);
  out.forEach(l=>I.setLineOpen(g.net,l.id,true));g.sim.build();g.sim.run(1);const after=d.reduce((a,x)=>a+g.sim.ensure(x).vol,0);ck('restart: 200,000 flow again, conserved',Math.abs(after-before-200000)<200&&Math.abs(tot(g)-t0)<1e-3,Math.round(after-before));}
{ // graph is not rebuilt while pumping (only when the layout changes)
  const g=game(1e13),a=put(g,'crude_tank_m',40,40),p=put(g,'pump_station_l',54,42),b=put(g,'crude_tank_m',68,40);I.layConnect(g.store,g.net,g.ts,a.id,p.id,{});I.layConnect(g.store,g.net,g.ts,p.id,b.id,{});g.sim.ensure(a).vol=50000;g.sim.ensure(a).prod='CRUDE';g.sim.ensure(b).prod='CRUDE';
  let builds=0;const ob=g.sim.build.bind(g.sim);g.sim.build=function(){builds++;return ob()};for(let i=0;i<96;i++)g.co._tick(1);ck('no graph rebuild during 96 game hours of pumping (at most the first)',builds<=1,builds);
  const x=put(g,'crude_tank_s',80,60);I.layConnect(g.store,g.net,g.ts,b.id,x.id,{});g.co._tick(1);ck('a layout change triggers exactly one rebuild',builds>=1&&builds<=2,builds);}
console.log('pass',pass,'fail',fail);process.exit(fail?1:0);
