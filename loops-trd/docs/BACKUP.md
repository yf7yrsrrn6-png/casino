# Резервні копії та відновлення бази

Уся бізнес-інформація Loops Trd (учасники, угоди, чати, журнали, антифрод) — у Postgres (Supabase).
Кошти лежать у смарт-контракті й не залежать від бази: навіть при втраті БД стан угод відновлюється з блокчейну
(кіпер звіряє всі угоди; події контракту індексуються з курсору `chain_cursor`).

## Що вже є

1. **Supabase** — щоденні бекапи на платних тарифах (Pro: 7 днів) і **PITR** (відновлення на будь-яку секунду) як доповнення.
   Dashboard → Database → Backups.
2. **GitHub Actions** — `.github/workflows/loops-trd-backup.yml`: щодня `pg_dump` схем `public` і `app`,
   шифрування GPG (AES-256), артефакт зберігається 14 днів.
   Налаштування: Settings → Secrets → `LOOPS_DATABASE_URL` (Session pooler, порт 5432), `LOOPS_BACKUP_PASSPHRASE`;
   Settings → Variables → `LOOPS_BACKUP_ENABLED = true`. Перевірити — Actions → «Loops Trd backup» → Run workflow.

> Пароль `LOOPS_BACKUP_PASSPHRASE` зберігайте окремо (менеджер паролів). Без нього копію не розшифрувати.

## Відновлення з копії GitHub Actions

```bash
# 1. Завантажте артефакт (Actions → запуск → Artifacts) і розшифруйте
gpg --decrypt loops-trd-YYYYMMDD-HHMM.dump.gpg > loops.dump

# 2. Нова порожня база (новий проєкт Supabase або локальний Postgres 15+).
#    Для Supabase спершу створіть ролі anon/authenticated (вони є за замовчуванням).

# 3. Відновлення
pg_restore --no-owner --no-privileges --clean --if-exists -d "$NEW_DATABASE_URL" loops.dump

# 4. Права й RLS (pg_restore з --no-privileges не переносить GRANT):
psql "$NEW_DATABASE_URL" -f web/supabase/migrations/20261001000100_rls.sql      # може попередити про вже наявні політики — це нормально
psql "$NEW_DATABASE_URL" -c "grant select (id, deal_id, actor_id, actor_wallet, action, tx_hash, created_at) on public.deal_events to authenticated;"
```

Після відновлення:
1. Вкажіть новий `DATABASE_URL` у хостингу й перезапустіть сайт.
2. Запустіть кіпер вручну: `curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/keeper` — він звірить
   усі активні угоди з контрактом і підтягне пропущені події.
3. Адмінка → Журнал → «Система»: перевірте, чи немає розбіжностей.

## Перевірка відновлення (раз на місяць)

Відновіть останню копію в тимчасовий локальний Postgres і переконайтеся, що кількість угод/учасників збігається:
`select count(*) from deals; select count(*) from profiles;`
