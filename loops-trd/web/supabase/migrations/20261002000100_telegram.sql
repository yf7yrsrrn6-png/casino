-- Loops Trd — сповіщення в Telegram.
create table public.telegram_links (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  chat_id bigint not null unique,
  username text,
  linked_at timestamptz not null default now()
);

create table public.telegram_link_codes (
  code text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null
);

-- Черга відправки (outbox): кожне сповіщення надсилається в Telegram не більше одного разу.
alter table public.notifications add column telegram_sent_at timestamptz;
alter table public.notifications add column telegram_attempts integer not null default 0;
create index notifications_tg_pending on public.notifications (created_at) where telegram_sent_at is null;

alter table public.telegram_links enable row level security;
alter table public.telegram_link_codes enable row level security;
revoke all on public.telegram_links, public.telegram_link_codes from anon, authenticated;
grant select (user_id, username, linked_at) on public.telegram_links to authenticated;
create policy telegram_links_own on public.telegram_links for select to authenticated using (user_id = app.uid());
