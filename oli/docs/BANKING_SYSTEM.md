# Banking & Financial System — architecture (spec v1.1, Phases 1–7)

## Principles
- The banking layer is independent of `Company`. Each bank keeps its own double-entry `BankBook` (CASH, OTHER, LOANS, DEPOSITS, CAPITAL, RETAINED). The company side is booked only through the io interfaces `Company._bankIO()` and `Company._bondIO()` into the company Journal.
- No banking logic runs per frame. Everything is driven by calendar hooks: `_newDay` (accrual, margin check only if liens exist, arrears/default handling only if loans exist), `_monthEnd` (`_bankMonth`: service, quarterly review, bond monthly), `_creditMonth`.
- No `Math.random`, no wall clock: the bond market uses a saved xorshift generator; all dates are game-calendar days.
- Journal accounts `BANK_LOANS`, `ACCRUED_INT`, `BOND_INV`, `BOND_DEBT` are OPTIONAL in the save (written only while non-zero) so a game with no banking activity saves and simulates identically (digests 64a28a58a78e @12h, 76cd7c8c1a55 @48h on the real save).
- Protected files untouched: `industry.js`, `central.js`, `central-plan.js`.

## Files
| File | Role |
|---|---|
| `bank.js` | Banks, loan book, liens, defaults/restructuring, crisis, save v1–v5 (all load) |
| `baserate.js` | Base Rate (EMA360, weights .40/.25/.35, 0.50% step, two-review confirmation, cooling, liquidity surcharge) |
| `loans-engine.js` | Annuity schedules, grace, cycles M/Q/A, validation |
| `credit.js` | Score 0–1000, grades A–E and rate premium |
| `bonds.js` | Bond market: 6 issuers, 18 bonds, pricing, coupons, defaults, own issuance |
| `banking-ui.js` | View-only dashboard (overview, loans, credit, bonds, log) |
| `economy.js` | Hooks and the Company API (`takeBankLoan`, `buildFinanced`, `buyBond`, …) |
| `economy-config.js` | `BANKS`, `LOAN_TYPES`, `BANK_LOANS`, `CREDIT`, `COLLATERAL`, `DEFAULT`, `BONDS`, `BUILD_FINANCE` |
| `ledger.js` | Journal (optional accounts) |

## Operations
- **Loan**: `bankQuote` → `takeBankLoan` (bank pays from liquidity, company books cash in / `BANK_LOANS`). Instalment not covered by cash becomes arrears (no negative cash), 2% late fee once per instalment.
- **Collateral**: ASSET (LTV max 60%, call 75%), OIL (50%/60%, ≤ 2 years), 30-day cure; double pledge refused; pledged assets cannot be sold or demolished. The strategic reserve is NOT collateral.
- **Default**: stages 1–5 by delay; restructuring offer at stage 4 (60 days); enforcement least-harm first (oil, idle assets, running assets). With active bank loans, day 40 of negative cash opens a restructuring crisis instead of immediate bankruptcy; without bank loans the legacy 5/15/40 ladder is unchanged.
- **Financed construction (Phase 7)**: `Company.buildFinanced(defId, x, y, r, {ltc, bank, type, term})`. Steps: pure validation of the site (no spend) → check own cash share → loan quote (all risk rules apply, incl. the 50% debt limit) → loan booked via `takeBankLoan` (Journal) → building placed through the wrapped `store.place` (Journal `BUILD`, FIXED at full cost), so `sync()` never records it as "Pipeline works". Defaults: PROJECT_FINANCE, STRATEGIC bank, 70% loan-to-cost (max 80%), 10 years, minimum loan 1M. If placement ever failed after the loan, the loan is repaid immediately.
- **Bonds**: buy/sell at bid/ask, semi-annual coupons, issuer default with recovery after 6 months, own issuance (score ≥ 400).

## Open points (by owner decision)
- Strategic stockpile as collateral: excluded until an approved rule exists.
- Emergency loan (Commercial bank): proposed, locked until explicit approval.

## Tests (all in `npm test`)
`test-bank-foundation, -baserate (30), -loans (70), -credit (20), -collateral (55), -default (50), -bonds (59), -ui (21), -integration (28)`; browser UI tests (`test-banking-ui.js`, 18) run separately with playwright.
