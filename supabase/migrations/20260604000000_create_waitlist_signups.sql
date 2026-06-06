-- Waitlist signups for the WREN landing page.
-- Collected before auth is wired; anon INSERT is allowed, no anon reads.

create table if not exists waitlist_signups (
  id                  uuid        primary key default gen_random_uuid(),
  email               text        not null,
  tops_count          int         not null default 0,
  bottoms_count       int         not null default 0,
  dress_count         int         not null default 0,
  combinations_count  int         not null default 0,
  created_at          timestamptz not null default now(),

  constraint email_format check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint unique_email unique (email)
);

alter table waitlist_signups enable row level security;

-- Anyone can sign up — no account required.
create policy "anon_insert"
  on waitlist_signups
  for insert
  to anon
  with check (true);

-- Only service role can read the list (admin/export use cases).
-- No SELECT policy for anon or authenticated roles intentionally.

comment on table waitlist_signups is
  'Pre-launch waitlist signups captured from the WREN landing page.';
