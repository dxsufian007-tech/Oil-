const S=require('./gen-scene.js'),C=require('../central.js');Object.assign(C.CentralNet,{hopShare:1,pcSparse:1,trDefault:2,trVerify:16});
const g=S.load(process.argv[2]);const sinks=(g.sinks||[]).map(id=>g.store.get(id)).filter(Boolean);for(let h=0;h<(+process.argv[3]||6);h++){for(const b of sinks)g.sim.ensure(b).vol=0;g.co.advanceHours(1);}
console.log(JSON.stringify({tr:g.cn.trStats,pc:g.cn.pcStats&&{calls:g.cn.pcStats.calls,hit:g.cn.pcStats.lookupHit,miss:g.cn.pcStats.miss},pl:g.cn.plStats}));
