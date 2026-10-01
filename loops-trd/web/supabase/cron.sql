-- Loops Trd — запуск кіпера щохвилини прямо з Supabase (pg_cron + pg_net).
-- Працює незалежно від того, чи відкритий сайт, і від тарифу хостингу.
-- НЕ міграція: виконайте один раз у Supabase → SQL Editor, підставивши свій домен.
--
-- 1) Database → Extensions: увімкніть pg_cron і pg_net (або командами нижче).
-- 2) Збережіть CRON_SECRET у Vault (Project Settings → Vault) з іменем loops_cron_secret,
--    або виконайте:  select vault.create_secret('ВАШ_CRON_SECRET', 'loops_cron_secret');
-- 3) Виконайте цей файл, замінивши https://loops.example.com на адресу сайту.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('loops-trd-keeper') where exists (select 1 from cron.job where jobname = 'loops-trd-keeper');

select cron.schedule(
  'loops-trd-keeper',
  '* * * * *',
  $$
  select net.http_get(
    url := 'https://loops.example.com/api/cron/keeper',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'loops_cron_secret')
    ),
    timeout_milliseconds := 55000
  );
  $$
);

-- Перевірка: останні запуски
-- select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'loops-trd-keeper') order by start_time desc limit 10;
-- select status_code, content from net._http_response order by created desc limit 5;
