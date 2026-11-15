# OLI EMPIRE — Global Market S1–S5 Baseline Audit

Date: 2026-11-15
Working branch: `feature/global-market-s1-s5`
Base: current `main` at branch creation
Scope: read-only baseline inspection; no gameplay code changed in this commit.

## Confirmed existing architecture

### Oil Market Engine (`oli/oil-engine.js`)
- Pure simulation model: no DOM, wall clock, or historical-price dataset dependency.
- Advanced once per in-game day; hourly simulation interpolates the daily target and adds intraday candle movement.
- Crude price is represented as `PEQ * exp(x)`.
- The engine tracks separate oil accounts:
  - `C`: commercial stock available to the market.
  - `H`: hoarded/held-off-market stock.
  - `R`: strategic reserve, separate from commercial stock.
- Daily production `P) is derived from four producer groups (OPEC+, Americas, Russia/nearby, other producers).
- Daily demand `D) is affected by industrial activity, price elasticity, seasonality and news.
- The target price includes inventory-cover pressure, the supply-demand gap, live-news sentiment and regime sentiment.
- The current engine defaults include `gapSign: -1`, i.e. surplus lowers the target and shortage raises it. Preserve this economically correct sign unless a reproducible test demonstrates a defect.
- The engine has seeded randomness, market regimes, event activation/expiry, stock-flow accounting and a company footprint in world supply.

### News and events (`oli/news-data.js`)
- Contains 100 Arabic oil-market events.
- Events can affect world supply (`sup`), demand (`dem`), sentiment (`sent`), hoarding (`hoard`), strategic releases (`rel`), product-specific factors and logistics costs.
- Events have probabilities, durations, seasonal/state conditions and cooldown/rarity handling in the engine.
- The file explicitly distinguishes simulated event scenarios from historical event records.

### Market interface (`oli/market-ui.js`)
- Arabic RTL, mobile-first market screen.
- Displays Brent and refined products, price change, candlestick charts, news and advanced details.
- Chart periods D/W/M/Y are grouped from the game's candle history via `OE.groupOHLC`.
- UI is a view over the economy/engine state; it should not own economic calculations.

### Existing tests and legacy market
- `oli/test-oil-engine.js` exercises paired economic scenarios using matching seeds/control runs.
- `oli/test-market.js` tests the older generic random-walk market separately; its header explicitly says the oil engine and historical market have separate tests.
- `oli/economy-config.js` keeps the generic legacy market configuration while enabling the Oil Market Engine by default.
- Do not confuse legacy product-market tests with Brent engine tests.

## Risks and required verification before S1 code changes

1. The engine header says it has no historical prices. Historical Brent data therefore lives outside the engine and must be located and audited separately before changing chart history.
2. The historical series, simulated forward series and OHLC aggregation must remain distinct and date-consistent.
3. The player buy/sell footprint must close the oil-accounting identity; test `C/H/R`, company inventory and ledger together.
4. News impacts already enter supply, demand, sentiment, hoarding, reserve release and cost channels. S1–S3 must avoid applying the same event twice.
5. The engine's stock-flow identity and strategic-reserve separation are foundational invariants; do not collapse the accounts.
6. Market UI is currently a pure view. Keep economic rules in the engine/model layer and UI actions in the existing action/controller path.
7. S5 requires a server-authoritative market and concurrency/idempotency guarantees; it cannot be considered complete from client-side UI or local simulation alone.

## Implementation sequence

### S1 — Market engine
- Audit and expose a single authoritative daily market snapshot: production, demand, net balance, commercial stock, hoarded stock, strategic reserve, spare capacity, utilisation, player share and Brent price.
- Verify every displayed metric against engine state and accounting.
- Add multi-seed / multi-horizon regression tests before tuning any coefficients.
- Keep the existing `gapSign=-1` behavior and stock-accounting invariants unless evidence requires a reviewed change.

### S2 — Trading and depth
- Define explicit order records, order lifecycle, partial fills, fees, price impact and cancellation semantics.
- Use a documented simulated liquidity model if there is no real counterparty book.
- Make large-order execution quantity- and depth-sensitive; ensure ledger and inventory reconciliation.

### S3 — Events
- Audit all 100 existing events before adding any.
- Normalize event impact channels and ensure each event's supply/demand/sentiment/logistics effects are not double-counted.
- Add overlap, expiry, cooldown, rare-event and save/load tests.

### S4 — Analytics and forecasts
- Audit the actual historical Brent dataset, source attribution, date coverage, missing dates and duplicate records.
- Keep historical observations immutable; simulated future values must be labelled as simulation.
- Keep forecasts informational only and separate from price formation.

### S5 — Shared multiplayer market
- First document available backend/network infrastructure and deployment constraints.
- Implement server-authoritative orders, inventory, balances, atomic fills, idempotency keys, concurrency control, reconnect/retry handling and audit logs.
- Require integration tests with concurrent players and a deployed test service before declaring S5 complete.

## Acceptance gates
- `npm test` must pass in full (`rc=0`).
- Add focused tests for each phase and a full integration run.
- Multi-seed 30/90/365-day and multi-year tests must report price, P, D, C, H, R and account reconciliation.
- Historical data tests must prove source/date integrity and no synthetic backfill.
- Mobile UI tests at 412px and smaller widths must show no overflow or clipped controls.
- Performance must be measured at supported simulation speeds.
- APK must be built from the integrated candidate only after all tests pass.
- No merge to `main` and no public official release until owner approval.

## Current status
This audit is based on inspected source files only. No economic coefficients, historical data, gameplay behavior, save schema or UI code has been changed yet. The next safe implementation step is the S1 authoritative snapshot plus baseline regression tests, after completing the historical-data and market-accounting audit.
