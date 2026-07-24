# Deploying TakeMyLucky (live test link)

## One-click deploy buttons

The final "Deploy" step must be done from **your own** hosting account (it is
tied to your login and billing), but these buttons pre-fill everything so it is
essentially one click after you sign in:

- **Render** (reads `render.yaml` — auto-creates the disk + `JWT_SECRET`, the
  fewest manual steps):
  https://render.com/deploy?repo=https://github.com/yf7yrsrrn6-png/casino

- **Railway** (builds the `Dockerfile`): open https://railway.app/new → **Deploy
  from GitHub repo** → pick `yf7yrsrrn6-png/casino`, branch
  `claude/casino-site-demo-nnungs`, then add a volume at `/app/data` and the
  variables listed below.

After it finishes you get a public URL — that is your live test link.

---


The whole platform runs as **one Node web service**: it serves the built SPA,
the REST API, and the realtime WebSocket, with SQLite on a persistent disk.
This is why a single deploy gives you a fully working public URL — no split
frontend/backend needed.

> Netlify note: Netlify hosts static sites + short-lived serverless functions,
> so it cannot run this persistent server, its WebSocket, or SQLite-on-disk.
> Use any host that runs a long-lived Node process (Railway, Fly.io, Render, a
> VPS) to deploy the whole app as one service.

## Recommended: Railway (GitHub deploy, builds our Dockerfile)

1. Push this branch (already done): `claude/casino-site-demo-nnungs`.
2. Go to https://railway.app → sign in with GitHub.
3. **New Project → Deploy from GitHub repo** → pick the `casino` repo, and set
   the branch to `claude/casino-site-demo-nnungs`. Railway reads `railway.json`
   and builds the included `Dockerfile` (SPA + API + WebSocket in one service).
4. Add a **Volume** (service → **Data / Volumes → Add Volume**), mount path
   `/app/data`. This is where SQLite lives so accounts survive restarts.
5. Set **Variables** (service → **Variables**):
   - `NODE_ENV=production`
   - `JWT_SECRET=` → a long random string (e.g. run `openssl rand -hex 32`)
   - `DB_PATH=/app/data/casino.db`
   - `REAL_MONEY_ENABLED=false`
   - `ADMIN_EMAILS=` → your email (optional, for `/admin`)
6. Service → **Settings → Networking → Generate Domain**. You get a URL like
   `https://takemylucky-production.up.railway.app`.

That URL is your live test link — open it, register, and play. Railway injects
`PORT` automatically and the server listens on it.

## Alternative: Fly.io (CLI, free-tier friendly)

```bash
# one-time: install flyctl, then from the repo root:
fly launch --no-deploy          # detects the Dockerfile, creates fly.toml
fly volumes create data --size 1
# in fly.toml add a [mounts] entry: source = "data", destination = "/app/data"
fly secrets set JWT_SECRET=$(openssl rand -hex 32) DB_PATH=/app/data/casino.db REAL_MONEY_ENABLED=false
fly deploy
```
`fly open` prints your public URL.

## Alternative: Render (blueprint in `render.yaml`)

New → Blueprint → connect the repo → Apply. Uses `render.yaml` (persistent
disk + generated `JWT_SECRET` already defined).

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
