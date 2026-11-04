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
    START_CASH: 10000000,                                                           // a small oil company: a first well, a pipeline and a tank; a refinery (25M..1B) has to be earned or financed
    PRODUCTS,
    LABEL: { CRUDE: 'نفط خام', GASOLINE: 'بنزين', DIESEL: 'ديزل', JET_FUEL: 'وقود طائرات', GAS: 'غاز' },
    UNIT: { CRUDE: 'برميل', GASOLINE: 'برميل', DIESEL: 'برميل', JET_FUEL: 'برميل', GAS: 'برميل مكافئ' },
    TIME: { hoursPerDay: 24, daysPerMonth: 30, monthsPerYear: 12, dayRealSeconds: 12, speeds: [0, 1, 2, 5, 10], tickMs: 250, maxCatchUpHours: 240, maxStepsPerTick: 60 },

    // ---- prices ($/bbl, gas $/boe).  Actual price = Base x Demand x Supply x Volatility, moved at most +-dailyChangeLimit per 24 h
    PRICE: { base: { CRUDE: 72, GASOLINE: 110, DIESEL: 104, JET_FUEL: 106, GAS: 48 },
      range: { CRUDE: [60, 90], GASOLINE: [80, 130], DIESEL: [75, 120], JET_FUEL: [75, 125], GAS: [30, 60] } },
    MARKET: { seed: 7013, warmupHours: 720, historyHours: 720, dailyChangeLimit: 0.05, hourlyChangeLimit: 0.01,   // a price moves at most 1% an hour (bounded change)
      meanRevert: 0.004,                                                            // per hour, pulls the demand factor back to 1 (half-life about 7 days)
      sharedSigma: 0.0042, sharedWeight: 0.6,                                       // one crude-driven factor moves every product (refined products follow crude)
      sigma: { CRUDE: 0.0050, GASOLINE: 0.0052, DIESEL: 0.0050, JET_FUEL: 0.0056, GAS: 0.0070 },
      noise: 0.0035,                                                                // the Volatility factor: small hourly noise around the target
      regimeDrift: 0.00055, regimeHours: [72, 240],                                 // a slow up / flat / down trend that lasts days: the price has a direction, it is not white noise
      smooth: 0.35, floorMult: 1.0, ceilMult: 1.0, trendEps: 0.006,
      depth: { CRUDE: 600000, GASOLINE: 250000, DIESEL: 250000, JET_FUEL: 120000, GAS: 150000 }, impact: 0.35, impactHalfLifeDays: 5,
      // Phase 11: competition level per product (a multiplier on the target price), stock pressure above 80% full, and economic events (own random stream)
      competition: { CRUDE: 'MEDIUM', GASOLINE: 'HIGH', DIESEL: 'MEDIUM', JET_FUEL: 'LOW', GAS: 'HIGH' }, competitionMult: { LOW: 1.005, MEDIUM: 1.0, HIGH: 0.99 },
      stockPressure: 0.05, stockFrom: 0.8, eventChancePerDay: 1 / 60, maxEvents: 2,
      events: [
        { id: 'DEMAND_UP', label: 'ارتفاع الطلب العالمي', days: 12, demand: { ALL: 1.10 } },
        { id: 'DEMAND_DOWN', label: 'انخفاض الطلب العالمي', days: 12, demand: { ALL: 0.90 } },
        { id: 'PRODUCTION_UP', label: 'زيادة الإنتاج العالمي', days: 10, supply: { ALL: 0.93 } },          // more oil on the market: the price falls
        { id: 'SHORTAGE', label: 'نقص في المعروض', days: 8, supply: { ALL: 1.08 } },
        { id: 'OIL_CRISIS', label: 'أزمة نفطية', days: 20, demand: { CRUDE: 1.20, GASOLINE: 1.08, DIESEL: 1.08, JET_FUEL: 1.08, GAS: 1.04 }, supply: { CRUDE: 1.10 } },
        { id: 'TRANSPORT_UP', label: 'ارتفاع تكلفة النقل والطاقة', days: 15, cost: { freight: 1.30, energy: 1.20 } }   // purchases carry more freight, power costs more
      ] },   // selling a lot pushes the price down (Supply factor), then it recovers
    FEES: { spot: 0.01, contract: 0.0025 },
    QUALITY: { mult: { HIGH: 1.10, NORMAL: 1.00, LOW: 0.90 }, refinery: { HIGH: 1.03, NORMAL: 1.00, LOW: 0.95 }, share: { HIGH: 0.25, LOW: 0.25 }, highAt: 1.05, lowAt: 0.95 },

    // ---- costs
    STORAGE_COST: { CRUDE: 0.015, GASOLINE: 0.025, DIESEL: 0.025, JET_FUEL: 0.03, GAS: 0.06 },   // $ per stored bbl per day
    ENERGY: { pricePerKWh: 0.08 },
    POWER: { tiers: [{ name: 'شبكة 1', kw: 8000, monthly: 25000, connect: 0 }, { name: 'شبكة 2', kw: 25000, monthly: 90000, connect: 400000 }, { name: 'شبكة 3', kw: 80000, monthly: 260000, connect: 1500000 }, { name: 'شبكة 4', kw: 250000, monthly: 700000, connect: 5000000 }], startTier: 0, efficiencyFloor: 0.3 },
    // power (Phase 12): supply = grid capacity + bought power (if switched on); shortage stops the least important facilities first
    POWER_PRIORITY: { well: 1, separator: 2, pump: 3, refinery: 4, gas: 5, tank: 6, valve: 6, junction: 6 },   // 1 = most important, stopped last
    POWER_STOP: [{ below: 0.2, fromPriority: 6 }, { below: 0.1, fromPriority: 4 }, { below: 0.05, fromPriority: 2 }],   // normally efficiency falls gradually; only in severe shortage: below 20% supply tanks and valves stop, below 10% refineries and gas, below 5% separators too
    POWER_BUY: { maxKW: 5000, priceMult: 1.5 },                                      // bought power: at most 5,000 kW, at 1.5 x the grid price per kWh
    POWER_KW: { well: 25, pump: { S: 120, L: 300 }, separator: 350, refinery: { S: 2500, M: 8000, L: 28000, X: 65000 }, gas: 40, idleShare: 0.35 },
    OPERATING: { fixedShare: 0.4, conditionPenalty: 0.5 },                           // DailyOperatingCost = Base x (fixed + (1-fixed) x Load) x (1 + penalty x (1-Condition))
    MAINTENANCE: { damage: 2.5, utilBase: 0.6, utilSlope: 0.8,                       // MaintenanceCost = Base x DamageFactor x UtilizationFactor
      decayPerDay: { well: 0.0012, pump: 0.003, valve: 0.0004, junction: 0.0004, tank: 0.0006, gas: 0.0008, separator: 0.002, refinery: 0.0016 }, utilWear: 0.5,
      repairFraction: 0.35, autoRepair: true, autoRepairBelow: 0.5, cashReserve: 1000000,
      labels: [[0.8, 'جيدة'], [0.6, 'مقبولة'], [0.4, 'تحتاج صيانة'], [0.2, 'خطرة'], [0.0001, 'على وشك التعطل']] },
    VARIABLE: { liftingPerBbl: 26, chemicalsPerBbl: 0.9 },                           // lifting cost per barrel produced at a well; refinery chemicals / catalyst per barrel processed
    LABOR: { salary: { operators: 3600, engineers: 8800, maintenance: 4400, managers: 13500 }, perManager: 60,   // per employee per month
      staff: { well: { operators: 2, maintenance: 1 }, pump_S: { operators: 2, maintenance: 1 }, pump_L: { operators: 3, engineers: 1, maintenance: 2 }, valve: { operators: 0.25 }, junction: { operators: 0.25 },
        tank_S: { operators: 1, maintenance: 1 }, tank_M: { operators: 2, maintenance: 1 }, tank_L: { operators: 4, maintenance: 2 }, gas_S: { operators: 1, engineers: 1, maintenance: 1 }, gas_M: { operators: 2, engineers: 1, maintenance: 1 }, gas_L: { operators: 4, engineers: 2, maintenance: 2 },
        separator: { operators: 6, engineers: 2, maintenance: 3 }, refinery_S: { operators: 30, engineers: 8, maintenance: 12, managers: 2 }, refinery_M: { operators: 80, engineers: 20, maintenance: 30, managers: 4 }, refinery_L: { operators: 220, engineers: 55, maintenance: 80, managers: 8 }, refinery_X: { operators: 500, engineers: 120, maintenance: 180, managers: 16 } } },
    FIXED: { insurancePerMonth: 0.0015, adminBase: 12000, adminPerAsset: 0.0003, infraPerYear: 0.008 },   // monthly: insurance on asset value, administration, pipeline upkeep (share of pipe value per year)
    // ---- employees (Phase 9). Staff needed = what the buildings require (LABOR.staff). extra = hires beyond that (negative = missing staff).
    //      Team efficiency = role-weighted (coverage x efficiency); efficiency = (base + (1-base) x training) x fatigue(hours).  Trained crews = 1.0 (no change to the old numbers).
    HR: { roles: ['operators', 'engineers', 'maintenance', 'managers'], weight: { operators: 0.5, engineers: 0.25, maintenance: 0.25 },
      base: 0.85, newHireTraining: 0.3, trainingPerDay: 0.02, expBonus: 0.1, trainingCost: 500, trainingStep: 0.1,   // new hires start at 30% trained; training gains are gradual; experience speeds it up
      hoursStd: 48, hoursMin: 36, hoursMax: 60, fatiguePerHour: 0.005, fatigueMin: 0.85,                             // hours above 48 per week tire the crew
      shortageFloor: 0.5,                                                                                             // staffing cannot cut output below half
      surplusShare: 0.25, surplusMin: 2,                                                                              // extra hires are capped (a facility has room for a limited crew)
      engineerDecay: 0.5, engineerSurplusCut: 0.3, decayBounds: [0.7, 1.5] },                                        // missing engineers raise the failure rate; extra engineers lower it (bounded)
    // assets (Phase 14): straight line over the useful life, from the day the building goes into service, down to a residual value (not a fixed floor)
    ASSET: { conditionWeight: 0.5, residualShare: 0.10,                                // a building keeps 10% of its cost as residual value
      life: { well: 15, pump: 10, valve: 10, junction: 15, separator: 12, tank: 25, gas: 25, refinery: 20 } },                                            // useful life in years, per category
    TAX: { rate: 0.2, lossCarryForward: true },                                       // Tax = max(0, Revenue - AllowedExpenses - carried losses) x rate, settled monthly

    // ---- finance
    LOANS: { baseRate: 0.07, riskMax: 0.06, terms: [12, 24, 48, 60], amounts: [5000000, 10000000, 25000000, 50000000, 100000000, 250000000], maxDebtRatio: 0.5, prepayFee: 0.01,
      emergency: { rate: 0.18, term: 12, limit: 20000000, minAmount: 2000000, cover: 1.5 } },
    FINANCE: { emergencyAfterDays: 5, pressureAfterDays: 15, bankruptAfterDays: 40 },
    RISK: { liquidityMonths: 1, debtRatio: 0.5, costRatio: 0.9, salesDrop: 0.15 },      // financial stress indicators: a month of fixed costs in cash, debt above half of the assets, costs above 90% of sales, sales falling 15% a month
    AUTOSELL: { trigger: 0.8, target: 0.5, minPriceRatio: 0.92, force: 0.98, defaultMode: 'SPOT' },       // SPOT mode: above `trigger` fill sell down to `target`, unless the price is below minPriceRatio x base (then wait) or the tank is `force` full
    CONTRACTS: { maxActive: 3, offers: 3, offerValidDays: 10, deadlineDays: [20, 45], premium: [0.06, 0.18], penaltyPct: 0.15, rewardPct: 0.05, payDays: 7,   // a delivered contract is paid after payDays (a receivable until then)
      qty: { CRUDE: [10000, 25000, 50000], GASOLINE: [5000, 10000, 25000], DIESEL: [5000, 10000, 25000], JET_FUEL: [3000, 6000, 12000], GAS: [3000, 6000, 12000] } },
    // ---- purchasing (Phase 8). Buy price = reference price x (1 + supplier premium); a product's reference is its market price, a material's is the editable price below.
    //      Purchase total = qty x unit price + freight + fees.  Freight and fees are part of the cost of the goods (capitalised into stock).
    MATERIALS: ['CHEM', 'PARTS', 'OPS'],                                              // chemicals · spare parts · operating materials (stock pools, not tanks)
    MATERIAL_LABEL: { CHEM: 'مواد كيميائية', PARTS: 'قطع غيار', OPS: 'مواد تشغيل' },
    MATERIAL_PRICE: { CHEM: 2.5, PARTS: 1200, OPS: 40 },                             // editable starting prices ($ per unit): change them here, the engine reads them
    MATERIAL_USE: { CHEM: { per: 'refinedBbl', qty: 0.36 }, OPS: { per: 'refinedBbl', qty: 0.002 }, PARTS: { per: 'repair', qty: 1 } },   // units used: chemicals 0.36 per refined bbl (= 0.90 $/bbl at 2.5 $/unit, the existing cost); operating materials 0.002 per bbl; one spare part per repair
    SUPPLIERS: [
      { id: 'A', name: 'مورد أ', premium: 0.00, freightPerUnit: { crude: 0.40, product: 0.50, material: 0.05 }, feeRate: 0.005, creditDays: 30 },   // cheapest, pays 30 days after delivery
      { id: 'B', name: 'مورد ب', premium: 0.02, freightPerUnit: { crude: 0.25, product: 0.35, material: 0.03 }, feeRate: 0.003, creditDays: 15 },
      { id: 'C', name: 'مورد ج', premium: 0.04, freightPerUnit: { crude: 0.10, product: 0.15, material: 0.01 }, feeRate: 0.000, creditDays: 0 }     // dearest, cash only
    ],
    // ---- rescue measures (Phase 10): each one has a real financial effect in the journal
    RESCUE: { assetSaleRatio: 0.8,                                                    // an asset sells for 80% of its market value (its condition-adjusted value)
      rescheduleFee: 0.005, rescheduleMonths: [6, 12, 24, 48],                         // rescheduling: a fee on the balance; new installments over the chosen months
      loanMax: 20000000, loanRate: 0.18, loanTerm: 12, collateral: 1.0,               // rescue loan: at most loanMax, backed by assets + stock (collateral x amount), only in a financial crisis, one at a time
      costCutShare: 0.2, costCutMonths: 6 },                                          // cost cut: administration and tank operation 20% lower for 6 months
    ALERTS: { lowCashDays: 20, highOpexRatio: 0.9, lowMarginRatio: 0.05, highStorageRatio: 0.08, loanDueDays: 3, contractDays: 5, lowInventoryFill: 0.05, highInventoryFill: 0.9, priceMove: 0.035, cooldownDays: 3 },
    OFFLINE: { capHours: 24, minSeconds: 60, gameDaysPerRealHour: 6, stepHours: 3 }  // away: at most capHours of real time count; each real hour = 6 game days (1/50 of the speed of playing); simulated in 3 h steps
  };
});
