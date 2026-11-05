// Stage 5: price impact of the NEW buildings against the existing ones (prices are placeholders awaiting the owner's approval; edit them in building-config.js)
const B=require('./buildings.js'),E=require('./economy-config.js');
const row=(id)=>{const d=B.DEFS[id],cap=d.capacity?d.capacity.value:0;return {id,cost:d.cost,cap,perUnit:cap?+(d.cost/cap).toFixed(1):'-',daily:d.operatingCost+d.maintenanceCost}};
const ids=['pump_station_s','pump_station_l','pump_station_c','junction','main_manifold','crude_tank_m','crude_tank_l','crude_tank_c','refinery_s','refinery_m','refinery_l','refinery_x'];
console.log('id'.padEnd(18),'cost'.padStart(12),'capacity'.padStart(10),'cost/unit'.padStart(10),'op+maint/day'.padStart(13));
for(const id of ids){const r=row(id);console.log(r.id.padEnd(18),String(r.cost).padStart(12),String(r.cap).padStart(10),String(r.perUnit).padStart(10),String(r.daily).padStart(13))}
const c=row('pump_station_c'),l=row('pump_station_l'),t=row('crude_tank_c'),tl=row('crude_tank_l'),m=row('main_manifold'),x=row('refinery_x');
console.log('\ncentral pump = '+(c.cost/l.cost).toFixed(1)+'x a large pump for '+(c.cap/l.cap)+'x the flow (equivalent 10 large pumps would cost '+(10*l.cost)+')');
console.log('central store = '+(t.cost/tl.cost).toFixed(1)+'x a large tank for '+(t.cap/tl.cap)+'x the capacity (16 large tanks would cost '+(16*tl.cost)+')');
console.log('manifold = '+(m.cost/B.DEFS.junction.cost).toFixed(0)+'x a junction; replaces ~'+(9+3)+' junction tiles worth '+(12*B.DEFS.junction.cost));
console.log('full chain (store+pump+manifold) = '+(t.cost+c.cost+m.cost)+' = '+((t.cost+c.cost+m.cost)/x.cost*100).toFixed(0)+'% of one refinery_x');
