# Deferred projects (not part of the current release)

## 1. Online Multiplayer / Shared Global Market (S5)  — DEFERRED, project no. 1
Decision of the owner (Nov 15): S5 is **not** part of the current release, is **not** merged with S1–S4, no online server is deployed and no multiplayer feature is enabled. It is not to be developed or continued until the owner explicitly re-opens the project.

State of the preserved work (nothing deleted, nothing active in the game):
- Branch `feature/market-s5-shared`: authoritative market core, HTTP server, authentication (scrypt, rotating tokens, lockout, rate limits), HMAC-signed trade log, 34 functional + 50 security tests, `shared-market/README-S5.md` (status, security notes, what is still missing, cost estimate).
- Branch `integration/market-s1-s5`: the earlier S1–S5 integration (kept as it is, for reference only; its candidate APK is not to be released).
- The game does not load or call any of this code; the single-player market (S1–S4) works fully offline.

Known open items if the project is ever re-opened: deployment behind TLS, wiring the game UI, server-side issuance of starting cash/oil and company↔market transfers, password recovery, a database, independent security review, a real multi-device test.

## Current priority
Finish, test and approve S1–S4 independently (branch `release-candidate/market-s1-s4`).
