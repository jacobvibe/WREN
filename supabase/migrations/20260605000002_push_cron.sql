-- Push notification cron jobs for day-3 and day-7 re-engagement nudges.
--
-- Prerequisites (run once in Supabase SQL Editor before applying this migration):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'supabase_url');
--   select vault.create_secret('<service-role-key>', 'service_role_key');
--
-- Both extensions are enabled by default on hosted Supabase projects.

create extension if not exists pg_cron  with schema extensions;
create extension if not exists pg_net   with schema extensions;

grant usage on schema cron to postgres;

-- ── Day-3 nudge ───────────────────────────────────────────────────────────────
-- Target: users who signed up exactly 3 days ago and still have zero outfits.

select cron.schedule(
  'wren-day-3-push-nudge',
  '0 18 * * *',
  $cron$
    select
      net.http_post(
        url     := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url') || '/functions/v1/send-push',
        headers := jsonb_build_object(
                     'Content-Type',  'application/json',
                     'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
                   ),
        body    := jsonb_build_object(
                     'user_id', p.user_id,
                     'title',   'Your wardrobe is waiting 👗',
                     'body',    'You haven''t saved an outfit yet — it takes 30 seconds.'
                   )
      )
    from profiles p
    where p.created_at::date = now()::date - 3
      and p.expo_push_token is not null
      and not exists (
        select 1 from outfits o where o.user_id = p.user_id
      )
      and exists (select 1 from vault.decrypted_secrets where name = 'supabase_url')
      and exists (select 1 from vault.decrypted_secrets where name = 'service_role_key')
  $cron$
);

-- ── Day-7 nudge ───────────────────────────────────────────────────────────────
-- Same condition, 7 days out. Different message tone.

select cron.schedule(
  'wren-day-7-push-nudge',
  '0 18 * * *',
  $cron$
    select
      net.http_post(
        url     := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url') || '/functions/v1/send-push',
        headers := jsonb_build_object(
                     'Content-Type',  'application/json',
                     'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
                   ),
        body    := jsonb_build_object(
                     'user_id', p.user_id,
                     'title',   'Still time to get organised',
                     'body',    'Open WREN and save your first outfit. Your clothes will thank you.'
                   )
      )
    from profiles p
    where p.created_at::date = now()::date - 7
      and p.expo_push_token is not null
      and not exists (
        select 1 from outfits o where o.user_id = p.user_id
      )
      and exists (select 1 from vault.decrypted_secrets where name = 'supabase_url')
      and exists (select 1 from vault.decrypted_secrets where name = 'service_role_key')
  $cron$
);
