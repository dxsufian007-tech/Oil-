/* S5 analysis: for every deliver-memo call that does not hit, which of the validity conditions failed, and whether the recomputed answer equals the last answer for the same (source,port,flow). */
const S=require('./gen-scene.js'),C=require('../central.js'),CN=C.CentralNet;Object.assign(CN,{hopShare:1,pcSparse:1,trDefault:0,rcvSkip:1,hopFreezeSkip:1});
const P=CN.prototype,o=P._probeMemo;const CHI={CRUDE:0,GASOLINE:1,DIESEL:2,JET_FUEL:3,GAS:4,WATER:5};
const last=new Map();const T={calls:0,hit:0,noEntry:0};const why={},whySame={};const bump=(m,k)=>m[k]=(m[k]||0)+1;
const flowEq=(a,b)=>{if(!b)return false;let n=0;for(const k in a){n++;if(!Object.is(a[k],b[k]))return false}return Object.keys(b).length===n};
P._probeMemo=function(sim,src,ch,f,vis,port){
 this._graph();const nix=this._nix,si=nix.get(src.id),ports=require('../central.js').PORTS||null;
 const ci=this.constructor.CI?this.constructor.CI[ch]:undefined;
 let e=null;try{const M=this._dmM[Object.keys(CHI).includes(ch)?CHI[ch]:ci];const pi=port===undefined?2:(this._portsOf?this._portsOf(ch).indexOf(port):0);}catch(_){}
 const hb=this.dmStats.hit;
 // snapshot entry state BEFORE the call
 let comp=null;const ciN=CHI[ch];const M=this._dmM[ciN];
 if(M){const pl=['CRUDE_IN','CRUDE_OUT'];}
 const probe=o.call(this,sim,src,ch,f,vis,port);T.calls++;
 return probe};
module.exports={};
