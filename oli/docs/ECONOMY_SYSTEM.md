# Phase 3 — Economy, Market, Company

Files: `economy-config.js` (every number), `economy.js` (Company, Market, ledgers), `economy-ui.js` (HUD + 8 screens). Read-only layer over Phase 2: it only writes `b.s.ecoEff`, `b.c`, `b.st`.

## Time
Game hour tick, day 24 h, month 30 d, year 360 d. 1x = 12 real s per game day. Accumulator, capped per tick: independent of FPS. Speeds: pause/1x/2x/5x/10x.

## Market
Price = Base × Demand × Supply × Volatility, smoothed, ±5%/24h, clamped to the range (crude 60–90, gasoline 80–130, diesel 75–120, jet 75–125). Quality ×1.10/1.00/0.90. Spot fee 1%, contract 0.25%. Sales push the supply factor down (impact decays, half-life 5 d).

## Costs
Operating = Base × (0.4 + 0.6·load) × (1 + 0.5·(1−cond)). Maintenance = Base × (1 + 2.5(1−c)^1.5) × (0.6 + 0.8·load). Wear/day = decay × (0.5 + load). Condition 0 → DAMAGED. Power tiers limit efficiency (0.3 + 0.7·factor). Labor: auto-staffing per building, monthly payroll.

## Finance
Net = Revenue − fees/lifting/chemicals − (operating+maintenance+energy+storage+labor+insurance+admin+infra) − interest − tax.
EndingCash = StartingCash + CashIn − CashOut. Loan payment = P·r(1+r)^n/((1+r)^n−1), r=annual/12; rate 7%+6%·debt ratio. Tax 20% monthly with loss carry-forward. Bankruptcy: warning → emergency credit (5 d, 18%, ≤$20M) → debt pressure (15 d) → bankruptcy (40 d).

## Offline
Cap 24 real h, 1 real h = 6 game days, 3 h steps, min 60 s, bad clock (past/NaN) = nothing. "WHILE YOU WERE AWAY" report, time paused until CONTINUE.

## Tests
`node test-economy.js` (40 spec items + regressions), `test-economy-ui.js` (touch, phone viewport), `.github/android/economy-android.js` (emulator, real touch, close/reopen). REAL DEVICE TEST: NOT TESTED.
