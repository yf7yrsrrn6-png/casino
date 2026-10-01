-- Loops Trd — Row Level Security.
-- Принцип: учасник бачить лише своє; модератор/адмін — усе для розгляду; запис статусів — лише сервер.

-- ─── Допоміжні функції ────────────────────────────────────────────────────
create or replace function app.uid() returns uuid
language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;

-- SECURITY DEFINER, щоб не було рекурсії RLS на profiles. Роль береться з БД, а не з JWT.
create or replace function app.my_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = app.uid() and status = 'approved'
$$;

create or replace function app.is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = app.uid() and status = 'approved')
$$;

create or replace function app.is_staff() returns boolean
language sql stable as $$ select coalesce(app.my_role() in ('moderator', 'admin'), false) $$;

create or replace function app.is_admin() returns boolean
language sql stable as $$ select coalesce(app.my_role() = 'admin', false) $$;

-- ─── Увімкнення RLS на всіх таблицях ──────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'invite_codes', 'auth_nonces', 'change_requests', 'user_devices', 'user_ips',
    'card_history', 'wallet_history', 'blacklist', 'offers', 'deals', 'deal_messages', 'deal_events',
    'disputes', 'risk_assessments', 'antifraud_settings', 'notifications', 'staff_actions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ─── Права на рівні об'єктів ──────────────────────────────────────────────
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public, app to authenticated;
grant execute on all functions in schema app to authenticated;
grant select on
  public.profiles, public.change_requests, public.user_devices, public.user_ips, public.card_history,
  public.wallet_history, public.blacklist, public.offers, public.deals, public.deal_messages,
  public.deal_events, public.disputes, public.risk_assessments, public.antifraud_settings,
  public.notifications, public.staff_actions, public.invite_codes, public.public_profiles
to authenticated;
grant insert (user_id, side, price_uah, min_usdt, max_usdt, payment_methods, terms) on public.offers to authenticated;
grant update (price_uah, min_usdt, max_usdt, payment_methods, terms, is_active, updated_at) on public.offers to authenticated;
grant insert (deal_id, sender_id, body) on public.deal_messages to authenticated;
grant update (read_at) on public.notifications to authenticated;
-- auth_nonces: жодного доступу для клієнтів.

-- ─── Політики ─────────────────────────────────────────────────────────────
create policy profiles_select on public.profiles for select to authenticated
  using (id = app.uid() or app.is_staff());

create policy invite_codes_admin on public.invite_codes for select to authenticated
  using (app.is_admin());

create policy change_requests_select on public.change_requests for select to authenticated
  using (user_id = app.uid() or app.is_staff());

create policy user_devices_staff on public.user_devices for select to authenticated using (app.is_staff());
create policy user_ips_staff on public.user_ips for select to authenticated using (app.is_staff());
create policy card_history_staff on public.card_history for select to authenticated using (app.is_staff());
create policy wallet_history_staff on public.wallet_history for select to authenticated using (app.is_staff());
create policy blacklist_staff on public.blacklist for select to authenticated using (app.is_staff());

create policy offers_select on public.offers for select to authenticated
  using ((is_active and app.is_approved()) or user_id = app.uid() or app.is_staff());
create policy offers_insert on public.offers for insert to authenticated
  with check (user_id = app.uid() and app.is_approved());
create policy offers_update on public.offers for update to authenticated
  using (user_id = app.uid() and app.is_approved())
  with check (user_id = app.uid());

create policy deals_select on public.deals for select to authenticated
  using (buyer_id = app.uid() or seller_id = app.uid() or app.is_staff());

-- Підзапит до deals теж проходить через RLS, тож чужі угоди недоступні.
create policy deal_messages_select on public.deal_messages for select to authenticated
  using (exists (select 1 from public.deals d where d.id = deal_id));
create policy deal_messages_insert on public.deal_messages for insert to authenticated
  with check (
    sender_id = app.uid()
    and app.is_approved()
    and exists (
      select 1 from public.deals d
      where d.id = deal_id and (d.buyer_id = app.uid() or d.seller_id = app.uid() or app.is_staff())
    )
  );

create policy deal_events_select on public.deal_events for select to authenticated
  using (exists (select 1 from public.deals d where d.id = deal_id));

create policy disputes_select on public.disputes for select to authenticated
  using (exists (select 1 from public.deals d where d.id = deal_id));

-- Сигнали ризику бачить лише персонал, щоб учасники не підлаштовувались під правила.
create policy risk_assessments_staff on public.risk_assessments for select to authenticated using (app.is_staff());
create policy antifraud_settings_staff on public.antifraud_settings for select to authenticated using (app.is_staff());

create policy notifications_select on public.notifications for select to authenticated
  using (user_id = app.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = app.uid()) with check (user_id = app.uid());

-- Модератор бачить власні дії, адмін — усі.
create policy staff_actions_select on public.staff_actions for select to authenticated
  using (app.is_admin() or (app.is_staff() and actor_id = app.uid()));
