-- Wear events: each row records a user wearing an item on a given day.
-- item_id cascades on delete so wears are cleaned up with their parent item.

create table if not exists wears (
  id       uuid        primary key default gen_random_uuid(),
  item_id  uuid        not null references items(id) on delete cascade,
  user_id  text        not null,
  worn_at  timestamptz not null default now()
);

alter table wears enable row level security;

create policy "users_select_own"
  on wears
  for select
  to authenticated
  using (auth.uid()::text = user_id);

create policy "users_insert_own"
  on wears
  for insert
  to authenticated
  with check (auth.uid()::text = user_id);

comment on table wears is
  'One row per wear event. Enables per-item wear frequency and last-worn queries.';
