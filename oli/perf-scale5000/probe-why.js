const S=require('./gen-scene.js'),C=require('../central.js'),CN=C.CentralNet;Object.assign(CN,{hopShare:1,pcSparse:1,trDefault:2});
const P=CN.prototype,op=P.plan;let lastPlan,planNull=0,planOk=0;P.plan=function(...a){const r=op.apply(this,a);lastPlan=r;return r};
const o=P.toStation;const st={probe:0,zero:0,planNull:0,offerZero:0,pos:0};const byType={};
P.toStation=function(sim,ch,srcId,d,want,f,commit,...r){lastPlan=undefined;const g=o.call(this,sim,ch,srcId,d,want,f,commit,...r);if(!commit){st.probe++;if(g<=1e-9){st.zero++;if(lastPlan===null)st.planNull++;else{st.offerZero++;const t=(d.b.d)+'/'+(d.b.st);byType[t]=(byType[t]||0)+1;}}else st.pos++;}return g};
const g=S.load(process.argv[2]);const sinks=(g.sinks||[]).map(id=>g.store.get(id)).filter(Boolean);for(let h=0;h<4;h++){for(const b of sinks)g.sim.ensure(b).vol=0;g.co.advanceHours(1);}
console.log(JSON.stringify({st,byType}));
