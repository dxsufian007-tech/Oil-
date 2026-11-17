const S=require('./gen-scene.js'),C=require('../central.js'),CN=C.CentralNet;Object.assign(CN,{hopShare:1,pcSparse:1,trDefault:2,trVerify:16});
const P=CN.prototype,orig=P.plan;const st={calls:0,memoHit:0,sameRP:0,sameRPE:0,sameU:0,sameUnoAlt:0,noEntry:0,diffR:0};const mem=new Map();
P.plan=function(ch,from,to,r,p0,over){st.calls++;const ci=ch;let key=ch+'|'+from+'|'+to;const prev=mem.get(key);
 const before=this.plStats?this.plStats.hit:0;const res=orig.call(this,ch,from,to,r,p0,over);const hit=(this.plStats?this.plStats.hit:0)>before;if(hit)st.memoHit++;
 if(!over||!over.size){const first=this.path(ch,from,to);if(first){const u=first.map(h=>{const i=this._ixOf(h.g.id);return this._used[i*6+({CRUDE:0,GASOLINE:1,DIESEL:2,JET_FUEL:3,GAS:4,WATER:5}[ch]??0)]||0});
  if(!prev)st.noEntry++;else if(!hit){ if(prev.first===first&&Object.is(prev.r,r)&&Object.is(prev.p,p0)){st.sameRP++; if(prev.e===this._plE){st.sameRPE++; if(prev.u.length===u.length&&prev.u.every((x,i)=>x===u[i])){st.sameU++;}}} else if(prev.first!==first||prev.e!==this._plE) st.diffR++; }
  mem.set(key,{first,r,p:p0,u,e:this._plE});}}
 return res;};
const g=S.load(process.argv[2]);const sinks=(g.sinks||[]).map(id=>g.store.get(id)).filter(Boolean);for(let h=0;h<(+process.argv[3]||6);h++){for(const b of sinks)g.sim.ensure(b).vol=0;g.co.advanceHours(1);}
console.log(JSON.stringify(st));
