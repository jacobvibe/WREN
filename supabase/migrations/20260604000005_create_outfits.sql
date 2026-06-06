-- Outfits: saved collections of clothing items with optional occasion tag.

create table if not exists outfits (
  id          uuid        primary key default gen_random_uuid(),
  user_id     text        not null,
  name        text        not null,
  occasion    text,
  created_at  timestamptz not null default now()
);

alter table outfits enable row level security;

create policy "users_select_own" on outfits
  for select to authenticated
  using (auth.uid()::text = user_id);

create policy "users_insert_own" on outfits
  for insert to authenticated
  with check (auth.uid()::text = user_id);

create policy "users_update_own" on outfits
  for update to authenticated
  using  (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

create policy "users_delete_own" on outfits
  for delete to authenticated
  using (auth.uid()::text = user_id);

comment on table outfits is
  'Saved outfit collections. Cascade-deletes outfit_items on row removal.';

-- Junction table: which items belong to each outfit.

create table if not exists outfit_items (
  id          uuid        primary key default gen_random_uuid(),
  outfit_id   uuid        not null references outfits(id) on delete cascade,
  item_id     uuid        not null references items(id)   on delete cascade,
  created_at  timestamptz not null default now()
);

alter table outfit_items enable row level security;

-- RLS via outfit ownership join — no user_id column needed on this table.
create policy "users_select_own" on outfit_items
  for select to authenticated
  using (
    exists (
      select 1 from outfits
       where outfits.id = outfit_id
         and auth.uid()::text = outfits.user_id
    )
  );

create policy "users_insert_own" on outfit_items
  for insert to authenticated
  with check (
    exists (
      select 1 from outfits
       where outfits.id = outfit_id
         and auth.uid()::text = outfits.user_id
    )
  );

create policy "users_delete_own" on outfit_items
  for delete to authenticated
  using (
    exists (
      select 1 from outfits
       where outfits.id = outfit_id
         and auth.uid()::text = outfits.user_id
    )
  );

comment on table outfit_items is
  'Many-to-many join between outfits and items. Cascade-deleted when either parent is removed.';

-- North Star milestone tracking.
-- Unique (user_id, milestone) prevents double-recording the same achievement.

create table if not exists milestones (
  id           uuid        primary key default gen_random_uuid(),
  user_id      text        not null,
  milestone    text        not null,
  achieved_at  timestamptz not null default now(),
  unique (user_id, milestone)
);

alter table milestones enable row level security;

create policy "users_select_own" on milestones
  for select to authenticated
  using (auth.uid()::text = user_id);

create policy "users_insert_own" on milestones
  for insert to authenticated
  with check (auth.uid()::text = user_id);

comment on table milestones is
  'One row per user per achievement. Used for North Star funnel tracking (e.g. first_outfit_saved).';
