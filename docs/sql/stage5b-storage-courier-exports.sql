-- STAGE 5b: courier-exports storage bucket scoped to the store folder
-- 1. WHAT IT DOES: Replaces the two unscoped storage policies (authenticated SELECT and INSERT for bucket_id = 'courier-exports') with policies
--    that require the first folder of the object path to be a store the caller can access. The ERP uploads to
--    `${storeId}/${fileName}` and reads through createSignedUrl with the user's JWT (BookedOrders.jsx; the master ERP uses the same
--    path), so the first path segment IS the store id.
-- 2. WHEN: AFTER-MERGE group, optional (works with the old ERP too, same path convention).
-- 3. RISK: LOW-MEDIUM (Booked exports).
-- 4. SMOKE TEST: Production ERP (portal.eneezam.com) AND the dev preview: login as admin, creator and staff, Home, Orders (list, Edit Items,
--    cancel on a TEST order only), Booked, Returns, Online Store, Meta Connect, Settings, Team; then drglow.online home / product /
--    cart / checkout. Booked: run an export (upload), open the export history and download a file (signed URL). An export from store
--    A must not be downloadable while logged in to store B only.
-- 5. ROLLBACK: The ROLLBACK block drops the new policies and recreates the two unscoped ones.
-- Apply ONE file at a time. No BEGIN / COMMIT: policies are created first, the old permissive policy is dropped second, RLS / revokes come last,
-- so a failure part-way never locks anyone out. Before-state facts: docs/sql/before-state-facts.md. Order and gating: docs/sql/RUNBOOK.md.

-- NEEDS-CHECK BEFORE APPLYING (read-only): objects whose first path segment is not a store uuid would become unreadable:
--   select count(*) from storage.objects where bucket_id = 'courier-exports' and (storage.foldername(name))[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
--   -- expect 0. If not 0, tell me before applying.

drop policy if exists ne_courier_exports_select on storage.objects;
drop policy if exists ne_courier_exports_insert on storage.objects;
create policy ne_courier_exports_select on storage.objects for select to authenticated
  using (bucket_id = 'courier-exports' and public.has_store_access((storage.foldername(name))[1]));
create policy ne_courier_exports_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'courier-exports' and public.has_store_access((storage.foldername(name))[1]));

-- drop the old unscoped policies of this bucket (names unknown): those mentioning the bucket, not mine
do $$ declare r record; begin
  for r in select policyname from pg_policies
            where schemaname = 'storage' and tablename = 'objects' and policyname not like 'ne\_%' escape '\'
              and (coalesce(qual, '') like '%courier-exports%' or coalesce(with_check, '') like '%courier-exports%') loop
    raise notice 'ROLLBACK RECORD: dropped storage policy %', r.policyname;
    execute format('drop policy %I on storage.objects', r.policyname);
  end loop;
end $$;

-- ============================== VERIFY (read-only)
-- select policyname, cmd, roles, qual, with_check from pg_policies where schemaname = 'storage' and tablename = 'objects' order by policyname;

-- ============================== ROLLBACK
-- drop policy if exists ne_courier_exports_select on storage.objects;
-- drop policy if exists ne_courier_exports_insert on storage.objects;
-- create policy "courier-exports select" on storage.objects for select to authenticated using (bucket_id = 'courier-exports');
-- create policy "courier-exports insert" on storage.objects for insert to authenticated with check (bucket_id = 'courier-exports');
