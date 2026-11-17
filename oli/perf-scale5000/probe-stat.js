const S=require('./gen-scene.js'),C=require('../central.js'),CN=C.CentralNet;Object.assign(CN,{hopShare:1,pcSparse:1,trDefault:2});
const P=CN.prototype,o=P.toStation;const st={probe:0,zero:0,commit:0,rcvPerDeliver:0,deliver:0};
const od=P.deliver;P.deliver=function(...a){st.deliver++;return od.apply(this,a)};const orc=P.receivers;P.receivers=function(...a){const r=orc.apply(this,a);st.rcvPerDeliver+=r.length;return r};
P.toStation=function(sim,ch,srcId,d,want,f,commit,...r){const g=o.call(this,sim,ch,srcId,d,want,f,commit,...r);if(commit)st.commit++;else{st.probe++;if(g<=1e-9)st.zero++;}return g};
const g=(process.argv[2]==="real"?S.boot():S.load(process.argv[2]));const sinks=(g.sinks||[]).map(id=>g.store.get(id)).filter(Boolean);for(let h=0;h<(+process.argv[3]||4);h++){for(const b of sinks)g.sim.ensure(b).vol=0;g.co.advanceHours(1);}
console.log(JSON.stringify(st));
