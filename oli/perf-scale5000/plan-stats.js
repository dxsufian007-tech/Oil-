const S=require('./gen-scene.js'),C=require('../central.js'),CN=C.CentralNet;Object.assign(CN,{hopShare:1,pcSparse:1,trDefault:0,rcvSkip:1,hopFreezeSkip:1});
const P=CN.prototype;const st={planCore:0,alt:0,planHops:0,hopsTotal:0,pathCalls:0,pathBan:0,noFirst:0,planNull:0,planHopsInAlt:0};
const oc=P._planCore;P._planCore=function(ch,from,to,r,p0,over){st.planCore++;const before=st.planHops;const res=oc.call(this,ch,from,to,r,p0,over);if(st.planHops-before>1){st.alt++;st.planHopsInAlt+=st.planHops-before}if(!res)st.planNull++;return res};
const oh=P._planHops;P._planHops=function(ch,hops,...a){st.planHops++;st.hopsTotal+=hops.length;return oh.call(this,ch,hops,...a)};
const op=P.path;P.path=function(ch,f,t,over,ban,bias){st.pathCalls++;if(ban||bias)st.pathBan++;return op.call(this,ch,f,t,over,ban,bias)};
const g=S.boot();for(let h=0;h<12;h++)g.co.advanceHours(1);
st.avgHops=+(st.hopsTotal/st.planHops).toFixed(2);st.plStats=g.cn.plStats;st.pcStats=g.cn.pcStats&&{calls:g.cn.pcStats.calls,hit:g.cn.pcStats.lookupHit,miss:g.cn.pcStats.miss};st.pumps=g.cn.pumps.size;console.log(JSON.stringify(st));
