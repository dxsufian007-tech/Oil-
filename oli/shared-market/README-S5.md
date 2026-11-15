# OLI shared world market (S5) - architecture, status, requirements

## Status (honest)
- Implemented and tested LOCALLY: authoritative core (`market-core.js`), HTTP server (`server.js`), retrying client (`client.js`), 37 checks in `test-shared-market.js` (real HTTP, several clients).
- NOT deployed anywhere. No public server is running. The game UI is NOT yet connected to it: the single-player market (S1-S4) is unchanged and works offline. Until a server is deployed and the UI is wired to `client.js`, the game has no online market.

## Model
One shared crude order book for all players, price-time priority, limit + market orders, partial fills, 0.2% fee per side, trade log chained by SHA-256.
Prices and depth come ONLY from players' real resting orders (no simulated liquidity). Escrow: a sell locks oil, a limit buy locks cash+fee, so balances cannot go negative and oil cannot be sold twice. Self-trades are skipped (no wash trades). Max 20 open orders/player, qty and price range limits, tick 0.01.

## What lives on the server (and why)
Everything authoritative: accounts, book, matching, fees, trade log, idempotency memory, persistence. Clients only send `place` / `cancel` with an idempotency key; fields like cash or price overrides are ignored. Tokens are HMAC(secret, playerId) issued by the server; the secret must be fixed in production (`OLI_SECRET`).
Disconnects/retries: the client retries with the SAME key; the server replays the stored result, never executes twice (also after a restart, because the key memory is persisted).

## Known limits (not done)
- Token = player id proof only; no password/account recovery, no Google/Play sign-in. Needs a real identity layer before public use.
- Link between a player's company inventory (game save) and the shared account is NOT built: shared accounts start with their own cash/oil. A secure transfer (company <-> market account) must be server-verified; a local save can be edited by the player, so shared money must never be derived from it without server-side issuance.
- Single process, JSON-file persistence, single-threaded: suitable for tens/hundreds of players, not millions. Needs a database (e.g. SQLite/Postgres) and TLS reverse proxy for production.
- No anti-bot/abuse monitoring beyond a per-second rate limit.

## Requirements and cost (ESTIMATES, not quotes)
- 1 small Linux VM (1 vCPU, 1 GB RAM) with Node 18+, a domain + TLS (reverse proxy), daily backup of the data file. Typical small-VM prices are in the order of a few USD to ~10 USD per month depending on the provider; verify current provider pricing before deciding.
- Run: `OLI_SECRET=<long random> DATA_FILE=/var/lib/oli/market.json PORT=8787 node oli/shared-market/server.js`
