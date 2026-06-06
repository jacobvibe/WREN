-- Clothing items added by users.
-- During onboarding (pre-auth) user_id = 'onboarding-placeholder'.
-- Once auth is wired, the anon_insert policy will be removed and
-- user_id will be set to auth.uid()::text.

create table if not exists items (
  id          uuid        primary key default gen_random_uuid(),
  user_id     text        not null,
  image_url   text        not null,
  category    text        not null,
  tags        text[]      not null default '{}',
  name        text,
  created_at  timestamptz not null default now()
);

alter table items enable row level security;

-- Pre-auth onboarding: allow anonymous inserts.
-- NOTE: This policy is dropped in migration 20260606000001_drop_anon_insert_policy.sql
-- now that auth is fully wired. Onboarding items are inserted via the
-- authenticated flow with a session_token instead.
create policy "anon_insert_onboarding"
  on items
  for insert
  to anon
  with check (true);

-- Authenticated users read and write only their own rows.
create policy "users_select_own"
  on items
  for select
  to authenticated
  using (auth.uid()::text = user_id);

create policy "users_insert_own"
  on items
  for insert
  to authenticated
  with check (auth.uid()::text = user_id);

create policy "users_update_own"
  on items
  for update
  to authenticated
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

create policy "users_delete_own"
  on items
  for delete
  to authenticated
  using (auth.uid()::text = user_id);

comment on table items is
  'Clothing items added by users. image_url stores a data URI during onboarding; migrate to Supabase Storage once auth is live.';

comment on column items.user_id is
  'auth.uid()::text for authenticated users; ''onboarding-placeholder'' during pre-auth onboarding.';
