/* Oli - building-config.js  (Phase 2 "Building Configuration": every number a designer may want to tune, none of it in UI code)
 * Money is in dollars, flow in bbl/day, pressure in psi, volume in bbl (gas storage in boe = barrels of oil equivalent), cost per day in $/day.
 * Tank cost  =  baseCost + capacity x costPerBarrel   (configurable per family and size).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OliBuildingConfig = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const PRODUCTS = { CRUDE: 'CRUDE', GASOLINE: 'GASOLINE', DIESEL: 'DIESEL', JET_FUEL: 'JET_FUEL', GAS: 'GAS', WATER: 'WATER', OTHER: 'OTHER' };
  const PRODUCT_LABEL = { CRUDE: 'نفط خام', GASOLINE: 'بنزين', DIESEL: 'ديزل', JET_FUEL: 'وقود طائرات', GAS: 'غاز', WATER: 'ماء', OTHER: 'منتجات أخرى' };
  const PRODUCT_COLOR = { CRUDE: '#3b2a1c', GASOLINE: '#e0584a', DIESEL: '#e2b32c', JET_FUEL: '#4aa3ff', GAS: '#8fd694', WATER: '#5fb8d9', OTHER: '#9a7ec8' };

  // pipe diameters: capacity (bbl/day), max pressure (psi), cost per tile ($)
  const PIPES = { 8: { capacity: 6000, maxPressure: 1500, cost: 5000 }, 16: { capacity: 30000, maxPressure: 3000, cost: 15000 }, 24: { capacity: 90000, maxPressure: 3000, cost: 40000 }, 36: { capacity: 250000, maxPressure: 3000, cost: 90000 } };
  const PIPE_DEFAULT = 16, TILE_METERS = 12;

  // sizes: S / M / L share one tank formula
  const TANK = { // family: { sizes: { code: {w,h,cap,base,perBbl,op,maint,name}} }
    CRUDE: { prefix: 'crude_tank', name: 'Crude Tank', perBbl: 100, sizes: { S: { w: 2, h: 2, cap: 10000, base: 400000, op: 300, maint: 150 }, M: { w: 3, h: 3, cap: 50000, base: 1500000, op: 900, maint: 450 }, L: { w: 4, h: 4, cap: 250000, base: 4000000, op: 2500, maint: 1200 } } },
    GASOLINE: { prefix: 'gasoline_tank', name: 'Gasoline Tank', perBbl: 120, sizes: { S: { w: 2, h: 2, cap: 10000, base: 500000, op: 360, maint: 180 }, M: { w: 3, h: 3, cap: 50000, base: 1800000, op: 1100, maint: 540 }, L: { w: 4, h: 4, cap: 250000, base: 4800000, op: 3000, maint: 1450 } } },
    DIESEL: { prefix: 'diesel_tank', name: 'Diesel Tank', perBbl: 120, sizes: { S: { w: 2, h: 2, cap: 10000, base: 500000, op: 360, maint: 180 }, M: { w: 3, h: 3, cap: 50000, base: 1800000, op: 1100, maint: 540 }, L: { w: 4, h: 4, cap: 250000, base: 4800000, op: 3000, maint: 1450 } } },
    JET_FUEL: { prefix: 'jet_tank', name: 'Jet Fuel Tank', perBbl: 130, sizes: { S: { w: 2, h: 2, cap: 10000, base: 600000, op: 400, maint: 200 }, M: { w: 3, h: 3, cap: 50000, base: 2000000, op: 1200, maint: 600 }, L: { w: 4, h: 4, cap: 250000, base: 5200000, op: 3300, maint: 1600 } } },
    GAS: { prefix: 'gas_sphere', name: 'Gas / LPG Sphere', perBbl: 120, maxPressure: { S: 250, M: 250, L: 250 }, sizes: { S: { w: 2, h: 2, cap: 10000, base: 800000, op: 500, maint: 300 }, M: { w: 3, h: 3, cap: 50000, base: 3000000, op: 1500, maint: 900 }, L: { w: 4, h: 4, cap: 250000, base: 8000000, op: 4200, maint: 2400 } } }
  };

  // refinery sizes: capacity bbl/day, construction cost, operating & maintenance per day, footprint. Yields are per 100 bbl of crude.
  const REFINERY = {
    yields: { GASOLINE: 45, DIESEL: 30, JET_FUEL: 10, GAS: 5, OTHER: 10 },
    sizes: {
      S: { id: 'refinery_s', name: 'Small Refinery', w: 6, h: 5, cap: 5000, cost: 25000000, op: 10000, maint: 4500 },
      M: { id: 'refinery_m', name: 'Medium Refinery', w: 8, h: 6, cap: 25000, cost: 100000000, op: 48000, maint: 20000 },
      L: { id: 'refinery_l', name: 'Large Refinery', w: 10, h: 8, cap: 100000, cost: 400000000, op: 170000, maint: 70000 },
      X: { id: 'refinery_x', name: 'Major Refinery', w: 12, h: 9, cap: 250000, cost: 1000000000, op: 400000, maint: 160000 }
    },
    baseEfficiency: 0.95, minInletPsi: 50, optimalTempC: 370, maxTempC: 420
  };

  const WELL = { cost: [250000, 1500000], production: [500, 2500], pressure: [500, 2500], reserve: [100000, 5000000], op: 800, maint: 400, waterCutStart: 0.04, waterCutEnd: 0.55, gorStart: 0.03 };
  const PUMP = {
    S: { id: 'pump_station_s', name: 'Pump Station (small)', w: 2, h: 2, cost: 1000000, op: 1200, maint: 600, maxFlow: 5000, boost: [100, 250], eff: [0.75, 0.85], minInletPsi: 15 },
    L: { id: 'pump_station_l', name: 'Pump Station (large)', w: 3, h: 2, cost: 3500000, op: 3000, maint: 1500, maxFlow: 10000, boost: [300, 500], eff: [0.85, 0.92], minInletPsi: 15 }
  };
  const VALVE = { cost: 60000, op: 50, maint: 150, maxFlow: 40000, pressureRating: 3000, w: 1, h: 1 };
  const JUNCTION = { cost: 120000, op: 0, maint: 100, maxTotalFlow: 60000, pressureLimit: 3000, w: 1, h: 1 };
  const SEPARATOR = { cost: 2500000, op: 3500, maint: 1500, cap: 50000, w: 4, h: 3, oilSep: 0.94, gasSep: 0.92, waterSep: 0.88, minInletPsi: 30 };
  const SAFETY = { tankNearFull: 0.95, tankFull: 1.0, tankHigh: 0.8, tankLow: 0.2, gasHighPressure: 0.85, gasNearLimit: 0.95, gasHighTempC: 60, ambientC: 30 };
  const LEVELS = { 1: { capacityMultiplier: 1, efficiencyMultiplier: 1, pressureMultiplier: 1, maintenanceMultiplier: 1 } };   // architecture only: Level 1 exists, no upgrade system yet
  const SIM = { dayRealSeconds: 12, tankHeadPsi: 60, frictionPsiPerTile: 0.5, frictionExp: 1.8 };

  return { PRODUCTS, PRODUCT_LABEL, PRODUCT_COLOR, PIPES, PIPE_DEFAULT, TILE_METERS, TANK, REFINERY, WELL, PUMP, VALVE, JUNCTION, SEPARATOR, SAFETY, LEVELS, SIM };
});
