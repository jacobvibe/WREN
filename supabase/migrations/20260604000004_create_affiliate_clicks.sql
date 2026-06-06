-- Affiliate click events. Insert-only for users — no select policy so
-- click data is write-once from the client and readable only by admins.

create table if not exists affiliate_clicks (
  id         uuid        primary key default gen_random_uuid(),
  user_id    text        not null,
  product_id text        not null,
  retailer   text        not null,
  category   text        not null,
  clicked_at timestamptz not null default now()
);

alter table affiliate_clicks enable row level security;

create policy "users_insert_own"
  on affiliate_clicks
  for insert
  to authenticated
  with check (auth.uid()::text = user_id);

comment on table affiliate_clicks is
  'One row per affiliate link tap. No user-select policy — analytics only.';
