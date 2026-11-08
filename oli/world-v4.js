/* ============ the world (pure, deterministic; the same source runs on the main thread and inside the Web Worker) ============ */
function WORLD(){
'use strict';
const WW=2560, WH=1600, RC=320, CH=128, RES=2, OVS=4;                    /* 8 x 5 regions of 320 tiles; 1 tile = 12 m */
function hash(ix,iy,s){let h=(Math.imul(ix,374761393)+Math.imul(iy,668265263)+Math.imul(s,1442695041))|0;h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296}
function vn(x,y,s){const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);const a=hash(ix,iy,s),b=hash(ix+1,iy,s),c=hash(ix,iy+1,s),d=hash(ix+1,iy+1,s);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v}
function fbm(x,y,s,o){let a=.5,f=1,t=0,n=0;for(let i=0;i<o;i++){t+=a*vn(x*f,y*f,s+i*17);n+=a;a*=.5;f*=2}return t/n}
const sm=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
const coast=y=>540+70*(vn(y/260,3.1,11)*2-1)+22*(vn(y/55,7.7,12)*2-1);          /* water lies west of this x (448..632) */
const K={DEEP:0,SHALLOW:1,BEACH:2,FLAT:3,HILL:4,ROCK:5,WADI:6,LAKE:7};
const ZONES=[
 {id:'E1',k:'EXTRACT',n:'استخراج شمال',x:1180,y:180,w:360,h:300},{id:'E2',k:'EXTRACT',n:'استخراج شرق',x:1760,y:300,w:380,h:320},
 {id:'E3',k:'EXTRACT',n:'استخراج جنوب',x:1300,y:1020,w:340,h:300},{id:'E4',k:'EXTRACT',n:'استخراج جنوب شرق',x:1900,y:980,w:240,h:280},
 {id:'S1',k:'STORE',n:'تخزين مركزي',x:1120,y:640,w:260,h:220},{id:'S2',k:'STORE',n:'تخزين شرقي',x:1620,y:760,w:260,h:200},
 {id:'P1',k:'PROCESS',n:'تكرير شمال',x:780,y:200,w:320,h:220},{id:'P2',k:'PROCESS',n:'تكرير جنوب',x:1000,y:1100,w:300,h:240},
 {id:'T1',k:'TRANSPORT',n:'محور النقل',x:1400,y:520,w:200,h:120},
 {id:'C3',k:'RESERVE',n:'C3 · احتياطي استراتيجي',x:640,y:640,w:320,h:320},
 {id:'F1',k:'FUTURE',n:'مستقبلية 1',x:2200,y:130,w:220,h:220},{id:'F2',k:'FUTURE',n:'مستقبلية 2',x:2180,y:1180,w:240,h:240},{id:'F3',k:'FUTURE',n:'مستقبلية 3',x:760,y:1150,w:200,h:260},{id:'F4',k:'FUTURE',n:'مستقبلية 4',x:1720,y:1350,w:340,h:110},{id:'F5',k:'FUTURE',n:'مستقبلية 5',x:1580,y:120,w:500,h:110}];
const C3=ZONES.find(z=>z.id==='C3');
const inRect=(z,x,y)=>x>=z.x&&y>=z.y&&x<z.x+z.w&&y<z.y+z.h;
const coastZone=(x,y)=>{if(y<160||y>1440)return false;const c=coast(y);return x>=c+10&&x<c+110};
function zoneAt(x,y){for(const z of ZONES)if(inRect(z,x,y))return z;return null}
/* 0..1: 1 inside any built compound (C3 included), fading out over m tiles; natural features are kept out of these */
function zoneW(x,y,m){let w=0;for(const z of ZONES){if(z.k==='FUTURE')continue;const dx=Math.max(z.x-x,0,x-z.x-z.w),dy=Math.max(z.y-y,0,y-z.y-z.h),dd=Math.hypot(dx,dy);if(dd<m){const q=1-dd/m;if(q>w)w=q}}return w}
function lakeAt(x,y){const L=[[1600,330,20],[2000,820,26],[1760,1290,18],[2330,700,20],[1420,880,16],[1380,1400,22],[880,1050,12]];for(const l of L){const d=Math.hypot(x-l[0],y-l[1]);if(d<l[2]*(0.85+0.3*vn(x/9,y/9,41)))return true}return false}
/* rock clusters: small outcrops (a main lump and two satellites) scattered on open land, never inside compounds */
const CS=60;let CV=0,AP=0;
function lumps(cx,cy){if(hash(cx,cy,91)>.24)return null;const px=(cx+.15+.7*hash(cx,cy,92))*CS,py=(cy+.15+.7*hash(cx,cy,93))*CS,R=4.5+8.5*hash(cx,cy,94);
  return[[px,py,R],[px+(hash(cx,cy,95)-.5)*R*1.6,py+(hash(cx,cy,96)-.5)*R*1.6,R*.55],[px+(hash(cx,cy,97)-.5)*R*1.6,py+(hash(cx,cy,98)-.5)*R*1.6,R*.5]]}
function clusterV(x,y){const gx=Math.floor(x/CS),gy=Math.floor(y/CS);CV=0;AP=0;let nz=-1;
  for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){const L=lumps(gx+i,gy+j);if(!L)continue;if(nz<0)nz=.8+.4*vn(x/4,y/4,99);
    for(const q of L){const d=Math.hypot(x-q[0],y-q[1])/(q[2]*nz);if(d<1){const v=1-d;if(v>CV)CV=v}const a=1-d/2.2;if(a>AP)AP=a}}}
/* dry valleys: a warped, meandering channel with a thinner tributary; the value is the distance from the bed in bed-widths (<1 = bed) */
function wadiW(x,y){const wx=x+(fbm(x/90,y/90,31,2)-.5)*70,wy=y+(fbm(x/90,y/90,32,2)-.5)*70;
  const d1=Math.abs(fbm(wx/210,wy/210,37,3)-.5)/(.0068*(.8+.9*vn(x/120,y/120,55))),d2=Math.abs(fbm(wx/130,wy/130,47,2)-.5)/.0020;return Math.min(d1,d2)}
function elev(x,y){
  const c=coast(y);let e=.30+.05*(fbm(x/260,y/260,3,3)-.5);
  const d=Math.min(y,WH-y,WW-x),bw=26+48*fbm(x/190,y/190,5,2),mh=Math.max(0,1-d/bw);
  if(mh>0)e+=mh*(.55+.45*fbm(x/40,y/40,6,3));
  const h=sm(.615,.82,fbm(x/230,y/230,7,3));e+=h*.2;const ms=sm(.715,.795,fbm(x/310,y/310,21,3));if(ms>0&&x>c+160)e+=ms*(.4+.4*fbm(x/34,y/34,22,3));
  if(x<c)return -sm(0,150,c-x)*.9-.02;
  e-=(1-sm(c,c+30,x))*.12;
  for(const z of ZONES){if(z.k==='FUTURE'||z.k==='RESERVE')continue;const dx=Math.max(z.x-x,0,x-z.x-z.w),dy=Math.max(z.y-y,0,y-z.y-z.h),dd=Math.hypot(dx,dy);if(dd<16){const w=1-dd/16;e=e*(1-w)+.30*w}}
  if(coastZone(x,y)){e=e*.35+.30*.65}
  const fw=coastZone(x,y)?0:1-zoneW(x,y,14);
  if(fw>0&&x>c+80){
    if(e<.5){const wd=wadiW(x,y);if(wd<7)e-=.030*fw*(1-sm(0,7,wd))}                 /* the channel is cut into the ground */
    clusterV(x,y);if(CV>0)e+=CV*.36*fw}                                                  /* outcrops stand above it */
  return e}
const A={k:3,wd:9,cv:0,ap:0,z:null,inZ:false};
/* classify one point; also leaves the wadi distance / outcrop strength for the colouring in A */
function analyze(x,y,e){
  const c=coast(y);A.wd=9;A.cv=0;A.ap=0;A.z=zoneAt(x,y);A.inZ=!!((A.z&&A.z.k!=='FUTURE')||coastZone(x,y));
  if(x<c){A.k=(c-x>70)?K.DEEP:K.SHALLOW;return A.k}
  if(x<c+9){A.k=K.BEACH;return A.k}
  if(lakeAt(x,y)){A.k=K.LAKE;return A.k}
  const fw=A.inZ?0:1-zoneW(x,y,14);
  if(fw>.5&&x>c+80){clusterV(x,y);A.cv=CV;A.ap=AP;if(CV>.2){A.k=K.ROCK;return A.k}}
  if(e>.62){A.k=K.ROCK;return A.k}
  if(fw>.5&&e<.62&&x>c+90){A.wd=wadiW(x,y);if(A.wd<1){A.k=K.WADI;return A.k}}
  if(e>.372&&!A.inZ){A.k=K.HILL;return A.k}
  A.k=K.FLAT;return A.k}
function classify(x,y,e){return analyze(x,y,e)}
const COL=[null,null,[207,199,174],[160,157,138],[142,142,121],[148,143,134],[183,176,154],[72,128,150]];
function slopeAt(x,y,e){const dx=elev(x+1.5,y)-elev(x-1.5,y),dy=elev(x,y+1.5)-elev(x,y-1.5);return{s:Math.max(.55,Math.min(1.35,1-(dx+dy)*5.2)),slope:Math.hypot(dx,dy)/3}}
function shade(x,y,e){return slopeAt(x,y,e)}
/* colour of one point (needs analyze() to have just run for the same point) */
function colorOf(x,y,e,dx,dy,k,out){let r,g,b;
  if(k===0||k===1){const c=coast(y),t=Math.min(1,(c-x)/140),w=.5+.5*Math.sin((x*.35+y*.12)+vn(x/14,y/14,2)*6);
    r=(86-56*t+4*w);g=(150-74*t+3*w);b=(168-62*t+3*w);if(c-x<4){r+=40;g+=34;b+=24}}
  else{
    const base=COL[k],sh=Math.max(.55,Math.min(1.35,1-(dx+dy)*5.2)),z=A.z,inZ=A.inZ,s=k===5?Math.max(.86,Math.min(1.18,sh)):k===4?sh:1+(sh-1)*.5;
    const n1=fbm(x/420,y/420,13,2)-.5,n2=fbm(x/110,y/110,14,2)-.5,gr=(hash((x*2)|0,(y*2)|0,9)-.5)*(inZ?2.5:7),tn=inZ?.18:1;
    r=base[0]*s+gr+(n1*34+n2*12)*tn;g=base[1]*s+gr+(n1*22+n2*9)*tn;b=base[2]*s+gr*.9+(n1*-10+n2*7)*tn;
    if(k===5){const f=(vn(x/2.4,y/2.4,63)-.5)*26+Math.sin(x*1.15+y*.55+vn(x/6,y/6,66)*7)*10,rim=A.cv>0&&A.cv<.4?(.4-A.cv)*30:0;r+=f+rim;g+=f+rim;b+=f+rim*.9}                    /* faceted stone */
    if(A.wd<7&&k!==7&&k!==5){const bank=1-sm(.6,7,A.wd);r+=-3*bank;g+=0*bank;b+=-2*bank;                                          /* soft dry banks */
      if(k===6){const t=Math.max(0,1-A.wd),stk=vn(x/2.6,y/14,61)-.5,m=.38;r=r*(1-m)+186*m-8*t*t-stk*12;g=g*(1-m)+176*m-7*t*t-stk*11;b=b*(1-m)+150*m-6*t*t-stk*9}}
    if(A.ap>.02&&k!==5){const a=A.ap*.42,sp=(hash((x*3)|0,(y*3)|0,64)-.5)*16*A.ap;r=r*(1-a)+128*a+sp;g=g*(1-a)+124*a+sp;b=b*(1-a)+116*a+sp}   /* debris apron round an outcrop */
    if(z&&z.k!=='FUTURE'&&z.k!=='RESERVE'&&k!==7){r=r*.9+10;g=g*.9+14;b=b*.9+16;const ed=Math.min(x-z.x,z.x+z.w-x,y-z.y,z.y+z.h-y);if(ed<1.4){r-=16;g-=16;b-=14}}
    if(z&&z.k==='RESERVE'&&k!==7){r=r*.9+16;g=g*.9+12;b=b*.9+2;const ccx=z.x+z.w/2,ccy=z.y+z.h/2;if(Math.abs(x-ccx)<140&&Math.abs(y-ccy)<114){r+=7;g+=7;b+=5}}}
  out[0]=r;out[1]=g;out[2]=b}
function genChunk(cx,cy){const N=CH*RES,M=N+6,E=new Float32Array(M*M),x0=cx*CH,y0=cy*CH;
  for(let j=0;j<M;j++){const y=y0+(j-3+.5)/RES;for(let i=0;i<M;i++)E[j*M+i]=elev(x0+(i-3+.5)/RES,y)}
  const buf=new Uint8ClampedArray(N*N*4),o=[0,0,0];
  for(let j=0;j<N;j++){const y=y0+(j+.5)/RES;for(let i=0;i<N;i++){const x=x0+(i+.5)/RES,id=(j+3)*M+(i+3),e=E[id],dx=E[id+3]-E[id-3],dy=E[id+3*M]-E[id-3*M],k=analyze(x,y,e);colorOf(x,y,e,dx,dy,k,o);const p=(j*N+i)*4;buf[p]=o[0];buf[p+1]=o[1];buf[p+2]=o[2];buf[p+3]=255}}
  return{buf,deco:genDeco(cx,cy)}}
/* ground detail points of one block: stones round the outcrops, dry scrub on the wadi banks, a thin scatter. type 0 stone, 1 shrub, 2 hill scrub, 3 boulder, 4 wadi scrub */
function genDeco(cx,cy){const out=[],x0=cx*CH,y0=cy*CH,x1=x0+CH,y1=y0+CH;
  const ok=(x,y)=>{const e=elev(x,y),k=analyze(x,y,e);return(k===3||k===4||k===5||k===6)&&!A.inZ};
  for(let gy=Math.floor((y0-24)/CS);gy<=Math.floor((y1+24)/CS);gy++)for(let gx=Math.floor((x0-24)/CS);gx<=Math.floor((x1+24)/CS);gx++){const L=lumps(gx,gy);if(!L)continue;const R=L[0][2],n=Math.floor(R*R*.5);
    for(let k=0;k<n;k++){const lp=L[k%3],a=hash(gx*257+k,gy,201)*6.2832,rad=Math.sqrt(hash(gx*257+k,gy,202))*lp[2]*1.55,x=lp[0]+Math.cos(a)*rad,y=lp[1]+Math.sin(a)*rad;
      if(x<x0||x>=x1||y<y0||y>=y1)continue;if(!ok(x,y))continue;const core=1-rad/(lp[2]*1.55),r=1.1+core*3.4+hash(gx*257+k,gy,203)*1.3;out.push(x,y,r,r>3.4?3:0)}}
  for(let y=y0;y<y1;y+=2)for(let x=x0;x<x1;x+=2){const h=hash(x,y,211);if(h>.05)continue;const px=x+hash(x,y,212)*2,py=y+hash(x,y,213)*2,e=elev(px,py),k=analyze(px,py,e);
    if((k===3||k===4)&&!A.inZ&&A.wd>1&&A.wd<6)out.push(px,py,.9+hash(x,y,214)*1.3,4)}
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const h=hash(x,y,77);if(h>.011)continue;const px=x+hash(x,y,78),py=y+hash(x,y,79),e=elev(px,py),k=analyze(px,py,e);if(A.inZ&&!(A.z&&A.z.k==='FUTURE'))continue;
    if(k===3)out.push(px,py,1.1+h*40,1);else if(k===4)out.push(px,py,1.2+h*40,2)}
  return new Float32Array(out)}
/* the overview: 1 px per 4 tiles, direct sampling; also returns the area figures */
function genOverview(){const OVW=WW/OVS,OVH=WH/OVS,buf=new Uint8ClampedArray(OVW*OVH*4),o=[0,0,0],cnt=new Array(8).fill(0);let fut=0,fl=0,lt=0,st=0,land=0;
  for(let j=0;j<OVH;j++)for(let i=0;i<OVW;i++){const x=i*OVS+OVS/2,y=j*OVS+OVS/2,e=elev(x,y),dx=elev(x+1.5,y)-elev(x-1.5,y),dy=elev(x,y+1.5)-elev(x,y-1.5),k=analyze(x,y,e);colorOf(x,y,e,dx,dy,k,o);
    const p=(j*OVW+i)*4;buf[p]=o[0];buf[p+1]=o[1];buf[p+2]=o[2];buf[p+3]=255;cnt[k]++;
    const z=A.z;if(z&&z.k==='FUTURE'&&k!==0&&k!==1)fut++;
    if(k>=2){land++;const sl=Math.hypot(dx,dy)/3;if(sl<.0045)fl++;else if(sl<.02)lt++;else st++}}
  const T=OVW*OVH;return{buf,stats:{sea:cnt[0]+cnt[1],beach:cnt[2],flat:cnt[3],hill:cnt[4],rock:cnt[5],wadi:cnt[6],lake:cnt[7],future:fut,total:T,land,slopeFlat:fl,slopeLight:lt,slopeSteep:st}}}
return{WW,WH,RC,CH,RES,OVS,hash,vn,fbm,sm,coast,K,ZONES,C3,inRect,coastZone,zoneAt,zoneW,lakeAt,elev,analyze,classify,A:()=>A,shade,slopeAt,colorOf,genChunk,genOverview,genDeco,wadiW,clusterV,CV:()=>CV}
}

if (typeof module !== "undefined" && module.exports) module.exports = WORLD; else if (typeof window !== "undefined") window.OliWorldV4 = WORLD;
