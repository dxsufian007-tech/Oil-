# OLI shared world market (S5) - architecture, security, status

## Status (honest)
- Implemented and tested LOCALLY with real HTTP: core, server, auth, client. 34 functional + 50 security checks.
- NOT deployed. The game UI is NOT connected to it. Do not call S5 "online-ready" until: it is deployed behind TLS, the game client is wired to `client.js`, and a real multi-device test has been done.
- Branch: `feature/market-s5-shared` only. It is not part of the S1-S4 candidate.

## Authentication (replaces the open /join)
- `/register` {id, password}: id 3-32 chars starting with a letter; password 10-128 chars, not containing the id. An id that exists (any letter case) can NEVER be re-registered: knowing a name gives no access.
- Passwords: scrypt (N=16384) + 16-byte random salt per user, constant-time compare. Unknown ids cost the same time as wrong passwords and give the same answer.
- `/login` -> access token (15 min) + refresh token (7 days), both random 256-bit, only SHA-256 stored on the server. Refresh tokens are single-use (rotation); re-using a used one revokes the whole session (theft detection). A session dies after 30 days in any case. `/logout` revokes.
- Lockout: 5 wrong passwords -> 15 min lock on the account. Per-address limits: 30 login attempts/min, 5 registrations/hour (X-Forwarded-For is trusted only when TRUST_PROXY=1, i.e. behind your own proxy).
- The player id always comes from the verified token. Body fields such as cash, oil, fee, price, id, pid are ignored.

## Data integrity
- Escrow: a sell locks oil, a limit buy locks cash+fee; balances cannot go negative, oil cannot be sold twice. Idempotency keys are per player and persisted.
- The trade log is an HMAC chain keyed from the server secret (the key is never written to the data file). On every start the file is re-verified: balances are REPLAYED from the signed trade log; cash/oil conservation, locks and the chain are checked. A hand-edited data file (cash, oil, moved money, edited/deleted trade, re-hashed trade, wrong secret) makes the server refuse to start. File mode 0600.
- Limit: someone with BOTH the data file and the secret can forge anything. Keep the secret out of the data volume (environment/secret manager) and back up both separately.

## Model
One shared crude order book, price-time priority, limit + market orders, partial fills, 0.2% fee per side, no self-trades, max 20 open orders per player. Prices and depth come only from real resting orders (no simulated liquidity).

## Run
`OLI_SECRET=<32+ random chars> DATA_FILE=/var/lib/oli/market.json PORT=8787 TRUST_PROXY=1 node server.js` (listens on 127.0.0.1; put nginx/Caddy with TLS in front). A `Dockerfile` is included (untested here: no Docker in the build environment).

## Still missing before real players (not done)
1. Deployment + TLS + backups, and a real test from phones over the internet.
2. Wiring the game UI to the client (login screen, order screen, token storage in the app).
3. Starting cash/oil are issued free to every new account (a test model). In a real game, issuance must be decided server-side; linking company inventory to the shared account needs a server-verified transfer, because local saves can be edited by the player. Without it, registering many accounts (5/hour/address) is a way to mint money.
4. Email/recovery of lost passwords, account deletion, abuse monitoring, a database instead of one JSON file (single process: tens to low hundreds of players).
5. No CORS headers: a browser/WebView client on another origin needs them added deliberately.
6. Independent security review before public use.

## Requirements and cost (ESTIMATES, not quotes)
1 small Linux VM (1 vCPU, 1 GB), domain + TLS, daily backups. Typically a few USD to ~10 USD/month depending on provider; verify current pricing.
