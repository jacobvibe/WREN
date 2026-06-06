-- Private Storage bucket for item cut-out images.
--
-- Items used to store the cut-out as a data: URI directly in items.image_url,
-- which pulled megabytes of base64 through every wardrobe query. Cut-outs now
-- live here as <userId>/<itemId>.png and image_url stores the object path.
--
-- The bucket is PRIVATE: no public reads. Each user may read/write/delete ONLY
-- files under their own <auth.uid()>/ prefix, enforced via storage.objects RLS.
-- The app displays images through short-lived signed URLs (see src/lib/item-images.ts).

insert into storage.buckets (id, name, public)
values ('items', 'items', false)
on conflict (id) do update set public = false;

-- storage.objects already has RLS enabled by Supabase. Scope each policy to this
-- bucket and to the caller's own top-level folder (= their user id).

drop policy if exists "items_read_own" on storage.objects;
create policy "items_read_own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'items'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "items_insert_own" on storage.objects;
create policy "items_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'items'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "items_update_own" on storage.objects;
create policy "items_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'items'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'items'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "items_delete_own" on storage.objects;
create policy "items_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'items'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
