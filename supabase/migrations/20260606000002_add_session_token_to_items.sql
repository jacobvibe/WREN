-- Add a per-onboarding-session token to items.
--
-- During onboarding the client generates a random UUID and stamps it on every
-- item it inserts. claim-onboarding-items reassigns items to the new account by
-- matching BOTH the anonymous user id AND this token, so two people onboarding
-- at the same time can never claim each other's pre-auth items.
--
-- Nullable: items created after onboarding (in the main app) have no token.

alter table items
  add column if not exists session_token text;

comment on column items.session_token is
  'Per-onboarding-session UUID. Set only on items created during pre-auth onboarding; used by claim-onboarding-items to reassign exactly this session''s items. NULL for items created in the main app.';
