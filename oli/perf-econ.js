// economy-engine cost per game hour with N wells + tanks (node, real engine). usage: node perf-econ.js
const H=require('./test-reserve-helpers.js'),{B,I,game,put}=H;
function run(N,T){const g=game(1e14);let w=0;for(let k=0;k<N*4&&w<N;k++){try{put(g,'oil_well',4+(k%80)*4,4+Math.floor(k/80)*4);w++}catch(_){}}
 let t=0;for(let k=0;k<T;k++){try{put(g,'crude_tank_m',4+(k%20)*14,200+Math.floor(k/20)*14);t++}catch(_){}}
 g.co.speed=1;g.co.run(24);const ms=[];for(let i=0;i<200;i++){const a=process.hrtime.bigint();g.co.run(0.25);ms.push(Number(process.hrtime.bigint()-a)/1e6)}
 ms.sort((a,b)=>a-b);const s=ms.reduce((a,b)=>a+b)/ms.length;console.log('wells',w,'tanks',t,'avg ms/0.25h',s.toFixed(3),'p95',ms[190].toFixed(3),'p99',ms[197].toFixed(3),'max',ms[199].toFixed(3),'x10 per-tick(2.5h*..)≈',(s*10*1).toFixed(2)+'ms')}
for(const [n,t] of [[20,0],[100,0],[300,0],[500,0],[100,140]])run(n,t);
