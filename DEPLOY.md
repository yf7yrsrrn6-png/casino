# Розгортання Trading Journal (публічне посилання)

Застосунок — це **один Node-сервіс**: він віддає зібраний SPA і REST API, а
SQLite з завантаженими графіками лежить на постійному диску. Тому один деплой
дає повністю робочий публічний URL — не треба окремо фронт і бекенд.

> Netlify/Vercel-статик не підійдуть: потрібен довгоживучий Node-процес із
> записуваним диском (Render, Railway, Fly.io або VPS).

## Render (найпростіше, читає `render.yaml`)

New → **Blueprint** → підключіть цей репозиторій → **Apply**. `render.yaml` уже
описує постійний диск, згенерований `JWT_SECRET` і `DATA_DIR=/var/data`.

Кнопка (потрібен ваш власний акаунт Render):
https://render.com/deploy?repo=https://github.com/yf7yrsrrn6-png/casino

Після білду отримаєте публічний URL. Відкрийте його і створіть свій акаунт —
перша реєстрація стає власником журналу, далі реєстрація закривається.

## Railway (будує `Dockerfile`)

1. https://railway.app → увійдіть через GitHub.
2. **New Project → Deploy from GitHub repo** → виберіть репозиторій і гілку
   `claude/trading-platform-mac-puadcu`. Railway прочитає `railway.json` і
   збере `Dockerfile`.
3. Додайте **Volume** з mount path `/var/data` — там житимуть база й зображення.
4. Змінні (**Variables**):
   - `NODE_ENV=production`
   - `DATA_DIR=/var/data`
   - `JWT_SECRET=` → довгий випадковий рядок (`openssl rand -hex 32`); можна не
     задавати — сервер згенерує й збереже сам.
   - `OPEN_REGISTRATION=false`
5. **Settings → Networking → Generate Domain** — отримаєте публічний URL.

## Fly.io (CLI)

```bash
fly launch --no-deploy               # виявить Dockerfile, створить fly.toml
fly volumes create data --size 1
# у fly.toml додайте [mounts]: source = "data", destination = "/var/data"
fly secrets set JWT_SECRET=$(openssl rand -hex 32) DATA_DIR=/var/data
fly deploy
```

## Docker / VPS

```bash
docker compose up --build            # застосунок на :3001, дані у томі journal-data
```

## Примітки

- Безкоштовні сервіси Render засинають після простою; перший запит після сну
  прокидається ~30–60 с. Постійний диск зберігає всі дані.
- Мінімальні env для будь-якого хоста: `NODE_ENV=production`, `DATA_DIR` на
  постійному диску (і за бажанням `JWT_SECRET`).
