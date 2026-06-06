-- Allow users to delete their own wear-log entries (undo a mis-logged wear).
-- wears previously had only SELECT and INSERT policies, so a wear logged by
-- mistake could never be removed.

create policy "users_delete_own"
  on wears
  for delete
  to authenticated
  using (auth.uid()::text = user_id);
