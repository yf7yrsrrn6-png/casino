# Deploying TakeMyLucky (live test link)

The whole platform runs as **one Node web service**: it serves the built SPA,
the REST API, and the realtime WebSocket, with SQLite on a persistent disk.
This is why a single deploy gives you a fully working public URL — no split
frontend/backend needed.

> Netlify note: Netlify hosts static sites + short-lived serverless functions,
> so it cannot run this persistent server, its WebSocket, or SQLite-on-disk.
> Use Render (below) — or any host that runs a long-lived Node process — to
> deploy the whole app as one service.

## Fastest: Render (one click, free tier)

1. Push this branch (already done): `claude/casino-site-demo-nnungs`.
2. Go to https://render.com → sign up / log in (free).
3. **New → Blueprint** → connect your GitHub → pick the `casino` repo.
4. Render reads `render.yaml` and proposes the **takemylucky** service. Click
   **Apply**. It auto-fills build/start commands, a persistent disk for the DB,
   and a generated `JWT_SECRET`.
5. Wait for the first build (~2–4 min). You get a URL like
   `https://takemylucky.onrender.com`.

That URL is your live test link — open it, register, and play.

### Demo logins (seeded automatically on first boot)
- `alice@demo.tml` … `erin@demo.tml`  ·  password: `password123`
- Or just register a new account (email + password).

### Make yourself an admin
In the Render service → **Environment**, set `ADMIN_EMAILS` to your email
(comma-separated for several), then redeploy. Log in and open `/admin`.

## Notes
- Free Render web services sleep after inactivity; the first request after a
  nap takes ~30–60s to wake. The persistent disk keeps all accounts/balances.
- Everything is **demo credits only** — `REAL_MONEY_ENABLED=false`. No real
  deposits, withdrawals, or KYC until a licensed operator wires a payment/KYC
  provider and flips the flag.

## Alternative hosts
Any platform that runs a persistent Node process with a writable disk works the
same way (Railway, Fly.io, a VPS with the included `Dockerfile` /
`docker-compose.yml`). Required env: `NODE_ENV=production`, a strong
`JWT_SECRET`, and `DB_PATH` pointing at persistent storage.
