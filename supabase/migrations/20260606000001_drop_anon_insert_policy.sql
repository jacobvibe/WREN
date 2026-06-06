-- Drop the anonymous insert policy on items.
--
-- The "anon_insert_onboarding" policy allowed any anonymous caller to insert
-- items with an arbitrary user_id. Combined with the item-cap trigger exempting
-- user_id = 'onboarding-placeholder', this let unauthenticated callers insert
-- unlimited arbitrary rows. Auth is now fully wired, so anonymous inserts are
-- no longer needed: onboarding items are created through the authenticated
-- client (see session_token migration) and claimed on sign-up.

drop policy if exists "anon_insert_onboarding" on items;
