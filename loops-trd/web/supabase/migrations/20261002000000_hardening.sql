-- Loops Trd — посилення безпеки та надійності (аудит).

-- ─── 1. Журнал угод: службові деталі (пояснення антифроду) недоступні учасникам ─────
-- Учасники бачать лише «що, коли, хто»; деталі читає сервер для персоналу.
revoke select on public.deal_events from authenticated;
grant select (id, deal_id, actor_id, actor_wallet, action, tx_hash, created_at) on public.deal_events to authenticated;

-- ─── 2. Публічні картки — лише для підтверджених учасників ───────────────────────────
create or replace view public.public_profiles as
  select id, display_name, role, successful_deals, disputes_count, disputes_lost, created_at
  from public.profiles
  where status = 'approved' and app.is_approved();

-- ─── 3. Оголошення: обмеження на рівні БД (навіть якщо хтось пише напряму через API Supabase) ──
alter table public.offers add constraint offers_payment_methods_allowed check (
  payment_methods <@ array['Monobank', 'ПриватБанк', 'ПУМБ', 'А-Банк', 'Sense Bank', 'Ощадбанк', 'Райффайзен', 'Готівка']::text[]
);
alter table public.offers add constraint offers_price_sane check (price_uah between 1 and 1000);
alter table public.offers add constraint offers_amount_sane check (max_usdt <= 1000000);

create or replace function app.offers_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_active and (
    select count(*) from public.offers where user_id = new.user_id and is_active and id <> new.id
  ) >= 10 then
    raise exception 'Не більше 10 активних оголошень' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger offers_limit before insert or update of is_active on public.offers
  for each row execute function app.offers_limit();

-- ─── 4. Обмеження частоти запитів (працює й на serverless — стан у БД) ────────────────
create table public.rate_limits (
  key text primary key,
  count integer not null default 0,
  expires_at timestamptz not null
);

-- ─── 5. Відкликані сесії (вихід) ──────────────────────────────────────────────────────
create table public.revoked_sessions (
  jti text primary key,
  expires_at timestamptz not null
);

-- ─── 6. Системні події: помилки кіпера, розбіжності з блокчейном, низький баланс газу ──
create table public.system_events (
  id bigint generated always as identity primary key,
  level text not null check (level in ('info', 'warn', 'error')),
  source text not null,
  message text not null,
  context jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index system_events_created on public.system_events (created_at desc);

-- ─── 7. Курсор індексатора подій контракту ────────────────────────────────────────────
create table public.chain_cursor (
  id text primary key,
  last_block bigint not null,
  updated_at timestamptz not null default now()
);

alter table public.rate_limits enable row level security;
alter table public.revoked_sessions enable row level security;
alter table public.system_events enable row level security;
alter table public.chain_cursor enable row level security;
revoke all on public.rate_limits, public.revoked_sessions, public.chain_cursor from anon, authenticated;
revoke all on public.system_events from anon;
grant select on public.system_events to authenticated;
create policy system_events_admin on public.system_events for select to authenticated using (app.is_admin());
