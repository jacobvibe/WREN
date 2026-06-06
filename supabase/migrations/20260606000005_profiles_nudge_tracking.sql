-- Track which re-engagement nudges have actually been sent, so we never send
-- the same nudge twice and the day-7 nudge only follows users who got day-3.

alter table profiles
  add column if not exists nudge_day3_sent_at timestamptz,
  add column if not exists nudge_day7_sent_at timestamptz;

comment on column profiles.nudge_day3_sent_at is
  'Set by send-push after the day-3 nudge is delivered. NULL = not yet sent.';
comment on column profiles.nudge_day7_sent_at is
  'Set by send-push after the day-7 nudge is delivered. NULL = not yet sent.';

-- ── Reschedule the cron jobs with de-dup + sequencing guards ──────────────────
-- cron.unschedule errors if the job doesn't exist, so swallow that case.
-- cron.schedule errors if the job already exists, so we must unschedule first.
do $$
begin
  perform cron.unschedule('wren-day-3-push-nudge');
  perform cron.unschedule('wren-day-7-push-nudge');
exception when others then null;
end $$;

-- Day-3: users at day 3 with zero outfits who have NOT already received it.
select cron.schedule(
  'wren-day-3-push-nudge',
  '0 18 * * *',
  $cron$
    select
      net.http_post(
        url     := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-push',
        headers := jsonb_build_object(
                     'Content-Type',  'application/json',
                     'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
                   ),
        body    := jsonb_build_object(
                     'user_id', p.user_id,
                     'nudge',   'day3',
                     'title',   'Your wardrobe is waiting 👗',
                     'body',    'You haven''t saved an outfit yet — it takes 30 seconds.'
                   )
      )
    from profiles p
    where p.created_at::date = now()::date - 3
      and p.expo_push_token is not null
      and p.nudge_day3_sent_at is null
      and not exists (select 1 from outfits o where o.user_id = p.user_id)
      and current_setting('app.settings.supabase_url', true) is not null
      and current_setting('app.settings.service_role_key', true) is not null
  $cron$
);

-- Day-7: users at day 7 with zero outfits who received day-3 but not day-7.
select cron.schedule(
  'wren-day-7-push-nudge',
  '0 18 * * *',
  $cron$
    select
      net.http_post(
        url     := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-push',
        headers := jsonb_build_object(
                     'Content-Type',  'application/json',
                     'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
                   ),
        body    := jsonb_build_object(
                     'user_id', p.user_id,
                     'nudge',   'day7',
                     'title',   'Still time to get organised',
                     'body',    'Open WREN and save your first outfit. Your clothes will thank you.'
                   )
      )
    from profiles p
    where p.created_at::date = now()::date - 7
      and p.expo_push_token is not null
      and p.nudge_day3_sent_at is not null
      and p.nudge_day7_sent_at is null
      and not exists (select 1 from outfits o where o.user_id = p.user_id)
      and current_setting('app.settings.supabase_url', true) is not null
      and current_setting('app.settings.service_role_key', true) is not null
  $cron$
);
