# Central Hybrid Network — every value and where it comes from

Nothing below was invented. Each figure is read from the existing engine configuration (so changing the config changes the network) or is derived from those figures. `test-central-values.js` pins every row to its source and checks the engine never exceeds it.

## Physical values
| Value | Figure | Source |
|---|---|---|
| Channel capacity | 300,000 bbl/day per channel | `CFG.PIPES[36].capacity` — the existing 36" pipe class |
| Channel max pressure | 3,000 psi (a pump can never lift the pressure above it) | `CFG.PIPES[36].maxPressure` |
| Friction | 0.6 × the engine's law `frictionPsiPerTile · (flow/capacity)^1.8` | `CFG.PIPES[36].fric`, `CFG.SIM.frictionPsiPerTile / frictionExp` (same law as the old pipes) |
| Source head | the tank head of the existing Sim (60 psi) | `CFG.SIM.tankHeadPsi` |
| Pump | max flow 200,000 bbl/day, inlet ≥ 15 psi, boost 300–600 psi, efficiency 0.88–0.94 | `CFG.PUMP.C` (the existing Central Pump Station). Each pump takes a deterministic value inside those ranges |
| Pump count / places | 18 = 3 hubs (JN, JM, JS on the east backbone) × 6 channels; each on one backbone segment, default Forward (north→south) | design choice (documented): the existing pump figures, three hubs |
| Pump direction | Forward = a→b of its segment, Reverse = b→a; the pump boosts only the way it pushes, the other way the product bypasses it unboosted | design (bidirectional pumps, as ordered) |
| Line-pack (product inside the pipe) | tiles × bore volume of a 36" tile × utilisation | real geometry: π·(36"/2)² × `CFG.TILE_METERS` |
| Distribution at a branch | existing water-filling: each destination's real intake (branch size, free space, pressure that reaches it) is probed, equal shares are capped by what each can take, the rest goes to the others | the existing `Sim` offer/accept/split semantics — no new priority |
| Losses | none (physicalLoss = 0, as the existing engine) | `CFG.REFINERY.physicalLoss`; no loss rate was added |
| Colours | crude #4a3a2c, jet #4aa3ff, the rest = the game's product colours | `CFG.PRODUCT_COLOR` |
| Faults | manual only (the player can cut a segment / channel / pump) | no random fault rate invented |
| Station throughput | not capped (a 36" hub, bounded by its pipes). The 60,000 bbl/d limit belongs to the old 1×1 junction | assumption, documented |

## Money
| Value | Figure | Source |
|---|---|---|
| Starting cash | $500,000,000 | the order |
| Loan | 100% of the network value, 6%, 720 months, 24 months interest-only | the order (`CENTRAL` in `economy-config.js`) |
| Shell price | $720,000 per tile = six 36" channels × $120,000 | `CFG.PIPES[36].cost` × 6 |
| Stations | $720,000 each (+ terrain multiplier when tapped later) | same tile price |
| Pumps | $45,000,000 each | `CFG.PUMP.C.cost` |
| Network value | $6,078,240,000 = shell $5,247.36M (7,288 tiles) + 29 stations $20.88M + 18 pumps $810M | computed; the $5.3B estimate matches the shell alone |
| Pipeline upkeep | 0.8 % of the shell per year, monthly | `FIXED.infraPerYear` (the existing rate) |
| Pump / station running cost | the existing `opDay` / `maintDay` formulas on the existing pump (op $9,000, maint $4,500 per day) and junction figures | `CFG.PUMP.C`, `CFG.JUNCTION`, `OPERATING`, `MAINTENANCE` |
| Insurance, administration | not charged on the network | not in the order |
| Interest | on the REMAINING principal only, monthly; early repayment (partial or full) has no penalty on this loan | `Company.prepayLoan` |
