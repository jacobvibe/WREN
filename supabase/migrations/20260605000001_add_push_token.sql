-- User profiles: one row per authenticated user.
-- Currently stores the Expo push token for re-engagement notifications.
-- created_at is set on first upsert and never updated — used by pg_cron day-3 / day-7 nudge jobs.

create table if not exists profiles (
  user_id          text        primary key,
  expo_push_token  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "users_select_own" on profiles
  for select to authenticated
  using (auth.uid()::text = user_id);

create policy "users_insert_own" on profiles
  for insert to authenticated
  with check (auth.uid()::text = user_id);

create policy "users_update_own" on profiles
  for update to authenticated
  using  (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

comment on table profiles is
  'One row per authenticated user. expo_push_token is set after the first-outfit milestone and used for re-engagement pushes.';

comment on column profiles.created_at is
  'Set once on first insert. pg_cron nudge jobs use this to target day-3 and day-7 cohorts.';
