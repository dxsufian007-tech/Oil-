const S=require('./gen-scene.js'),C=require('../central.js'),CN=C.CentralNet;Object.assign(CN,{hopShare:1,pcSparse:1,trDefault:0,rcvSkip:1,hopFreezeSkip:1});
const P=CN.prototype,o=P._probeMemo;const last=new Map();const st={calls:0,hit:0,missSameResult:0,missDiffResult:0,missFirst:0};
P._probeMemo=function(sim,src,ch,f,vis,port){const hb=this.dmStats.hit;const probe=o.call(this,sim,src,ch,f,vis,port);st.calls++;
 if(this.dmStats.hit>hb){st.hit++;return probe;}
 const k=ch+'|'+src.id+'|'+port+'|'+f.prod+'|'+f.r+'|'+f.p;const prev=last.get(k);
 const cur=probe===null?'null':probe.map(x=>x.d.s.id+':'+x.d.port+':'+x.can).join(';');
 if(prev===undefined)st.missFirst++;else if(prev===cur)st.missSameResult++;else st.missDiffResult++;last.set(k,cur);return probe};
const g=S.boot();for(let h=0;h<12;h++)g.co.advanceHours(1);console.log(JSON.stringify(st));
