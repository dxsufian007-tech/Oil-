const dir=require('path').resolve(__dirname,'..'); process.chdir(dir); const fs=require('fs');
const K=require(dir+'/test-central-kit.js'), { I, B, world, C } = K, E=require(dir+'/economy.js'); const d=JSON.parse(fs.readFileSync('/home/claude/dxsufian007-tech/oil-/oli/local-saves/realsave.json','utf8'));
const ts=B.fromWorld(world); if(d.wd){world.restoreProgress(d.wd.p);world.restoreReserve(d.wd.r);world.restoreZones(d.wd.z);} const r0=B.BuildingStore.fromJSON(ts,d.store,{cash:d.cash}),store=r0.store;store.cash=1e13;const net=I.PipeNet.fromJSON(ts.W,d.net),sim=new I.Sim(store,net),co=new E.Company(store,net,sim,{now:()=>1e12});co.fromJSON(d.eco); co.sync(); co.speed=0;
const g={ts,store,net,sim,co,cn:net.central,B,I};
const cn=net.central; const sts=[...cn.st.keys()]; console.log('buildings',store.list().length,'stations',sts.length,'pumps',cn.pumps.size,'segs',cn.seg.size);
const chs=['CRUDE','GASOLINE','DIESEL']; const tank={CRUDE:'crude_tank_m',GASOLINE:'gasoline_tank_m',DIESEL:'diesel_tank_m'};
const time=()=>{co.advanceHours(3); const a=process.hrtime.bigint(); co.advanceHours(12); return Number(process.hrtime.bigint()-a)/1e6/12;};
console.log('N',store.list().length,'ms/h',time().toFixed(1));
let i=0,fails=0; for(const target of [360]){ while(store.list().length<target && fails<60){ const ch=chs[i%3], st=sts[(i*7)%sts.length]; const dir=(i%2)?'in':'out'; let b=null; try{ b=K.attach(g,tank[ch],[st],ch,dir,(dir==='out'?3e4:0)); }catch(e){} if(!b) fails++; i++; } co.sync(); console.log('N',store.list().length,'lines',net.lines.size,'ms/h',time().toFixed(1)); }
const out=[]; for(let k=0;k<5;k++){ const a=process.hrtime.bigint(); co.advanceHours(10); out.push((Number(process.hrtime.bigint()-a)/1e7).toFixed(0)); } console.log('chunks ms/h',out.join(' '));
