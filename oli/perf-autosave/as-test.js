// autosave A+B tests on the REAL save.  node as-test.js <gameDir> [hours=48]
const dir=process.argv[2], HRS=+process.argv[3]||48; process.chdir(dir); const fs=require('fs'), crypto=require('crypto'); const md5=s=>{ const o=JSON.parse(s); delete o.acc; return crypto.createHash('md5').update(JSON.stringify(o)).digest('hex'); };
function boot(){ const { I, B, world } = require(dir+'/test-central-kit.js'), E=require(dir+'/economy.js'); const d=JSON.parse(fs.readFileSync(process.env.SAVE||(process.env.SAVE||'/home/claude/dxsufian007-tech/oil-/oli/local-saves/realsave.json'),'utf8'));
  const ts=B.fromWorld(world); if(d.wd){world.restoreProgress(d.wd.p);world.restoreReserve(d.wd.r);world.restoreZones(d.wd.z);} const r0=B.BuildingStore.fromJSON(ts,d.store,{cash:d.cash}),store=r0.store;store.cash=d.cash;const net=I.PipeNet.fromJSON(ts.W,d.net),sim=new I.Sim(store,net),co=new E.Company(store,net,sim,{now:()=>1e12});
  co.fromJSON(d.eco); co.setSpeed(1); for(const b of store.list())sim.ensure(b); return {store,net,sim,co,world,E}; }
const out={};
// 1) toJSONString == JSON.stringify(toJSON()) byte for byte, hour by hour, across day / month changes, and after a load
{ const g=boot(), co=g.co; co.advanceHours(1); let bad=0,n=0,hit=0,len=0; const dayAt=[]; for(let h=0;h<HRS+30;h++){ co.advanceHours(1); const a=co.toJSONString(true), b=JSON.stringify(co.toJSON()); n++; if(a!==b)bad++; len=a.length; }
  const co2=boot().co; co2.fromJSON(JSON.parse(JSON.stringify(co.toJSON()))); const a=co2.toJSONString(true); if(a!==JSON.stringify(co2.toJSON()))bad++; n++;
  out.byteIdentical={saves:n,differences:bad,bytes:len}; }
// 2) (A): save at the hour boundary == the original (settle, then save), and neither disturbs the simulation: same hours, hour by hour
function liveRun(mode){ const g=boot(), co=g.co; const snaps=new Map(); let tick=0; const clock=()=>++tick; let pend=false, defSaves=0, origSaves=0, settledAtSave=0; const snap=()=>{ if(!co._hg&&!snaps.has(co.hours)) snaps.set(co.hours,md5(co.toJSONString())+crypto.createHash('md5').update(JSON.stringify(g.store.toJSON({live:true}))+JSON.stringify(g.net.toJSON())).digest('hex')); };
  co.onHourEnd=()=>{ snap(); if(mode==='defer'&&pend){ pend=false; defSaves++; if(co._hg) throw new Error('hook with an open hour'); } };
  let calls=0; const h0=co.hours, target=h0+HRS+1;
  while(co.hours<target){ co.addTime(0.9); co.run(0.9,25,clock); calls++;
    if(calls%37===0){ if(mode==='orig'){ origSaves++; if(co._hg)settledAtSave++; co.toJSONString(); snap(); } else pend=true; } }
  co.onHourEnd=null; return {snaps,hours:co.hours,defSaves,origSaves,settledAtSave,h0}; }
const A=liveRun('orig'), B=liveRun('defer'); let diff=0,n=0; for(const [h,v] of A.snaps){ if(!B.snaps.has(h)) continue; n++; if(B.snaps.get(h)!==v) diff++; }
out.snaps=[A.snaps.size,B.snaps.size]; out.originalVsDeferred={hoursCompared:n,hourStateHashDifferences:diff,originalSavesThatHadToSettleAnOpenHour:A.settledAtSave,originalSaves:A.origSaves,deferredSavesAtBoundary:B.defSaves};
console.log(JSON.stringify(out,null,1));
