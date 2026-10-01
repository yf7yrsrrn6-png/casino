-- Loops Trd — початкова схема.
-- Авторизація: власний SIWE-вхід → сервер видає Supabase-сумісний JWT (sub = profiles.id, role = authenticated).
-- Запити від імені користувача виконуються під роллю `authenticated` з request.jwt.claims → працює RLS.
-- Привілейовані операції (зміна статусів угод, рішення адмінів) виконує лише сервер після перевірки прав.

-- ─── Ролі (у Supabase вже існують) ────────────────────────────────────────
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
-- Серверне з'єднання має право перемикатися на роль authenticated (SET LOCAL ROLE).
do $$ begin execute format('grant authenticated to %I', current_user); exception when others then null; end $$;

create schema if not exists app;

-- ─── Типи ─────────────────────────────────────────────────────────────────
create type public.app_role as enum ('member', 'moderator', 'admin');
create type public.verification_status as enum ('pending', 'approved', 'rejected', 'blocked');
create type public.offer_side as enum ('buy', 'sell');
create type public.deal_status as enum (
  'awaiting_deposit', 'funded', 'paid', 'released', 'cancelled', 'disputed', 'resolved', 'blocked'
);
create type public.risk_level as enum ('low', 'medium', 'high');
create type public.dispute_status as enum ('open', 'recommended', 'resolved');
create type public.fraud_label as enum ('fraud', 'honest');
create type public.blacklist_kind as enum ('wallet', 'card', 'device', 'ip');
create type public.change_kind as enum ('card', 'wallet');
create type public.request_status as enum ('pending', 'approved', 'rejected');

-- ─── Учасники ─────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null unique check (wallet_address ~ '^0x[0-9a-f]{40}$'),
  role public.app_role not null default 'member',
  status public.verification_status not null default 'pending',
  display_name text check (char_length(display_name) between 2 and 40),
  telegram text check (telegram ~ '^@[A-Za-z0-9_]{5,32}$'),
  card_holder_name text check (char_length(card_holder_name) between 3 and 80),
  card_last4 text check (card_last4 ~ '^[0-9]{4}$'),
  profile_completed boolean not null default false,
  single_limit_override numeric(20, 2) check (single_limit_override > 0),
  daily_limit_override numeric(20, 2) check (daily_limit_override > 0),
  successful_deals integer not null default 0,
  disputes_count integer not null default 0,
  disputes_lost integer not null default 0,
  status_reason text,
  approved_at timestamptz,
  approved_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  code_hint text not null,
  note text check (char_length(note) <= 200),
  created_by uuid references public.profiles (id),
  expires_at timestamptz not null,
  used_by uuid references public.profiles (id),
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- Одноразові nonce для SIWE-входу та підпису критичних дій.
create table public.auth_nonces (
  nonce text primary key,
  purpose text not null check (purpose in ('login', 'action')),
  wallet_address text,
  payload jsonb,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.change_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.change_kind not null,
  new_card_holder_name text,
  new_card_last4 text check (new_card_last4 ~ '^[0-9]{4}$'),
  new_wallet_address text check (new_wallet_address ~ '^0x[0-9a-f]{40}$'),
  status public.request_status not null default 'pending',
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);
create unique index change_requests_one_pending on public.change_requests (user_id, kind) where status = 'pending';

-- Історія для графа зв'язків.
create table public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  device_hash text not null,
  user_agent text,
  timezone text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  seen_count integer not null default 1,
  unique (user_id, device_hash)
);
create index user_devices_hash on public.user_devices (device_hash);

create table public.user_ips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  ip text not null,
  proxy_suspected boolean not null default false,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  seen_count integer not null default 1,
  unique (user_id, ip)
);
create index user_ips_ip on public.user_ips (ip);

create table public.card_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  card_last4 text not null,
  card_holder_name text not null,
  created_at timestamptz not null default now()
);
create index card_history_last4 on public.card_history (card_last4);

create table public.wallet_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  wallet_address text not null,
  created_at timestamptz not null default now()
);
create index wallet_history_wallet on public.wallet_history (wallet_address);

create table public.blacklist (
  id uuid primary key default gen_random_uuid(),
  kind public.blacklist_kind not null,
  value text not null,
  reason text not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (kind, value)
);

-- ─── Оголошення та угоди ──────────────────────────────────────────────────
create table public.offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  side public.offer_side not null, -- сторона автора: sell = автор продає USDT
  price_uah numeric(12, 2) not null check (price_uah > 0),
  min_usdt numeric(20, 2) not null check (min_usdt > 0),
  max_usdt numeric(20, 2) not null,
  payment_methods text[] not null check (cardinality(payment_methods) between 1 and 10),
  terms text check (char_length(terms) <= 500),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_usdt >= min_usdt)
);
create index offers_active on public.offers (is_active, side);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  chain_deal_id text not null unique check (chain_deal_id ~ '^0x[0-9a-f]{64}$'),
  offer_id uuid references public.offers (id),
  seller_id uuid not null references public.profiles (id),
  buyer_id uuid not null references public.profiles (id),
  seller_wallet text not null,
  buyer_wallet text not null,
  amount_usdt numeric(20, 2) not null check (amount_usdt > 0),
  price_uah numeric(12, 2) not null check (price_uah > 0),
  total_uah numeric(14, 2) not null,
  payment_method text not null,
  status public.deal_status not null default 'awaiting_deposit',
  frozen boolean not null default false,
  release_approved boolean not null default false,
  risk_level public.risk_level,
  risk_score integer,
  release_check text check (release_check in ('none', 'wallet_signature', 'staff')),
  release_check_done boolean not null default false,
  buyer_sender_name text,
  sender_name_mismatch boolean not null default false,
  payment_deadline timestamptz,
  funded_at timestamptz,
  paid_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (seller_id <> buyer_id)
);
create index deals_seller on public.deals (seller_id, created_at desc);
create index deals_buyer on public.deals (buyer_id, created_at desc);
create index deals_status on public.deals (status);

create table public.deal_messages (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  sender_id uuid references public.profiles (id),
  is_system boolean not null default false,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index deal_messages_deal on public.deal_messages (deal_id, created_at);

-- Журнал усіх дій в угодах (час, адреса гаманця, дія).
create table public.deal_events (
  id bigint generated always as identity primary key,
  deal_id uuid not null references public.deals (id) on delete cascade,
  actor_id uuid references public.profiles (id),
  actor_wallet text,
  action text not null,
  details jsonb not null default '{}',
  tx_hash text,
  created_at timestamptz not null default now()
);
create index deal_events_deal on public.deal_events (deal_id, created_at);

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null unique references public.deals (id) on delete cascade,
  opened_by uuid not null references public.profiles (id),
  reason text not null check (char_length(reason) between 5 and 1000),
  status public.dispute_status not null default 'open',
  moderator_id uuid references public.profiles (id),
  recommendation text,
  recommended_to_buyer numeric(20, 2),
  recommended_at timestamptz,
  admin_id uuid references public.profiles (id),
  resolution_to_buyer numeric(20, 2),
  resolution_note text,
  resolve_tx_hash text,
  resolved_at timestamptz,
  fraud_label public.fraud_label,
  labeled_by uuid references public.profiles (id),
  labeled_at timestamptz,
  created_at timestamptz not null default now()
);

-- ─── Антифрод ─────────────────────────────────────────────────────────────
create table public.risk_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  deal_id uuid references public.deals (id) on delete cascade,
  stage text not null,
  score integer not null,
  level public.risk_level not null,
  decision text not null check (decision in ('allow', 'confirm', 'freeze', 'block')),
  hard_rule text,
  signals jsonb not null default '[]',
  context jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index risk_assessments_deal on public.risk_assessments (deal_id);
create index risk_assessments_user on public.risk_assessments (user_id, created_at desc);

create table public.antifraud_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

-- ─── Сповіщення та журнал персоналу ───────────────────────────────────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user on public.notifications (user_id, created_at desc);

create table public.staff_actions (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id),
  actor_wallet text,
  actor_role public.app_role,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}',
  signature text,
  created_at timestamptz not null default now()
);
create index staff_actions_created on public.staff_actions (created_at desc);

-- Публічна (для учасників) картка контрагента: без реквізитів.
create view public.public_profiles as
  select id, display_name, role, successful_deals, disputes_count, disputes_lost, created_at
  from public.profiles
  where status = 'approved';
