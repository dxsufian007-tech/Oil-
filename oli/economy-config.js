/* Oli - economy-config.js  (Phase 3 "economyConfig": every number the economy uses; the UI and the logic contain none of them)
 * Money is USD, volumes bbl (gas / LPG in boe), flows per day, time in game hours. 1 game day = 24 h, 1 month = 30 days, 1 year = 12 months = 360 days.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OliEconomyConfig = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const PRODUCTS = ['CRUDE', 'GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS'];            // the five things a company can hold and sell (OTHER is a by-product, never stored)
  return {
    START_CASH: 50000000,                                                           // a refinery (25M..1B) is a big decision, the company can afford wells + tanks + one small plant
    PRODUCTS,
    LABEL: { CRUDE: 'Crude', GASOLINE: 'Gasoline', DIESEL: 'Diesel', JET_FUEL: 'Jet Fuel', GAS: 'Gas / LPG' },
    UNIT: { CRUDE: 'bbl', GASOLINE: 'bbl', DIESEL: 'bbl', JET_FUEL: 'bbl', GAS: 'boe' },
    TIME: { hoursPerDay: 24, daysPerMonth: 30, monthsPerYear: 12, dayRealSeconds: 12, speeds: [0, 1, 2, 5, 10], tickMs: 250, maxCatchUpHours: 240, maxStepsPerTick: 60 },

    // ---- prices ($/bbl, gas $/boe).  Actual price = Base x Demand x Supply x Volatility, moved at most +-dailyChangeLimit per 24 h
    PRICE: { base: { CRUDE: 72, GASOLINE: 110, DIESEL: 104, JET_FUEL: 106, GAS: 48 },
      range: { CRUDE: [60, 90], GASOLINE: [80, 130], DIESEL: [75, 120], JET_FUEL: [75, 125], GAS: [30, 60] } },
    MARKET: { seed: 7013, warmupHours: 720, historyHours: 720, dailyChangeLimit: 0.05,
      meanRevert: 0.004,                                                            // per hour, pulls the demand factor back to 1 (half-life about 7 days)
      sharedSigma: 0.0042, sharedWeight: 0.6,                                       // one crude-driven factor moves every product (refined products follow crude)
      sigma: { CRUDE: 0.0050, GASOLINE: 0.0052, DIESEL: 0.0050, JET_FUEL: 0.0056, GAS: 0.0070 },
      noise: 0.0035,                                                                // the Volatility factor: small hourly noise around the target
      regimeDrift: 0.00055, regimeHours: [72, 240],                                 // a slow up / flat / down trend that lasts days: the price has a direction, it is not white noise
      smooth: 0.35, floorMult: 1.0, ceilMult: 1.0, trendEps: 0.006,
      depth: { CRUDE: 600000, GASOLINE: 250000, DIESEL: 250000, JET_FUEL: 120000, GAS: 150000 }, impact: 0.35, impactHalfLifeDays: 5 },   // selling a lot pushes the price down (Supply factor), then it recovers
    FEES: { spot: 0.01, contract: 0.0025 },
    QUALITY: { mult: { HIGH: 1.10, NORMAL: 1.00, LOW: 0.90 }, refinery: { HIGH: 1.03, NORMAL: 1.00, LOW: 0.95 }, share: { HIGH: 0.25, LOW: 0.25 }, highAt: 1.05, lowAt: 0.95 },

    // ---- costs
    STORAGE_COST: { CRUDE: 0.015, GASOLINE: 0.025, DIESEL: 0.025, JET_FUEL: 0.03, GAS: 0.06 },   // $ per stored bbl per day
    ENERGY: { pricePerKWh: 0.08 },
    POWER: { tiers: [{ name: 'Grid 1', kw: 8000, monthly: 25000, connect: 0 }, { name: 'Grid 2', kw: 25000, monthly: 90000, connect: 400000 }, { name: 'Grid 3', kw: 80000, monthly: 260000, connect: 1500000 }, { name: 'Grid 4', kw: 250000, monthly: 700000, connect: 5000000 }], startTier: 0, efficiencyFloor: 0.3 },
    POWER_KW: { well: 25, pump: { S: 120, L: 300 }, separator: 350, refinery: { S: 2500, M: 8000, L: 28000, X: 65000 }, gas: 40, idleShare: 0.35 },
    OPERATING: { fixedShare: 0.4, conditionPenalty: 0.5 },                           // DailyOperatingCost = Base x (fixed + (1-fixed) x Load) x (1 + penalty x (1-Condition))
    MAINTENANCE: { damage: 2.5, utilBase: 0.6, utilSlope: 0.8,                       // MaintenanceCost = Base x DamageFactor x UtilizationFactor
      decayPerDay: { well: 0.0012, pump: 0.003, valve: 0.0004, junction: 0.0004, tank: 0.0006, gas: 0.0008, separator: 0.002, refinery: 0.0016 }, utilWear: 0.5,
      repairFraction: 0.35, autoRepair: true, autoRepairBelow: 0.5, cashReserve: 1000000,
      labels: [[0.8, 'Good'], [0.6, 'Needs maintenance'], [0.4, 'Danger'], [0.2, 'Critical'], [0.0001, 'Failing']] },
    VARIABLE: { liftingPerBbl: 26, chemicalsPerBbl: 0.9 },                           // lifting cost per barrel produced at a well; refinery chemicals / catalyst per barrel processed
    LABOR: { salary: { operators: 3600, engineers: 8800, maintenance: 4400, managers: 13500 }, perManager: 60,   // per employee per month
      staff: { well: { operators: 2, maintenance: 1 }, pump_S: { operators: 2, maintenance: 1 }, pump_L: { operators: 3, engineers: 1, maintenance: 2 }, valve: { operators: 0.25 }, junction: { operators: 0.25 },
        tank_S: { operators: 1, maintenance: 1 }, tank_M: { operators: 2, maintenance: 1 }, tank_L: { operators: 4, maintenance: 2 }, gas_S: { operators: 1, engineers: 1, maintenance: 1 }, gas_M: { operators: 2, engineers: 1, maintenance: 1 }, gas_L: { operators: 4, engineers: 2, maintenance: 2 },
        separator: { operators: 6, engineers: 2, maintenance: 3 }, refinery_S: { operators: 30, engineers: 8, maintenance: 12, managers: 2 }, refinery_M: { operators: 80, engineers: 20, maintenance: 30, managers: 4 }, refinery_L: { operators: 220, engineers: 55, maintenance: 80, managers: 8 }, refinery_X: { operators: 500, engineers: 120, maintenance: 180, managers: 16 } } },
    FIXED: { insurancePerMonth: 0.0015, adminBase: 12000, adminPerAsset: 0.0003, infraPerYear: 0.008 },   // monthly: insurance on asset value, administration, pipeline upkeep (share of pipe value per year)
    ASSET: { depreciationPerYear: 0.05, floor: 0.3, conditionWeight: 0.5 },
    TAX: { rate: 0.2, lossCarryForward: true },                                       // Tax = max(0, Revenue - AllowedExpenses - carried losses) x rate, settled monthly

    // ---- finance
    LOANS: { baseRate: 0.07, riskMax: 0.06, terms: [12, 24, 48, 60], amounts: [5000000, 10000000, 25000000, 50000000, 100000000, 250000000], maxDebtRatio: 0.5, prepayFee: 0.01,
      emergency: { rate: 0.18, term: 12, limit: 20000000, minAmount: 2000000, cover: 1.5 } },
    FINANCE: { emergencyAfterDays: 5, pressureAfterDays: 15, bankruptAfterDays: 40 },
    AUTOSELL: { trigger: 0.8, target: 0.5, minPriceRatio: 0.92, force: 0.98 },       // SPOT mode: above `trigger` fill sell down to `target`, unless the price is below minPriceRatio x base (then wait) or the tank is `force` full
    CONTRACTS: { maxActive: 3, offers: 3, offerValidDays: 10, deadlineDays: [20, 45], premium: [0.06, 0.18], penaltyPct: 0.15, rewardPct: 0.05,
      qty: { CRUDE: [10000, 25000, 50000], GASOLINE: [5000, 10000, 25000], DIESEL: [5000, 10000, 25000], JET_FUEL: [3000, 6000, 12000], GAS: [3000, 6000, 12000] } },
    ALERTS: { lowCashDays: 20, highOpexRatio: 0.9, lowMarginRatio: 0.05, highStorageRatio: 0.08, loanDueDays: 3, contractDays: 5, lowInventoryFill: 0.05, highInventoryFill: 0.9, priceMove: 0.035, cooldownDays: 3 },
    OFFLINE: { capHours: 24, minSeconds: 60, gameDaysPerRealHour: 6, stepHours: 3 }  // away: at most capHours of real time count; each real hour = 6 game days (1/50 of the speed of playing); simulated in 3 h steps
  };
});
