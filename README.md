# TakeMyLucky — Casino Platform

A full-stack casino web platform: a React + TypeScript front end and a Node/Express + SQLite
backend with **real, separate, server-side accounts**. Every balance, transaction and game
outcome lives on the server — the browser only renders and animates what the server decides.

> **Money model.** This build runs entirely on **virtual demo credits with no cash value**.
> Real-money deposits and withdrawals are intentionally **not** implemented — the payments
> layer (`server/services/payments.ts`) is a provider-agnostic boundary that reports the
> cashier as disabled until a licensed operator wires in a real payment/KYC provider and sets
> `REAL_MONEY_ENABLED=true`. Operating a real-money casino requires a gambling licence in your
> jurisdiction; the software does not grant one.

## Features

**Accounts & security**
- Real registration / login with server-side sessions (JWT in an httpOnly cookie)
- Passwords hashed with scrypt + per-user salt; never stored or hashed in the browser
- Each account is isolated on the server (its own wallet, ledger, history, seeds)
- Rate limiting, input validation (zod), banned-account and self-exclusion guards

**Wallet & ledger**
- Server-authoritative balances; every bet/win/deposit is an append-only transaction
- Atomic settlement (a bet can never overdraw or double-spend)
- Demo top-ups and balance reset; full transaction history per account

**Games (all resolved on the server)**
- **Slots** — 6 machines, weighted reels, 5 paylines, animated to the server result
- **Blackjack** — server holds the shoe & state; hit / stand / double, dealer stands on 17, 3:2
- **Roulette** — European single-zero wheel with inside & outside bets

**Provably fair**
- Each outcome is `HMAC-SHA256(serverSeed, "clientSeed:nonce")`
- The server commits to `sha256(serverSeed)` up front; rotate to reveal the seed and verify
  past rounds (Settings → Provably fair)

**Responsible gambling**
- Per-account max-bet, daily-loss and daily-deposit limits
- Self-exclusion / cool-off that blocks play for a chosen number of days
- Prominent 18+ / demo labelling

**Admin**
- Admin dashboard: platform stats, player search, balances, adjust credits, ban/unban
- Admin-only API guarded by role; actions written to an audit log

**Other**
- Three languages (Ukrainian, Russian, English), switchable and persisted
- Responsive, theme-consistent UI

## Tech stack

- **Front end:** React 19, TypeScript, Vite, Tailwind CSS v4, React Router, Zustand, i18next
- **Back end:** Node 22, Express 5, better-sqlite3, jsonwebtoken, zod
- **Storage:** SQLite (WAL). Money is stored as integer credits (no floats).

## Getting started

```bash
npm install
cp .env.example .env          # then set JWT_SECRET (see the file for a generator)
npm run dev                    # runs the API (:3001) and the Vite dev server (:5173) together
```

The Vite dev server proxies `/api/*` to the backend, so cookies are same-origin.

To make yourself an admin, add your email to `ADMIN_EMAILS` in `.env` and register/log in.

## Production

```bash
npm run build                  # type-checks and builds the SPA into /dist
NODE_ENV=production JWT_SECRET=... npm start
```

In production the Express server serves the built SPA from `/dist` and the API from the same
origin on `PORT` (default 3001). Put it behind a TLS-terminating reverse proxy (nginx, Caddy,
a platform load balancer). `secure` cookies are enabled automatically when `NODE_ENV=production`.

## Scripts

| script | purpose |
| --- | --- |
| `npm run dev` | backend + frontend together (dev) |
| `npm run dev:web` / `dev:server` | run either half alone |
| `npm run build` | type-check + production SPA build |
| `npm start` | run the server in production (serves API + SPA) |
| `npm run typecheck` | type-check web and server |
| `npm run lint` | oxlint |

## Project layout

```
server/
  config.ts            env-driven config (secrets required in prod)
  db/                  better-sqlite3 connection + ordered migrations
  lib/                 password (scrypt), token (JWT), provably-fair, http, validation
  middleware/          auth, admin, rate limit, self-exclusion guard
  services/            accounts, wallet ledger, fairness, rounds, blackjack, payments
  games/               server slot/blackjack/roulette engines (source of truth for math)
  routes/              auth, wallet, account, slots, blackjack, roulette, admin, payments
  index.ts             Express app; serves the SPA in production
src/
  lib/api.ts           typed fetch client
  store/               session + wallet (server-backed) + settings (local)
  pages/, components/  UI, incl. Admin dashboard and Roulette
```

## Going live with real money (later)

1. Obtain a gambling licence for your target jurisdiction.
2. Implement a concrete `PaymentProvider` in `server/services/payments.ts` (deposits, payouts,
   webhooks) and a KYC/AML flow with your provider.
3. Have the RNG / game math certified as required by your regulator.
4. Only then set `REAL_MONEY_ENABLED=true`.

Until all of that is in place this remains a demo on virtual credits with no cash value.
